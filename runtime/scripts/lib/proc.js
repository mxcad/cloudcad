/**
 * @fileoverview 命令执行封装（纯能力层）
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - runCommand：cli.js:377-388
 * - runCommandWithProgress：cli.js:393-435
 * - runPnpm：cli.js:437-463
 * - runPm2：cli.js:465-500
 * - runInNewWindow：cli.js:502-523
 *
 * 依赖方向铁律：lib 只允许 require 其他 lib 或独立模块，禁止 require commands。
 */

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const {
  IS_WINDOWS,
  IS_LINUX,
  USE_RUNTIME,
  PROJECT_ROOT,
  PLATFORM_DIR,
  NODE_EXE,
  PM2_JS,
  PNPM_JS,
  PM2_HOME,
} = require('./context');

const { log } = require('./logger');

/**
 * 终止一个进程及其整棵子进程树。
 *
 * Step A-2（前台真修复）核心原语：解决 Windows 双层进程孤儿（P2.2）与 Linux 孤儿进程。
 * - Windows：进程以 `shell:false` 直 spawn（无 cmd.exe 包装层），此处用
 *   `taskkill /PID <pid> /T /F` 兜底整树强杀。
 * - Linux：进程以 `detached:true` 建独立进程组，此处向 `-pgid` 发 SIGTERM 整组回收；
 *   SIGTERM 无法收尾时由调用方在超时后再次调用（可带 force=true 走 SIGKILL）。
 *
 * @param {number|string} pid 根进程 PID
 * @param {Object} [options]
 * @param {boolean} [options.force] 强制 SIGKILL（Linux 有效；Windows taskkill /F 恒强制）
 * @param {boolean} [options.silent] 抑制失败告警
 * @returns {boolean} 是否已向目标进程发出终止信号
 */
function killTree(pid, options = {}) {
  if (!pid) return false;
  const { force = false, silent = false } = options;

  try {
    if (IS_WINDOWS) {
      const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'pipe',
        windowsHide: true,
      });
      // taskkill 退出码：0=成功终止；128=找不到目标进程（已不存在，视为已清理）；
      // 其余非 0（如 5=拒绝访问/权限不足）= 真实失败，须返回 false，避免掩盖。
      if (result.status === 0 || result.status === 128) {
        return true;
      }
      if (!silent) {
        log(
          'yellow',
          `[警告] taskkill 终止进程树失败 (PID ${pid})，退出码 ${result.status}: ${(result.stderr || result.stdout || '').toString().trim()}`
        );
      }
      return false;
    }

    // Linux / 其他 POSIX：向进程组发信号（detached:true spawn 后 pid === pgid）
    const pgid = typeof pid === 'number' ? -pid : -parseInt(pid, 10);
    try {
      process.kill(pgid, force ? 'SIGKILL' : 'SIGTERM');
    } catch (err) {
      // ESRCH = 进程组已不存在（已退出），视为成功
      if (err.code !== 'ESRCH') {
        throw err;
      }
    }
    return true;
  } catch (err) {
    if (!silent) {
      log('yellow', `[警告] 终止进程树失败 (PID ${pid}): ${err.message}`);
    }
    return false;
  }
}

/**
 * 注入离线 node 目录到 PATH。
 *
 * 离线部署包（USE_RUNTIME）中 node 未安装到系统 PATH，只存在于
 * runtime/<platform>/node/node.exe。pnpm exec 内部会通过 cmd 调用
 * node_modules/.bin/*.cmd（如 prisma.cmd），其内容依赖 PATH 中的 `node`，
 * 若不注入则报 "'node' 不是内部或外部命令"（实例：migrate deploy）。
 * runPnpm/runPm2 已注入，此处为 runCommand/runCommandWithProgress 统一兜底。
 */
function withNodePath(env) {
  if (!USE_RUNTIME) return env;
  const nodeDir = path.dirname(NODE_EXE);
  const existingPath = env.PATH || '';
  const parts = existingPath.split(path.delimiter).filter(Boolean);
  if (!parts.some((p) => p.toLowerCase() === nodeDir.toLowerCase())) {
    parts.unshift(nodeDir);
  }
  return { ...env, PATH: parts.join(path.delimiter) };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    stdio: options.silent ? 'pipe' : 'inherit',
    shell: IS_WINDOWS,
    env: withNodePath({
      ...process.env,
      ...options.env,
    }),
  });
  return result.status === 0;
}

/**
 * 运行命令并捕获输出，实时显示进度
 */
function runCommandWithProgress(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: IS_WINDOWS,
      env: withNodePath({
        ...process.env,
        ...options.env,
      }),
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      // 实时输出
      if (!options.silent) {
        process.stdout.write(output);
      }
    });

    child.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      // 实时输出
      if (!options.silent) {
        process.stderr.write(output);
      }
    });

    child.on('close', (code) => {
      resolve({
        success: code === 0,
        exitCode: code,
        stdout,
        stderr,
      });
    });
  });
}

