/**
 * @fileoverview rootless dockerd 启动器（ADR-0074 权限门禁第三级：无 root/sudo 时的兜底）
 *
 * 目标机既无 root 也无可用 sudo 时，用「用户命名空间 + 包内静态 dockerd」跑容器。
 * 内核硬约束（本模块据此设计，勿绕）：
 *   - 非特权进程只能写「单段 0→euid」uid/gid 映射；多段 subuid/subgid 映射必须由
 *     init 命名空间的 CAP_SETUID 写入 = setuid-root 的 newuidmap/newgidmap（uidmap 包，
 *     OS 提供，无法打包）。故用 C 助手 rootless-ns 做父子协调：子进程 unshare(CLONE_NEWUSER)
 *     后阻塞，父进程（仍在 init ns）对子 pid 跑 newuidmap/newgidmap 写完整多段映射，再放行。
 *   - dockerd 必须跑在自己拥有的 netns 里（setns 进 netns 需该 netns 所属 userns 的
 *     CAP_SYS_ADMIN）→ 由 slirp4netns 建 netns + 用户态网络 + hostfwd 暴露端口给真实宿主。
 *   - cgroup v2：userns 内 cgroup 根不可写 → --cgroup-parent 指向用户已委派的
 *     user@UID.service/cloudcad-docker（宿主侧由本模块 best-effort 创建）。
 *
 * 命名空间分工：
 *   - rootless-ns（C 助手）：建 user+mount+ipc ns、协调 uid/gid 映射、exec setup 脚本。
 *   - setup 脚本（本模块生成）：/run 影子 bind（socket 对宿主可见）+ /etc overlay + DNS
 *     修复 + slirp4netns 建 netns 并拉起 dockerd（或无 slirp4netns 时降级 plain netns）。
 *
 * 网络模型：rootless 模式下宿主进程（协同/转换/运维中心）跑在**真实宿主**（不进子 netns——
 *   宿主侧 nsenter 进子 userns 拥有的 netns 会 EPERM，实测不可行）；app 容器（子 netns）经
 *   slirp4netns 的 guest→host 通道访问宿主进程（宿主 IP 恒 10.0.2.2，由 index.js 的
 *   applyRootlessHostUrls 写入 COOPERATE_URL/CONVERSION_SERVICE_URL）；真实宿主经 slirp4netns
 *   hostfwd 访问 app 容器的前端/后端端口（step4 拉起 dockerd 时按 .env 端口建立）。
 *   DB/Redis 容器与 app 同处子 netns，恒 localhost 互通，无需改。
 *
 * 仅依赖 node 内置。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

/**
 * 在 PATH 中查找可执行文件，返回绝对路径或 null。
 * @param {string} cmd
 * @returns {string|null}
 */
function which(cmd) {
  const r = spawnSync(`command -v ${cmd} 2>/dev/null || true`, { shell: true, encoding: 'utf8' });
  const out = (r.stdout || '').trim();
  return out || null;
}

/**
 * 读 /etc/subuid 或 /etc/subgid 中指定用户的首条范围。
 * @param {string} file
 * @param {string} user
 * @returns {{start:number,count:number}|null}
 */
function readSubid(file, user) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split('\n')) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      if (line.slice(0, idx) !== user) continue;
      const rest = line.slice(idx + 1);
      const cidx = rest.indexOf(':');
      if (cidx < 0) continue;
      const start = parseInt(rest.slice(0, cidx), 10);
      const count = parseInt(rest.slice(cidx + 1), 10);
      if (start > 0 && count > 0) return { start, count };
    }
  } catch {
    /* 文件不存在或不可读 */
  }
  return null;
}

/**
 * 读 pidfile，返回正整数 pid 或 null。
 * @param {string} pidFile
 * @returns {number|null}
 */
