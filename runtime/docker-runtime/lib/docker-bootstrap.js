/**
 * @fileoverview Docker 检测 / 静态二进制安装 / 镜像加载 / OS 兼容探测（ADR-0074 D5/D13）
 *
 * - 系统已有可用 Docker（docker version 有 Server 端返回）→ 直接复用，不装不碰。
 * - 否则用包内 docker/ 静态二进制（20.10.24，glibc 2.17+ 兼容 CentOS 7）装到
 *   /usr/local/bin，dockerd 由本模块 nohup 拉起（不写 systemd unit——systemd
 *   版本差异过大）。参数固定 --iptables=false --bridge=none（host 网络无需网桥；
 *   --iptables=false 避免无 CAP_NET_ADMIN 时 dockerd 自退）。
 * - OS 兼容自动兜底（D13）：xfs 未开 ftype=1 → --storage-driver=vfs；
 *   SELinux enforcing → 由调用方给 data 挂载加 :z（本模块只负责探测并上报）。
 * - 无 root/sudo 由 index.js 前置硬门禁（D5：不降级裸机形态），本模块假定
 *   传入的 sudo 前缀已可用。
 *
 * 仅依赖 node 内置。
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

/**
 * 执行 shell 命令（带 sudo 前缀），返回 { ok, stdout, stderr, code }。
 * @param {string} cmd
 * @param {{ sudo?: string, timeoutMs?: number, env?: Object }} [opts]
 *   env 覆盖进程环境（rootless 时注入 DOCKER_HOST 指向影子 socket；默认 process.env）
 */