function runPnpm(args, options = {}) {
  // 设置 PATH：包含 node bin 目录和 node_modules/.bin
  const nodeBinDir = IS_LINUX
    ? path.join(PLATFORM_DIR, 'node', 'bin')
    : path.join(PLATFORM_DIR, 'node');

  const nodeModulesBinDirs = [
    path.join(PROJECT_ROOT, 'node_modules', '.bin'),
    path.join(PROJECT_ROOT, 'packages', 'backend', 'node_modules', '.bin'),
  ];

  const existingPath = process.env.PATH || '';
  const pathParts = [nodeBinDir, ...nodeModulesBinDirs, existingPath];
  const newPath = pathParts.join(path.delimiter);

  // 创建独立的环境变量对象，不影响 process.env
  const env = Object.assign({}, process.env, options.env, {
    PATH: newPath,
    COREPACK_ENABLE: '0',
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  });

  if (PNPM_JS && fs.existsSync(PNPM_JS)) {
    return runCommand(NODE_EXE, [PNPM_JS, ...args], { ...options, env });
  }
  return runCommand('pnpm', args, { ...options, env });
}

function runPm2(args, options = {}) {
  if (!PM2_JS || !fs.existsSync(PM2_JS)) {
    log('red', '[错误] PM2 不可用');
    return false;
  }

  // 用「内嵌 node + pm2 脚本」的绝对路径调用（部署包根目录不再有 pm2 包装脚本）；
  // node 目录前置到 PATH 由 runCommand 的 withNodePath 统一处理——PM2 daemon
  // 靠 PATH 解析 node 来 spawn 子进程。
  return runCommand(NODE_EXE, [PM2_JS, ...args], {
    ...options,
    env: {
      ...options.env,
      PM2_HOME,
    },
  });
}

/**
 * 查询 PM2 当前托管的所有 app 状态（jlist JSON）。
 * @returns {Array<{name:string, pm2_env:{status:string}, pid:number}>} 空数组表示无 PM2 或查询失败
 */
