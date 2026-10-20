/**
 * @fileoverview rootless dockerd 启动器（ADR-0075：普通用户的**主路径**，部署完全无 root）
 *
 * 普通用户恒走本模块（用户命名空间 + 包内静态 dockerd + 静态 slirp4netns）：
 * 不探测 sudo、不请求任何密码，部署目录全部归当前用户。仅当用户以 root 身份
 * 运行 ./start.sh 时才走 root dockerd 路径（用户选择，非依赖）。
 * 零管理员前置：包内镜像全部层文件均 0:0 属主（打包时由
 * scripts/pack-lib/normalize-image-ownership.js 归一化）且容器以 uid 0 运行
 * （pg 定制镜像 / redis user:root / app 无 USER），单段 0→euid 映射即够，
 * 无需 uidmap/subuid（有则用多段）。
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
 * 实测 slirp4netns 二进制能否在本机运行（跑 --version）。
 * 仅查文件存在会误判：包内动态版（发行版 1.0.1）在 glibc 过低的目标机（如 Ubuntu 20.04/2.31）
 * 会因 libslirp 需 GLIBC_2.33+ 而 exec 失败，若当真则 dockerd 90s 超时。静态版（v1.2.x）
 * 无 glibc 依赖恒可跑。动态版需 LD_LIBRARY_PATH 找 libslirp（二进制旁 lib/ 目录）。
 * @param {string} p slirp4netns 路径
 * @returns {boolean}
 */