function run(cmd, { sudo = '', timeoutMs = 60000, env = process.env } = {}) {
  const full = sudo ? `${sudo} ${cmd}` : cmd;
  const res = spawnSync(full, {
    shell: true,
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
  return {
    ok: res.status === 0,
    code: res.status,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
    error: res.error ? res.error.message : '',
  };
}

/**
 * 系统 Docker 是否可用（docker version 能返回 Server 端信息）。
 * @param {string} [sudo]
 * @returns {boolean}
 */
function dockerReady(sudo = '') {
  const res = run(`docker version --format '{{.Server.Version}}'`, { sudo, timeoutMs: 15000 });
  return res.ok && res.stdout.length > 0;
}

/**
 * OS 兼容探测（D13）：返回应使用的 storage driver 与 SELinux 状态。
 * 探测失败一律如实上报（notes），不静默回退默认值。
 * @param {string} deployDir 部署目录（其所在文件系统决定 overlay2 可用性）
 * @returns {{ storageDriver: 'overlay2'|'vfs', selinux: 'enforcing'|'permissive'|'disabled'|'unknown', notes: string[] }}
 */
function probeOsCompat(deployDir) {
  const notes = [];
  let storageDriver = 'overlay2';

  // xfs ftype 检查：仅当部署目录所在文件系统是 xfs 时才有意义
  try {
    const mounts = fs.readFileSync('/proc/mounts', 'utf8').split('\n');
    // 找部署目录（或其祖先）对应的挂载点，取最长前缀匹配
    let mountPoint = '';
    for (const line of mounts) {
      const parts = line.split(/\s+/);
      const mp = parts[1];
      const fsType = parts[2];
      if (!mp || fsType !== 'xfs') continue;
      if (deployDir === mp || deployDir.startsWith(mp + '/')) {
        if (mp.length > mountPoint.length) mountPoint = mp;
      }
    }
    if (mountPoint) {
      const info = run(`xfs_info ${mountPoint} 2>/dev/null || true`, { timeoutMs: 10000 });
      if (info.stdout) {
        if (/ftype=0/.test(info.stdout)) {
          storageDriver = 'vfs';
          notes.push(
            `xfs（${mountPoint}）未开启 ftype=1，overlay2 不可用 → 自动改用 vfs 存储驱动（性能较低，功能不受影响）`
          );
        } else if (/ftype=1/.test(info.stdout)) {
          // 正常
        } else {
          notes.push(`xfs_info 输出未含 ftype 字段，按 overlay2 尝试：${info.stdout.slice(0, 120)}`);
        }
      } else {
        notes.push(`xfs_info 不可用（未安装 xfsprobs？），按 overlay2 尝试`);
      }
    }
  } catch (err) {
    notes.push(`读取 /proc/mounts 失败，跳过 xfs 检查：${err.message}`);
  }

  // SELinux 状态
  let selinux = 'unknown';
  const ge = run('getenforce 2>/dev/null || cat /sys/fs/selinux/enforce 2>/dev/null || true', {
    timeoutMs: 10000,
  });
  if (ge.ok || ge.stdout) {
    const v = ge.stdout.trim().toLowerCase();
    if (v === 'enforcing' || v === '1') selinux = 'enforcing';
    else if (v === 'permissive' || v === '0') selinux = 'permissive';
    else if (v === 'disabled') selinux = 'disabled';
  }
  if (selinux === 'enforcing') {
    notes.push(
      'SELinux 处于 enforcing：data/ 挂载将自动加 :z 标签；若容器仍报权限错误，可临时 setenforce 0'
    );
  }

  return { storageDriver, selinux, notes };
}

/**
 * 安装包内静态 Docker 二进制并拉起 dockerd。
 *
 * @param {Object} opts
 * @param {string} opts.sudo sudo 前缀（'' 表示已是 root）
 * @param {string} opts.dockerDir 包内 docker/ 目录（含 dockerd/containerd/runc/docker 等）
 * @param {string} opts.dataRoot dockerd 数据目录（<deployDir>/docker-data）
 * @param {string} opts.logFile dockerd 日志文件
 * @param {string} [opts.storageDriver] probeOsCompat 的结果
 * @param {Function} [log]
 * @returns {{ ok: boolean, message: string }}
 */
function installStaticDocker({ sudo, dockerDir, dataRoot, logFile, storageDriver = 'overlay2', log = () => {} }) {
  if (!fs.existsSync(path.join(dockerDir, 'dockerd'))) {
    return { ok: false, message: `包内静态 Docker 缺失：${path.join(dockerDir, 'dockerd')}` };
  }

  const binaries = [
    'docker',
    'dockerd',
    'containerd',
    'containerd-shim',
    'containerd-shim-runc-v2',
    'runc',
    'docker-init',
    'docker-proxy',
  ];
  for (const bin of binaries) {
    const src = path.join(dockerDir, bin);
    if (!fs.existsSync(src)) {
      return { ok: false, message: `包内 Docker 组件缺失：${src}` };
    }
  }

  log(`[docker] 安装静态 Docker 二进制到 /usr/local/bin ...`);
  const install = run(
    `install -d ${dataRoot} && for b in ${binaries.join(' ')}; do install -m 755 "${dockerDir}/$b" /usr/local/bin/$b; done && ln -sf /usr/local/bin/docker /usr/bin/docker`,
    { sudo, timeoutMs: 120000 }
  );
  if (!install.ok) {
    return { ok: false, message: `安装 Docker 二进制失败：${install.stderr || install.error}` };
  }

  // 版本自检：这一步是离线环境唯一能提前暴露 glibc/内核不兼容的点
  const ver = run(`${sudo} dockerd --version`, { sudo: '', timeoutMs: 15000 });
  if (!ver.ok && !ver.stdout) {
    return {
      ok: false,
      message: `dockerd 无法执行（glibc/内核不兼容？）：${ver.stderr || ver.error}。请确认系统为 x86_64 且 glibc >= 2.17（CentOS 7 及以上）`,
    };
  }

  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const driverArg = storageDriver === 'vfs' ? ' --storage-driver=vfs' : '';
  const dockerdCmd =
    `nohup ${sudo} dockerd --iptables=false --bridge=none${driverArg} ` +
    `--data-root ${dataRoot} >> ${logFile} 2>&1 &`;
  log(`[docker] 拉起 dockerd（data-root=${dataRoot}${driverArg ? `，storage-driver=${storageDriver}` : ''}）...`);
  run(dockerdCmd, { sudo: '', timeoutMs: 15000 });

  // 等待 dockerd 就绪（最多 30s）
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (dockerReady(sudo)) {
      const v = run(`docker version --format '{{.Server.Version}}'`, { sudo, timeoutMs: 15000 });
      log(`[docker] dockerd 就绪（${v.stdout}）`);
      return { ok: true, message: `Docker ${v.stdout} 已就绪` };
    }
    // dockerd 已退出（启动即崩）→ 提前失败，附上日志尾部
    const pgrep = run(`pgrep -x dockerd >/dev/null 2>&1 && echo alive || echo gone`, { timeoutMs: 10000 });
    if (pgrep.stdout === 'gone' && Date.now() > deadline - 25000) {
      break;
    }
    sleep(1000);
  }
  let tail = '';
  try {
    tail = fs.readFileSync(logFile, 'utf8').split('\n').slice(-15).join('\n');
  } catch {
    // 无日志
  }
  return {
    ok: false,
    message: `dockerd 30s 内未就绪。日志尾部（${logFile}）：\n${tail || '（空）'}`,
  };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * 加载离线镜像（已存在的 tag 跳过，docker load 幂等但耗时 2-5 分钟）。
 * @param {Object} opts
 * @param {string} opts.sudo
 * @param {string} opts.imagesDir 包内 images/ 目录
 * @param {string[]} opts.tags 期望镜像 tag 列表（cloudcad/pg:15-alpine 等）
 * @param {string} [opts.dockerCli] docker CLI（rootless 时指向包内静态二进制，默认 'docker'）
 * @param {string} [opts.dockerHost] DOCKER_HOST（rootless 时指向影子 socket，默认 ''）
 * @param {Function} [log]
 * @returns {{ ok: boolean, loaded: string[], skipped: string[], message: string }}
 */
function loadImages({ sudo, imagesDir, tags, log = () => {}, dockerCli = 'docker', dockerHost = '' }) {
  const dEnv = { ...process.env };
  if (dockerHost) dEnv.DOCKER_HOST = dockerHost;
  const loaded = [];
  const skipped = [];
  for (const tag of tags) {
    const inspect = run(`${dockerCli} image inspect ${tag} >/dev/null 2>&1`, { sudo, timeoutMs: 15000, env: dEnv });
    if (inspect.ok) {
      skipped.push(tag);
      continue;
    }
    const tar = path.join(imagesDir, `${tag.replace(/[/:]/g, '-')}.tar`);
    if (!fs.existsSync(tar)) {
      return { ok: false, loaded, skipped, message: `镜像 tar 缺失：${tar}` };
    }
    log(`[docker] 加载镜像 ${tag}（${path.basename(tar)}）...`);
    const res = run(`${sudo} ${dockerCli} load -i ${tar}`, { sudo: '', timeoutMs: 600000, env: dEnv });
    if (!res.ok) {
      return { ok: false, loaded, skipped, message: `docker load 失败（${tag}）：${res.stderr || res.error}` };
    }
    // load 后的 tag 以 tar 内 manifest 为准，校验期望 tag 已存在
    const again = run(`${dockerCli} image inspect ${tag} >/dev/null 2>&1`, { sudo, timeoutMs: 15000, env: dEnv });
    if (!again.ok) {
      return { ok: false, loaded, skipped, message: `镜像加载后未找到 tag ${tag}（tar 内 tag 与期望不符？）` };
    }
    loaded.push(tag);
  }
  return { ok: true, loaded, skipped, message: `镜像就绪（新加载 ${loaded.length}，已存在 ${skipped.length}）` };
}

module.exports = {
  run,
  dockerReady,
  probeOsCompat,
  installStaticDocker,
  loadImages,
};