function readPid(pidFile) {
  try {
    const n = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    if (Number.isInteger(n) && n > 0 && fs.existsSync(`/proc/${n}`)) return n;
  } catch {
    /* 无 pidfile 或进程已退出 */
  }
  return null;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * rootless dockerd 是否已就绪（经指定 DOCKER_HOST 的 docker CLI 能取到 Server 版本）。
 * @param {string} dockerHost 形如 unix:///path/to/docker.sock
 * @param {string} dockerDir 包内 docker/ 目录（含 docker CLI）
 * @returns {boolean}
 */
function isDockerReady(dockerHost, dockerDir) {
  const cli = path.join(dockerDir, 'docker');
  if (!fs.existsSync(cli)) return false;
  const r = spawnSync(
    `${cli} -H ${dockerHost} version --format '{{.Server.Version}}' 2>/dev/null`,
    { shell: true, encoding: 'utf8', timeout: 15000 }
  );
  return r.status === 0 && (r.stdout || '').trim().length > 0;
}

/**
 * 计算 rootless dockerd 的 --cgroup-parent（cgroup v2 委派子树）。
 * cgroup v1 或无委派时返回 ''（dockerd 用默认层级）。
 * @param {number} realUid 真实宿主 uid（userns 内 id -u 恒为 0，必须用宿主 uid）
 * @returns {string}
 */
function buildCgroupParent(realUid) {
  try {
    if (fs.existsSync('/sys/fs/cgroup/cgroup.controllers')) {
      const userSlice = `/sys/fs/cgroup/user.slice/user-${realUid}.slice/user@${realUid}.service`;
      if (fs.existsSync(userSlice)) {
        return `/user.slice/user-${realUid}.slice/user@${realUid}.service/cloudcad-docker`;
      }
    }
  } catch {
    /* 忽略，回退默认 */
  }
  return '';
}

/**
 * 宿主侧 best-effort 创建委派 cgroup 并启用控制器（cgroup v2）。
 * 失败不致命（dockerd 可能仍能跑，或报清晰错误）。
 * @param {string} cgroupParent buildCgroupParent 的结果（相对 cgroup 根的路径）
 * @param {Function} [log]
 */
function ensureCgroup(cgroupParent, log = () => {}) {
  if (!cgroupParent) return;
  try {
    const abs = path.join('/sys/fs/cgroup', cgroupParent);
    const parent = path.dirname(abs);
    fs.mkdirSync(abs, { recursive: true });
    // 启用所需控制器到父层（幂等：重复 echo 已启用的控制器不报错）
    for (const c of ['memory', 'pids', 'cpu']) {
      try {
        fs.appendFileSync(path.join(parent, 'cgroup.subtree_control'), `+${c}\n`);
      } catch {
        /* 该控制器不可用或未委派，忽略 */
      }
    }
    log(`[rootless] cgroup 委派就绪：${cgroupParent}`);
  } catch (err) {
    log(`[rootless] cgroup 委派创建失败（best-effort，dockerd 可能仍可用）：${err.message}`);
  }
}

/**
 * 生成 rootless setup 脚本内容（POSIX sh）。
 * 由 rootless-ns 在 user+mount+ipc ns 内、映射写好后 exec 执行。
 * @param {Object} p
 * @returns {string}
 */
function renderSetupScript(p) {
  const { shadowRun, etcLower, etcUpper, etcWork, slirp, dockerd, dockerdArgs, cgroupParent, realUid, ports } = p;
  const cgArg = cgroupParent ? ` --cgroup-parent=${cgroupParent}` : '';
  // slirp4netns hostfwd：把宿主端口转发进子 netns（无端口则为空串）
  const hostfwd = ports.map((port) => `-e ${port}:${port}`).join(' ');
  const slirpPath = slirp || '';
  return `#!/bin/sh
# 由 lib/rootless.js 生成 —— rootless dockerd setup（在 user+mount+ipc ns 内运行，uid=0）
set -e

SHADOW_RUN="${shadowRun}"
mkdir -p "$SHADOW_RUN"

# 1) DNS 兜底：在任何挂载前读宿主 nameserver（/etc/resolv.conf 可能是指向 /run/* 的符号链接）
NS="$(grep '^nameserver' /etc/resolv.conf 2>/dev/null | head -5 || true)"

# 2) /run 影子 bind：dockerd 的 unix socket 落在此影子目录，对真实宿主可见
mount --bind "$SHADOW_RUN" /run

# 3) /etc overlay：lower=真实 /etc（bind），upper=影子（可写），使 dockerd 可写 /etc 而不污染宿主
mkdir -p "${etcLower}" "${etcUpper}" "${etcWork}"
if [ -n "$NS" ]; then printf '%s\\n' "$NS" > "${etcUpper}/resolv.conf"; fi
mount --bind /etc "${etcLower}"
mount -t overlay overlay -o lowerdir=${etcLower},upperdir=${etcUpper},workdir=${etcWork} /etc

# 4) netns + dockerd（socket/数据目录/cgroup 参数已含在 DOCKERD_ARGS）
DOCKERD="${dockerd}"
DOCKERD_ARGS="${dockerdArgs}${cgArg}"
REAL_UID="${realUid}"

# 4a) 有 slirp4netns：完整用户态网络 + hostfwd 暴露端口给真实宿主
if [ -n "${slirpPath}" ] && [ -x "${slirpPath}" ]; then
  # 动态 slirp4netns（发行版 1.0.1）需 LD_LIBRARY_PATH 找 libslirp（静态 v1.2.x 无此依赖，设了也无害）
  SLIRP_LIBDIR="$(dirname "${slirpPath}")/lib"
  [ -d "\${SLIRP_LIBDIR}" ] && export LD_LIBRARY_PATH="\${SLIRP_LIBDIR}\${LD_LIBRARY_PATH:+:\${LD_LIBRARY_PATH}}"
  # 按 slirp4netns 版本分支：1.2.x「TAPNAME PROGRAM」(slirp 自拉 dockerd) vs 1.0.x「PID|PATH TAPNAME」(先起 dockerd 再附着)
  SLIRP_VER="$("${slirpPath}" --version 2>/dev/null | head -1 | grep -oE '[0-9]+\\.[0-9]+' | head -1)"
  case "\${SLIRP_VER}" in
    1.0*)
      # 1.0.x 附着模型：先后台起 dockerd，再 slirp 附着其 netns 建 tap0 通网
      # （1.0.x 不支持 hostfwd -e port:port，有端口时仅告警——打包侧 ports 为空不受影响）
      if [ -n "${hostfwd}" ]; then
        echo "[rootless] 警告：slirp4netns \${SLIRP_VER} 不支持 hostfwd，服务端口将无法暴露给真实宿主（仅 ns 内互通）" >&2
      fi
      "$DOCKERD" $DOCKERD_ARGS &
      DOCKERD_PID=$!
      "${slirpPath}" -c --netns-type=pid "\${DOCKERD_PID}" tap0 &
      SLIRP_PID=$!
      # 脚本存活与 dockerd 绑定：dockerd 退出即清理 slirp 并结束（rootless-ns 据此回收 netns）
      wait "\${DOCKERD_PID}" || true
      kill "\${SLIRP_PID}" 2>/dev/null || true
      ;;
    *)
      # 1.2.x+：slirp4netns 自拉 dockerd（原语法，支持 hostfwd）
      exec "${slirpPath}" tap0 ${hostfwd} "$DOCKERD" $DOCKERD_ARGS
      ;;
  esac
fi

# 4b) 无 slirp4netns：降级 plain netns（仅 loopback，服务端口对真实宿主不可达）
echo "[rootless] 警告：slirp4netns 不可用，降级为 plain netns —— dockerd 可运行，但容器服务端口对真实宿主不可达（仅 ns 内 localhost 互通）。安装 slirp4netns 后重跑 start.sh 可获完整网络。" >&2
exec unshare -n sh -c "ip link set lo up; exec $DOCKERD $DOCKERD_ARGS"
`;
}

/**
 * rootless 硬前置检查。
 * @param {Object} opts
 * @param {string} opts.toolsDir 包内 rootless 工具目录（含 rootless-ns，可选 slirp4netns）
 * @param {Function} [opts.log]
 * @returns {{ok:boolean, missing:{name:string,hint:string}[], notes:string[],
 *   subuid:{start:number,count:number}|null, subgid:{start:number,count:number}|null,
 *   newuidmap:string|null, newgidmap:string|null, slirp4netns:string|null}}
 */
function checkPrerequisites({ toolsDir, log = () => {} }) {
  const missing = [];
  const notes = [];
  const user = os.userInfo().username;
  const uid = process.getuid();

  // rootless-ns 二进制（包内，硬前置：缺失则完全无法启动）
  const nsBin = path.join(toolsDir, 'rootless-ns');
  if (!fs.existsSync(nsBin)) {
    missing.push({ name: 'rootless-ns', hint: `包内 rootless-ns 二进制缺失（${nsBin}），部署包不完整，rootless 无法启动` });
  }

  // newuidmap/newgidmap（setuid，OS 提供）—— 多段映射硬前置（无它仅能跑全 0:0 属主镜像）
  const newuidmap = which('newuidmap');
  const newgidmap = which('newgidmap');
  if (!newuidmap || !newgidmap) {
    missing.push({
      name: 'newuidmap/newgidmap',
      hint:
        '未找到 setuid 的 newuidmap/newgidmap（uidmap 包）。rootless 运行真实镜像（非 0:0 属主）必须靠它写多段 subuid/subgid 映射。' +
        '安装：Debian/Ubuntu `sudo apt install uidmap`；RHEL/CentOS `sudo dnf install uidmap`。' +
        '缺失时降级为单段映射（仅能跑全 0:0 属主镜像，CloudCAD 镜像不适用）。',
    });
  }

  // subuid/subgid 范围
  const subuid = readSubid('/etc/subuid', user);
  const subgid = readSubid('/etc/subgid', user);
  if (!subuid || !subgid) {
    missing.push({
      name: 'subuid/subgid',
      hint: `用户 ${user} 未配置 subuid/subgid 范围（多段映射所需）。请管理员执行：sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 ${user}`,
    });
  }

  // slirp4netns（系统或包内）—— 用户态网络 + 端口暴露
  const slirp4netns =
    which('slirp4netns') || (fs.existsSync(path.join(toolsDir, 'slirp4netns')) ? path.join(toolsDir, 'slirp4netns') : null);
  if (!slirp4netns) {
    missing.push({
      name: 'slirp4netns',
      hint:
        '未找到 slirp4netns（rootless 用户态网络，负责建 netns 并把服务端口暴露给真实宿主）。' +
        '安装：Debian/Ubuntu `sudo apt install slirp4netns`；RHEL/CentOS `sudo dnf install slirp4netns`。' +
        '缺失时降级为 plain netns（dockerd 可跑，但服务端口对宿主不可达）。',
    });
  }

  // cgroup v2 委派（best-effort note）
  try {
    if (fs.existsSync('/sys/fs/cgroup/cgroup.controllers')) {
      const userSlice = `/sys/fs/cgroup/user.slice/user-${uid}.slice/user@${uid}.service`;
      if (fs.existsSync(userSlice)) {
        // 用唯一临时名探测（避免与已存在的 cloudcad-docker 撞 EEXIST 造成假阴性）
        const probe = path.join(userSlice, `cloudcad-probe-${process.pid}`);
        try {
          fs.mkdirSync(probe);
          fs.rmdirSync(probe);
          notes.push(`cgroup v2 委派可用（user@${uid}.service）`);
        } catch (e) {
          if (e && e.code === 'EEXIST') {
            notes.push(`cgroup v2 委派可用（user@${uid}.service）`);
          } else {
            notes.push(
              `cgroup v2：user@${uid}.service 未委派 cgroup 写权限，dockerd 管理容器 cgroup 可能失败。` +
                '可尝试：确保以 systemd 用户会话登录（systemd --user 运行中），或内核启用 cgroup 委派。'
            );
          }
        }
      } else {
        notes.push(`cgroup v2：未找到 user@${uid}.service cgroup（systemd 用户会话未运行？rootless 建议经 systemd 用户会话启动）`);
      }
    } else {
      notes.push('cgroup v1：无需委派，dockerd 使用 cgroup v1 层级');
    }
  } catch (err) {
    notes.push(`cgroup 探测失败：${err.message}`);
  }

  return { ok: missing.length === 0, missing, notes, subuid, subgid, newuidmap, newgidmap, slirp4netns };
}

/**
 * 拉起 rootless dockerd（幂等：已就绪则直接返回）。
 *
 * @param {Object} opts
 * @param {string} opts.deployDir 部署目录
 * @param {string} opts.dockerDir 包内 docker/ 目录（含 dockerd/docker 静态二进制）
 * @param {string} opts.dataRoot dockerd 数据目录（<deployDir>/docker-data）
 * @param {string} opts.logFile rootless dockerd 日志文件
 * @param {number[]} [opts.ports] 需经 slirp4netns hostfwd 暴露给真实宿主的端口（前端/后端）
 * @param {string} opts.toolsDir 包内 rootless 工具目录（含 rootless-ns）
 * @param {Function} [opts.log]
 * @returns {{ok:boolean, dockerHost:string, socketPath:string, netnsPid:number|null,
 *   pidFile:string, degraded:boolean, alreadyRunning?:boolean, missing?:{name,hint}[],
 *   notes?:string[], message?:string}}
 */
function start({ deployDir, dockerDir, dataRoot, logFile, ports = [], toolsDir, log = () => {} }) {
  const shadowRun = path.join(dataRoot, 'shadow-run');
  const socketPath = path.join(shadowRun, 'docker-rootless.sock');
  const dockerHost = `unix://${socketPath}`;
  const pidFile = path.join(dataRoot, 'rootless.pid');
  const setupScript = path.join(dataRoot, 'rootless-setup.sh');
  const etcLower = path.join(dataRoot, 'etc-lower');
  const etcUpper = path.join(dataRoot, 'etc-upper');
  const etcWork = path.join(dataRoot, 'etc-work');
  const nsBin = path.join(toolsDir, 'rootless-ns');

  // 幂等：已就绪
  if (isDockerReady(dockerHost, dockerDir)) {
    const pid = readPid(pidFile);
    return { ok: true, dockerHost, socketPath, netnsPid: pid, pidFile, degraded: false, alreadyRunning: true };
  }

  if (!fs.existsSync(nsBin)) {
    return {
      ok: false,
      dockerHost,
      socketPath,
      pidFile,
      degraded: false,
      message: `包内 rootless-ns 二进制缺失（${nsBin}），部署包不完整，无法启动 rootless dockerd`,
    };
  }

  const prereq = checkPrerequisites({ toolsDir, log });
  const slirp = prereq.slirp4netns;
  const degraded = !slirp; // 无 slirp4netns → plain netns（端口对宿主不可达）

  const realUid = process.getuid();
  const cgroupParent = buildCgroupParent(realUid);
  ensureCgroup(cgroupParent, log);

  const dockerd = path.join(dockerDir, 'dockerd');
  const dockerdArgs = `--data-root ${dataRoot} --host unix://${socketPath} --iptables=false --ip-forward=false --bridge=none`;

  // 生成 setup 脚本
  const setup = renderSetupScript({
    shadowRun,
    etcLower,
    etcUpper,
    etcWork,
    slirp,
    dockerd,
    dockerdArgs,
    cgroupParent,
    realUid,
    ports,
  });
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.writeFileSync(setupScript, setup, { mode: 0o755 });

  const env = {
    ...process.env,
    ROOTLESS_PIDFILE: pidFile,
    ROOTLESS_SUBUID: prereq.subuid ? `${prereq.subuid.start} ${prereq.subuid.count}` : '',
    ROOTLESS_SUBGID: prereq.subgid ? `${prereq.subgid.start} ${prereq.subgid.count}` : '',
    ROOTLESS_NEWUIDMAP: prereq.newuidmap || '',
    ROOTLESS_NEWGIDMAP: prereq.newgidmap || '',
    ROOTLESS_REAL_UID: String(realUid),
    PATH: `${dockerDir}:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`,
  };

  log(
    `[rootless] 拉起 rootless dockerd（${degraded ? '降级 plain-netns：端口对宿主不可达' : 'slirp4netns 完整网络'}，` +
      `暴露端口 ${ports.join(',') || '（无）'}）...`
  );
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const logStream = fs.openSync(logFile, 'a');
  try {
    spawn(nsBin, [setupScript], { env, stdio: ['ignore', logStream, logStream], detached: true, cwd: dataRoot }).unref();
  } catch (err) {
    return {
      ok: false,
      dockerHost,
      socketPath,
      pidFile,
      degraded,
      missing: prereq.missing,
      notes: prereq.notes,
      message: `启动 rootless-ns 失败：${err.message}`,
    };
  }

  // 等待 dockerd 就绪（最多 90s：首次含 cgroup/网络初始化）
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (isDockerReady(dockerHost, dockerDir)) {
      const pid = readPid(pidFile);
      log(`[rootless] dockerd 就绪（netns pid=${pid || '未知'}，${degraded ? '降级模式' : '完整网络'}）`);
      return { ok: true, dockerHost, socketPath, netnsPid: pid, pidFile, degraded, missing: prereq.missing, notes: prereq.notes };
    }
    sleep(1000);
  }

  let tail = '';
  try {
    tail = fs.readFileSync(logFile, 'utf8').split('\n').slice(-15).join('\n');
  } catch {
    /* 无日志 */
  }
  return {
    ok: false,
    dockerHost,
    socketPath,
    pidFile,
    degraded,
    missing: prereq.missing,
    notes: prereq.notes,
    message: `rootless dockerd 90s 内未就绪。日志尾部（${logFile}）：\n${tail || '（空）'}`,
  };
}