function getPm2StatusList() {
  if (!PM2_JS || !fs.existsSync(PM2_JS)) return [];
  const result = spawnSync(NODE_EXE, [PM2_JS, 'jlist'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...process.env, PM2_HOME },
    shell: IS_WINDOWS,
    windowsHide: true,
    timeout: 10000,
  });
  if (result.status !== 0) return [];
  try {
    const list = JSON.parse(result.stdout);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * 查询某个 PM2 app 的运行状态。
 * @param {string} name app 名
 * @returns {'online'|'stopped'|'errored'|'launching'|'unknown'}
 */
function getPm2AppStatus(name) {
  const list = getPm2StatusList();
  const app = list.find((a) => a.name === name);
  if (!app) return 'unknown'; // 未注册
  const status = app.pm2_env && app.pm2_env.status;
  return ['online', 'stopped', 'errored', 'launching'].includes(status)
    ? status
    : 'unknown';
}

/**
 * 获取当前 PM2 中处于 online（正在运行）的 app 名集合。
 * @returns {Set<string>}
 */
function getPm2OnlineApps() {
  const list = getPm2StatusList();
  const online = new Set();
  for (const app of list) {
    const status = app.pm2_env && app.pm2_env.status;
    if (status === 'online') online.add(app.name);
  }
  return online;
}

/**
 * 检测指定端口当前被哪个 PID 占用。
 * @param {number} port
 * @returns {number|null} 占用进程的 PID；端口空闲返回 null；检测失败返回 null
 */
function getPidByPort(port) {
  try {
    if (IS_WINDOWS) {
      const res = spawnSync('netstat', ['-ano', '-p', 'TCP'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      const line = (res.stdout || '')
        .split('\n')
        .find((l) => l.includes(`:${port}`) && l.includes('LISTENING'));
      if (!line) return null;
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[parts.length - 1], 10);
      return Number.isFinite(pid) && pid > 0 ? pid : null;
    }
    // Linux/macOS：lsof 优先，netstat 兜底
    const lsof = spawnSync('lsof', ['-t', '-i', `:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
    });
    const lsofPid = parseInt((lsof.stdout || '').trim(), 10);
    if (Number.isFinite(lsofPid) && lsofPid > 0) return lsofPid;
    const netstat = spawnSync('netstat', ['-tlnp'], { encoding: 'utf8' });
    const line = (netstat.stdout || '')
      .split('\n')
      .find((l) => l.includes(`:${port}`) && l.includes('LISTEN'));
    if (!line) return null;
    const match = line.match(/\s(\d+)\/([^\s]+)\s*$/);
    if (match) {
      const pid = parseInt(match[1], 10);
      return Number.isFinite(pid) && pid > 0 ? pid : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 判断某 PID 是否为当前 node 进程树的一部分（用于端口冲突时判断占用者是否本 CLI 相关）。
 * @param {number} pid
 * @returns {boolean}
 */
function isNodePid(pid) {
  if (!pid) return false;
  try {
    if (IS_WINDOWS) {
      const res = spawnSync(
        'tasklist',
        ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
        {
          encoding: 'utf8',
          windowsHide: true,
        }
      );
      return /node\.exe/i.test(res.stdout || '');
    }
    const res = spawnSync('ps', ['-o', 'comm=', '-p', String(pid)], {
      encoding: 'utf8',
    });
    return /node/i.test((res.stdout || '').trim());
  } catch {
    return false;
  }
}

/**
 * 获取某进程的可执行文件绝对路径。
 * 用于区分"本部署包残留的基础服务进程"（runtime/<platform>/ 下）与"外部系统服务"，
 * 避免端口冲突时误杀外部 PG/Redis。
 * @param {number} pid
 * @returns {string|null}
 */
function getProcessExecutablePath(pid) {
  if (!pid) return null;
  try {
    if (IS_WINDOWS) {
      // WMIC 在部分系统已弃用，PowerShell Get-CimInstance 更可靠；两者都试
      const psRes = spawnSync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ExecutablePath`,
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 8000 }
      );
      const psPath = (psRes.stdout || '').trim();
      if (psPath) return psPath;
      const wmicRes = spawnSync(
        'wmic',
        [
          'process',
          'where',
          `ProcessId=${pid}`,
          'get',
          'ExecutablePath',
          '/value',
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 8000 }
      );
      const m = /ExecutablePath=([^\r\n]+)/.exec(wmicRes.stdout || '');
      return m ? m[1].trim() : null;
    }
    // Linux：/proc/<pid>/exe 符号链接
    return fs.existsSync(`/proc/${pid}/exe`)
      ? fs.realpathSync(`/proc/${pid}/exe`)
      : null;
  } catch {
    return null;
  }
}

/**
 * 判断某进程是否属于本 CloudCAD 部署包 runtime（可执行文件路径在 PROJECT_ROOT/runtime/ 下）。
 * 部署包自带的 PG/Redis/cooperate 二进制均位于 runtime/<platform>/ 下；纯开发环境（无 runtime）
 * 的进程来自系统 PATH，不在此目录，故不会被误判。
 * @param {number} pid
 * @returns {boolean}
 */
function isOurRuntimeProcess(pid) {
  const exe = getProcessExecutablePath(pid);
  if (!exe) return false;
  // 统一分隔符（\ 与 / 混用时也能正确匹配），再比较前缀
  const normalize = (p) =>
    p.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
  const runtimeDirNorm = normalize(path.join(PROJECT_ROOT, 'runtime'));
  const exeNorm = normalize(exe);
  return exeNorm.startsWith(runtimeDirNorm + '/') || exeNorm === runtimeDirNorm;
}

/**
 * 判断某进程是否属于**另一个** CloudCAD 部署目录的基础服务。
 *
 * 部署包的服务二进制（postgres.exe / redis-server.exe / node.exe 等）均位于
 * <部署目录>/runtime/<platform>/ 下。可执行文件路径含 /runtime/<platform>/ 段
 * 但不在本目录 runtime/ 下 → 属于同机另一个部署目录的服务（实例：目录 A 的
 * PG 运行中，目录 B 部署时 5432 被 A 的 postgres 占用）。系统自带的 PG/Redis
 *（Program Files / /usr 等）不含该段，不会被误判。
 *
 * 静默复用另一目录的服务会导致本目录 .env 密钥（PII/JWT 等）与对方存量数据
 * 错位（PII 回填校验拦截部署），故调用方须询问用户"停止对方服务起自己的"或
 * 中止部署，而非静默接管。
 * @param {number} pid
 * @returns {boolean}
 */
function isForeignCloudCadRuntimeProcess(pid) {
  const exe = getProcessExecutablePath(pid);
  if (!exe) return false;
  const normalize = (p) =>
    p.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
  const exeNorm = normalize(exe);
  const ourRuntimeNorm = normalize(path.join(PROJECT_ROOT, 'runtime'));
  // 本目录 runtime 下的进程归 isOurRuntimeProcess 处理（残留清理）
  if (exeNorm.startsWith(ourRuntimeNorm + '/')) return false;
  return /\/runtime\/(windows|linux|macos)\//.test(exeNorm);
}

function runInNewWindow(title, command, args) {
  if (IS_WINDOWS) {
    const cmd =
      args.length > 0
        ? `start "${title}" cmd /k "${command} ${args.join(' ')}"`
        : `start "${title}" cmd /k "${command}"`;
    spawn('cmd', ['/c', cmd], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
      shell: true,
    }).unref();
  } else {
    // Linux: 使用 gnome-terminal 或 xterm
    const terminal = process.env.TERM_PROGRAM || 'xterm';
    spawn(terminal, ['-e', `${command} ${args.join(' ')}`], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
    }).unref();
  }
}

module.exports = {
  runCommand,
  runCommandWithProgress,
  runPnpm,
  runPm2,
  runInNewWindow,
  killTree,
  getPm2StatusList,
  getPm2AppStatus,
  getPm2OnlineApps,
  getPidByPort,
  isNodePid,
  getProcessExecutablePath,
  isOurRuntimeProcess,
  isForeignCloudCadRuntimeProcess,
};