function slirpUsable(p) {
  if (!p || !fs.existsSync(p)) return false;
  try {
    const libDir = path.join(path.dirname(p), 'lib');
    const env = { ...process.env, LD_LIBRARY_PATH: libDir + (process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : '') };
    const r = spawnSync(p, ['--version'], { encoding: 'utf8', env, timeout: 10000 });
    return r.status === 0;
  } catch {
    return false;
  }
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

/**
 * 读 ELF 的 e_machine，返回 'x86_64' / 'aarch64' / null。
 * 把「包内 rootless-ns 架构与本机不符」从 ENOEXEC（exec format error）变成清晰报错。
 * @param {string} file
 * @returns {string|null}
 */
function elfArch(file) {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(20);
      if (fs.readSync(fd, buf, 0, 20, 0) < 6) return null;
      if (buf.toString('latin1', 0, 4) !== '\x7fELF') return null;
      if (buf[4] !== 2) return null;
      switch (buf.readUInt16LE(18)) {
        case 62:
          return 'x86_64';
        case 183:
          return 'aarch64';
        default:
          return null;
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Linux unix socket 路径上限：sun_path 108 字节（含结尾 NUL，路径本身须 < 108）。
 * 部署目录由用户解压位置决定、深度任意（如 /home/mx/Music/cloudcad-deploy-...），
 * 包内影子 socket 全路径超限后 dockerd 报 "bind: invalid argument"（EINVAL）且无指向性，
 * 必须在拉起前解析并回退（CI 断网验证容器路径短，暴露不了此类问题，2026-10-19 实机暴露）。
 */
const SUN_PATH_LIMIT = 108;

/**
 * 解析 rootless dockerd 的 socket 路径：
 * 首选包内影子目录（<dataRoot>/shadow-run/docker-rootless.sock，对宿主可见且私有）；
 * 全路径达 108 字节上限（部署目录过深）时回退 /tmp 短路径——命名空间内 /tmp 与宿主
 * 是同一目录（未影子挂载），dockerd 在 ns 内 bind 后宿主 docker CLI 可直接连。
 * 回退目录名含 dataRoot 的 FNV-1a 短哈希：同一用户多份部署包各用各的 socket 互不串。
 * @param {string} dataRoot dockerd 数据目录（<deployDir>/docker-data）
 * @returns {string}
 */
function resolveSocketPath(dataRoot) {
  const inPkg = path.join(dataRoot, 'shadow-run', 'docker-rootless.sock');
  if (inPkg.length < SUN_PATH_LIMIT) return inPkg;
  let h = 0x811c9dc5;
  for (let i = 0; i < dataRoot.length; i++) {
    h ^= dataRoot.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return path.join(`/tmp/cloudcad-docker-${process.getuid()}-${(h >>> 0).toString(36)}`, 'docker.sock');
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
  // slirp4netns hostfwd：把宿主端口转发进子 netns（无端口则为空串），经 API socket 发 add_hostfwd
  const portsList = (ports || []).join(' ');
  const slirpPath = slirp || '';
  return `#!/bin/sh
# 由 lib/rootless.js 生成 —— rootless dockerd setup（在 user+mount+ipc ns 内运行，uid=0）
set -e

SHADOW_RUN="${shadowRun}"
mkdir -p "$SHADOW_RUN"

# 1) DNS：必须在 /etc overlay 挂载前读宿主真实上游 nameserver（/etc/resolv.conf 可能是指向 /run/* 的符号链接）。
#    slirp 模式：guest netns 隔离（仅 slirp TAP + 环回），宿主 DNS（127.0.0.53 stub / LAN 上游）在 guest 内不可达，
#    guest 须用 slirp 用户态 DNS 代理 10.0.2.3；slirp 自身跑在宿主 netns，其上游须显式 -d 传真实上游
#    （否则 slirp 读子 mount ns 里 overlay 的 /etc/resolv.conf=10.0.2.3 即它自己，DNS 转发成环超时）。
#    plain netns 模式无外网，DNS 无意义，保留宿主 resolv.conf（overlay lower）。
REAL_NS="$(grep '^nameserver' /etc/resolv.conf 2>/dev/null | head -5 || true)"
case "$REAL_NS" in
  *127.0.0.53*)
    if [ -r /run/systemd/resolve/resolv.conf ]; then
      REAL_NS="$(grep '^nameserver' /run/systemd/resolve/resolv.conf 2>/dev/null | head -5 || true)"
    fi
    ;;
esac
if [ -n "${slirpPath}" ]; then
  NS="nameserver 10.0.2.3"
else
  NS=""
fi

# 2) /run 影子 bind：dockerd 的 unix socket 落在此影子目录（部署目录过深时回退 /tmp 短路径），对真实宿主可见
mount --bind "$SHADOW_RUN" /run

# 2a) 清理上一实例的 docker.pid（影子 /run 专属于本 dockerd；stop+start 重启时 pid 文件残留，
#     不删则新 dockerd 报 "pid file found" 拒绝启动）。rootless 模式 pidfile 在
#     $XDG_RUNTIME_DIR/docker.pid（/run/user/<uid>/docker.pid，落在影子 /run 内），两条路径都清
rm -f /run/docker.pid
if [ -n "\${XDG_RUNTIME_DIR:-}" ]; then rm -f "\${XDG_RUNTIME_DIR}/docker.pid"; fi

# 3) /etc overlay：lower=真实 /etc（bind），upper=影子（可写），使 dockerd 可写 /etc 而不污染宿主
mkdir -p "${etcLower}" "${etcUpper}" "${etcWork}"
if [ -n "$NS" ]; then printf '%s\\n' "$NS" > "${etcUpper}/resolv.conf"; fi
mount --bind /etc "${etcLower}"
mount -t overlay overlay -o lowerdir=${etcLower},upperdir=${etcUpper},workdir=${etcWork} /etc

# 3a) /etc/docker 遮蔽：宿主 /etc/docker 可能残留 root 属主 key.json（rootless ns 内 uid0 映射宿主普通用户，
#     读不了 → dockerd 按 root 默认 TLS 证书目录 /etc/docker 加载 key.json 时 EACCES，daemon 起不来；
#     该读取路径不受 DOCKER_TLS_CERTDIR 控制）。bind 空目录覆盖，使该目录对 dockerd 恒为空
#     （rootless 走 unix socket、无 TLS，空证书目录无副作用；也不影响 rootless 实际读取的
#     $HOME/.config/docker/daemon.json 用户配置）。
mkdir -p "$SHADOW_RUN/etc-docker"
mkdir -p /etc/docker
mount --bind "$SHADOW_RUN/etc-docker" /etc/docker

# 3b) apparmor 遮蔽：子 userns 内 /sys/kernel/security/apparmor/profiles 读 EACCES（内核 securityfs
#     可见性检查：init userns 加载的 profile 对子 userns 不可见）→ dockerd 容器创建时的 AppArmor
#     profile 检查硬失败（实测容器卡 Created）。dockerd 启动时 stat /sys/module/apparmor（或
#     /sys/kernel/security/apparmor）判 apparmor 可用性 → 两处都 bind 空目录覆盖，使其判「不可用」
#     而跳过全部检查（rootless 容器本就无法使用 init userns 的 apparmor profile，unconfined 是正确行为）
if [ -d /sys/module/apparmor ]; then
  mkdir -p "$SHADOW_RUN/sys-module-apparmor"
  mount --bind "$SHADOW_RUN/sys-module-apparmor" /sys/module/apparmor
fi
if [ -d /sys/kernel/security/apparmor ]; then
  mkdir -p "$SHADOW_RUN/sys-apparmor"
  mount --bind "$SHADOW_RUN/sys-apparmor" /sys/kernel/security/apparmor
fi

# 4) netns + dockerd（socket/数据目录/cgroup 参数已含在 DOCKERD_ARGS）
DOCKERD="${dockerd}"
DOCKERD_ARGS="${dockerdArgs}${cgArg}"
REAL_UID="${realUid}"
PORTS="${portsList}"
# rootless 检测：dockerd 靠 ROOTLESSKIT_STATE_DIR 环境变量判 rootless 模式（官方 rootlesskit 会设置）。
# 缺失时按普通 daemon 走 → 容器创建时 AppArmor profile 检查读 /sys/kernel/security/apparmor
# （rootless 下 EACCES）直接硬失败（实测容器卡 Created）。置为本实例影子 /run 目录（存在且可写）
export ROOTLESSKIT_STATE_DIR="$SHADOW_RUN"

# hostfwd 发送器（slirp4netns API socket，QMP 风格 JSON）。协议：发 JSON 后 SHUT_WR（无 keep-alive），读响应。
# 优先 python3（Ubuntu 默认有），回退 nc -U；都无则跳过（端口不暴露但 dockerd 仍跑）。
send_hostfwd() {
  hf_proto="$1"; hf_hport="$2"; hf_gport="$3"
  HFWD_REQ='{"execute":"add_hostfwd","arguments":{"proto":"'\${hf_proto}'","host_port":'\${hf_hport}',"guest_port":'\${hf_gport}'}}'
  if command -v python3 >/dev/null 2>&1; then
    HFWD_SOCK="$SLIRP_API_SOCK" HFWD_REQ="$HFWD_REQ" python3 -c '
import socket, os, sys
sp, req = os.environ["HFWD_SOCK"], os.environ["HFWD_REQ"]
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM); s.settimeout(5)
try:
    s.connect(sp); s.sendall(req.encode()); s.shutdown(socket.SHUT_WR)
    buf = b""
    while True:
        c = s.recv(4096)
        if not c: break
        buf += c
    sys.stdout.write(buf.decode(errors="replace"))
except Exception:
    pass
finally:
    s.close()
' 2>/dev/null || true
  elif command -v nc >/dev/null 2>&1; then
    printf '%s' "$HFWD_REQ" | nc -U -w 3 "$SLIRP_API_SOCK" >/dev/null 2>&1 || true
  fi
}

# 4a) 有 slirp4netns：完整用户态网络 + hostfwd（API socket）暴露端口给真实宿主
#     slirp4netns 只有附着模型（PID|PATH|FD [TAPNAME]），无自拉模型：先在新 netns 起 dockerd，
#     再 slirp 附着其 netns 建 TAP + 用户态网络；hostfwd 经 API socket 发 add_hostfwd（非命令行参数）。
if [ -n "${slirpPath}" ] && [ -x "${slirpPath}" ]; then
  # 动态 slirp4netns（发行版 1.0.1）需 LD_LIBRARY_PATH 找 libslirp（静态 v1.3.x 无此依赖，设了也无害）
  SLIRP_LIBDIR="$(dirname "${slirpPath}")/lib"
  [ -d "\${SLIRP_LIBDIR}" ] && export LD_LIBRARY_PATH="\${SLIRP_LIBDIR}\${LD_LIBRARY_PATH:+:\${LD_LIBRARY_PATH}}"
  SLIRP_API_SOCK="/run/slirp4netns.sock"
  # 1) 新 netns 里起 dockerd（后台；unshare 建 netns 后 exec dockerd，PID 不变）
  unshare -n "$DOCKERD" $DOCKERD_ARGS &
  DOCKERD_PID=$!
  # 1a) 等 unshare 真正进入新 netns：在此之前 /proc/PID/ns/net 仍是宿主 netns，slirp 抢先
  #     setns 宿主 netns 会 EPERM（子 userns 无 init userns 的 CAP_SYS_ADMIN）退出，dockerd 只剩
  #     环回（无 tap0/外网）——启动竞态，必须等 netns 切换完成再附着（实测：不等待时竞态必现）
  HOST_NET="\$(readlink /proc/self/ns/net)"
  i=0
  while [ -d "/proc/\${DOCKERD_PID}" ] && [ "\$(readlink /proc/\${DOCKERD_PID}/ns/net 2>/dev/null)" = "\$HOST_NET" ] && [ \$i -lt 100 ]; do
    sleep 0.1
    i=\$((i+1))
  done
  # 2) slirp4netns 附着 dockerd 的 netns（按 PID），建 TAP + 用户态网络 + API socket。
  #    1.3.x 无 -d 选项（≤1.2 接口，传了直接 usage 退出）：上游 DNS 恒读 /etc/resolv.conf。
  #    子 mount ns 里 /etc 是 overlay（resolv.conf=10.0.2.3=slirp 自身）→ DNS 转发成环（实测 i/o timeout）。
  #    故给 slirp 私有 mount ns：bind 宿主真实 resolv.conf 覆盖 /etc/resolv.conf 后 exec slirp
  #    （exec 不换 PID，SLIRP_PID 仍指 slirp 本体；slirp 跑在宿主 netns，真实上游可达）。
  rm -f "\${SLIRP_API_SOCK}"
  if [ -n "$REAL_NS" ]; then
    printf '%s\\n' "$REAL_NS" > "$SHADOW_RUN/slirp-resolv.conf"
    unshare -m sh -c "mount --bind \$SHADOW_RUN/slirp-resolv.conf /etc/resolv.conf && exec '${slirpPath}' -c --netns-type=pid \${DOCKERD_PID} --api-socket \${SLIRP_API_SOCK} tap0" &
  else
    "${slirpPath}" -c --netns-type=pid "\${DOCKERD_PID}" --api-socket "\${SLIRP_API_SOCK}" tap0 &
  fi
  SLIRP_PID=$!
  # 3) 等 API socket 就绪，对每个端口发 add_hostfwd（TCP + UDP，宿主端口 → guest 10.0.2.100 同端口）
  if [ -n "$PORTS" ]; then
    i=0
    while [ ! -S "\${SLIRP_API_SOCK}" ] && [ $i -lt 30 ]; do sleep 1; i=$((i+1)); done
    if [ -S "\${SLIRP_API_SOCK}" ]; then
      for hf_port in $PORTS; do
        send_hostfwd tcp "$hf_port" "$hf_port"
        send_hostfwd udp "$hf_port" "$hf_port"
      done
    else
      echo "[rootless] 警告：slirp4netns API socket 30s 未就绪，服务端口未暴露（仅 ns 内互通）" >&2
    fi
  fi
  # 4) 脚本存活与 dockerd 绑定：dockerd 退出即清理 slirp 并结束（rootless-ns 据此回收 netns）
  wait "\${DOCKERD_PID}" || true
  kill "\${SLIRP_PID}" 2>/dev/null || true
  exit 0
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

  // rootless-ns 二进制（包内，硬前置：缺失或架构不符则完全无法启动）
  const nsBin = path.join(toolsDir, 'rootless-ns');
  if (!fs.existsSync(nsBin)) {
    missing.push({ name: 'rootless-ns', hint: `包内 rootless-ns 二进制缺失（${nsBin}），部署包不完整，rootless 无法启动` });
  } else {
    // 错架构二进制（如 aarch64 机器上打进 x86_64 版）exec 时是 ENOEXEC，报错无指向性
    const wantArch = { x64: 'x86_64', arm64: 'aarch64' }[process.arch];
    const gotArch = elfArch(nsBin);
    if (wantArch && gotArch !== wantArch) {
      missing.push({
        name: 'rootless-ns',
        hint: `包内 rootless-ns 架构与本机不符（包内 ${gotArch || '未知'}，本机 ${wantArch}）。` +
          `请重新出包：在 ${wantArch} 机器上跑 scripts/pack-linux-docker.js，` +
          `或先在该架构机器上编译 runtime/docker-runtime/lib/rootless/rootless-ns.c（-static）并提交后重打。`,
      });
    }
  }

  // newuidmap/newgidmap（setuid，OS 提供）—— 仅多段 subuid/subgid 映射需要。
  // 包内镜像全部层文件均 0:0 属主（打包时归一化）且容器以 uid 0 运行，
  // rootless-ns 无 newuidmap 时自写单段 0→euid 映射即够（go=2 降级路径），
  // 故缺失只提示、不阻塞（ADR-0075：零管理员 rootless）。
  const newuidmap = which('newuidmap');
  const newgidmap = which('newgidmap');
  if (!newuidmap || !newgidmap) {
    notes.push(
      'newuidmap/newgidmap 未找到：使用单段 uid 映射（包内镜像全部层文件均 0:0 属主，不受影响；' +
        '如需运行非 0:0 属主镜像，安装 uidmap 包：Debian/Ubuntu `sudo apt install uidmap`，RHEL/CentOS `sudo dnf install uidmap`）'
    );
  }

  // subuid/subgid 范围（仅多段映射需要；缺失同样不阻塞，见上）
  const subuid = readSubid('/etc/subuid', user);
  const subgid = readSubid('/etc/subgid', user);
  if (!subuid || !subgid) {
    notes.push(`用户 ${user} 未配置 subuid/subgid 范围：使用单段 uid 映射（包内镜像全部层文件均 0:0 属主，不受影响）`);
  }

  // slirp4netns（包内静态优先，系统兜底）—— 用户态网络 + 端口暴露。
  // 必须「实测可运行」而非仅查文件存在：动态版（发行版 1.0.1）在 glibc 过低的目标机
  // （如 Ubuntu 20.04/2.31）会因 libslirp 需 GLIBC_2.33+ 而 exec 失败，若只查存在会误判可用
  // → dockerd 90s 超时。实测 --version，跑不了就降级 plain-netns。
  // 偏好顺序：包内静态版（vendor/slirp4netns，无 glibc 依赖、任意 Linux 可跑、建网稳定）优先，
  // 系统版兜底——系统版（如老 v1.0.1）虽能过 --version，但运行时建网在部分宿主上不稳定
  // （时而降级 plain-netns 致镜像拉取无外网），故有包内静态版时恒用它。
  const sysSlirp = which('slirp4netns');
  const bundledSlirp = path.join(toolsDir, 'slirp4netns');
  let slirp4netns = null;
  if (slirpUsable(bundledSlirp)) {
    slirp4netns = bundledSlirp;
  } else if (sysSlirp && slirpUsable(sysSlirp)) {
    slirp4netns = sysSlirp;
  }
  if (!slirp4netns) {
    const foundButBroken = Boolean(sysSlirp) || fs.existsSync(bundledSlirp);
    missing.push({
      name: 'slirp4netns',
      hint: foundButBroken
        ? '找到 slirp4netns 但本机无法运行（常见：包内动态版需 GLIBC_2.33+，本机 glibc 过低）。' +
          '将降级 plain-netns（dockerd 可跑，但服务端口对真实宿主不可达）。' +
          '完整网络需：装系统 slirp4netns（sudo apt/dnf install slirp4netns）后重跑，' +
          '或用含静态 slirp4netns 的部署包（runtime/docker-runtime/vendor/slirp4netns）。'
        : '未找到 slirp4netns（rootless 用户态网络，负责建 netns 并把服务端口暴露给真实宿主）。' +
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
  const socketPath = resolveSocketPath(dataRoot);
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
  // 部署目录过深时 socket 回退 /tmp 短路径：dockerd bind 前父目录必须已存在（dockerd 不建父目录），
  // 宿主侧 /tmp 与命名空间内 /tmp 是同一目录，此处建好 ns 内即可见；0700 防其他用户抢先建符号链接
  if (!socketPath.startsWith(dataRoot)) {
    log(`[rootless] 部署目录路径过深（socket 全路径 ≥${SUN_PATH_LIMIT} 字节，超 unix socket 上限），改用短路径 ${socketPath}`);
    fs.mkdirSync(path.dirname(socketPath), { recursive: true, mode: 0o700 });
  }
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
  resolveSocketPath,
  // 内部导出（供测试 / index.js 复用）
  _elfArch: elfArch,
  _which: which,
  _readSubid: readSubid,
  _readPid: readPid,
  _buildCgroupParent: buildCgroupParent,
  _renderSetupScript: renderSetupScript,
};