/**
 * 停止 rootless dockerd（杀整个进程组：rootless-ns 子进程经 setsid 成为组长，
 * pgid=pidfile 记录的 pid，kill(-pid) 一次带走 slirp4netns/dockerd/容器）。
 * @param {Object} opts
 * @param {string} opts.pidFile
 * @param {Function} [opts.log]
 * @returns {{ok:boolean, stopped:boolean}}
 */
function stop({ pidFile, log = () => {} }) {
  const pid = readPid(pidFile);
  if (!pid) {
    log('[rootless] 无存活 pid，rootless dockerd 未运行');
    return { ok: true, stopped: false };
  }
  log(`[rootless] 停止 rootless dockerd（进程组 ${pid}）...`);
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    /* 进程组已不存在 */
  }
  // 等待退出（最多 15s），超时 SIGKILL
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (!fs.existsSync(`/proc/${pid}`)) break;
    sleep(500);
  }
  if (fs.existsSync(`/proc/${pid}`)) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      /* 忽略 */
    }
    sleep(1000);
  }
  log('[rootless] rootless dockerd 已停止');
  return { ok: true, stopped: true };
}

module.exports = {
  checkPrerequisites,
  start,
  stop,
  isDockerReady,
  // 内部导出（供测试 / index.js 复用）
  _which: which,
  _readSubid: readSubid,
  _readPid: readPid,
  _buildCgroupParent: buildCgroupParent,
  _renderSetupScript: renderSetupScript,
};
