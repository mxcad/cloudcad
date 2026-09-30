/**
 * Redis 进程管理包装脚本
 * 
 * 用于 PM2 管理 Redis
 */

const { spawn, spawnSync } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { readEnvInt } = require('./lib/env');

const PLATFORM = os.platform();
const IS_WINDOWS = PLATFORM === 'win32';

// 密码解析与 redis-cli 路径统一从 lib 取（单一事实源：门禁探测与实际生效的
// 密码不能漂移）。注意 redis-takeover 是纯函数库（无顶层副作用），require 安全。
const {
  loadRedisPassword,
  getRedisCliPath,
  probeRedisAuth,
  setRedisPasswordAtRuntime,
} = require('./lib/redis-takeover');

// 配置
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_DIR = path.resolve(__dirname, '..');
const PLATFORM_DIR = IS_WINDOWS 
  ? path.join(RUNTIME_DIR, 'windows')
  : path.join(RUNTIME_DIR, 'linux');

const USE_RUNTIME = fs.existsSync(PLATFORM_DIR);
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const REDIS_DATA_DIR = path.join(DATA_DIR, 'redis');

// 后端 .env 路径：PM2 拉起本脚本时不注入业务端口，直调
// （`node redis-manager.js status|stop`）时环境变量通常也没设——若不回落 .env
// 就会去探 6379 默认端口，判定与实际操作全错。解析走 lib/env.js readEnvInt
// （此前本文件自写一份 `^key=\d+` 正则）。
const BACKEND_ENV_PATH = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');

// Redis 端口：环境变量优先，否则取后端 .env 的 REDIS_PORT（单一事实源）
const REDIS_PORT =
  parseInt(process.env.REDIS_PORT || '0', 10) ||
  readEnvInt(BACKEND_ENV_PATH, 'REDIS_PORT', 6379);

// 可执行文件路径
const redisServer = USE_RUNTIME
  ? (IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'redis', 'redis-server.exe')
      : path.join(PLATFORM_DIR, 'redis', 'redis-server'))
  : 'redis-server';

// Linux 下需要设置 LD_LIBRARY_PATH
const REDIS_LIB_DIR = USE_RUNTIME && !IS_WINDOWS
  ? path.join(PLATFORM_DIR, 'redis', 'lib')
  : null;

// 确保目录存在
if (!fs.existsSync(REDIS_DATA_DIR)) {
  fs.mkdirSync(REDIS_DATA_DIR, { recursive: true });
}

function log(level, message) {
  const colors = {
    info: '\x1b[32m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[level] || ''}[REDIS-${level.toUpperCase()}]${colors.reset} ${message}`);
}

// 检查 Redis 是否已在运行
function isRunning() {
  return new Promise((resolve) => {
    const socket = net.connect(REDIS_PORT, 'localhost');
    let resolved = false;
    
    socket.on('connect', () => {
      if (!resolved) {
        resolved = true;
        socket.end();
        resolve(true);
      }
    });
    
    socket.on('error', () => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });
    
    // 超时处理
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    }, 2000);
  });
}

// 查找占用端口的进程 PID（Windows netstat / Linux ss、lsof），失败返回 null
function getPidByPort(port) {
  try {
    if (IS_WINDOWS) {
      const res = spawnSync('netstat', ['-ano', '-p', 'TCP'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 8000,
      });
      const line = (res.stdout || '')
        .split('\n')
        .find((l) => l.includes(`:${port}`) && l.includes('LISTENING'));
      if (!line) return null;
      const pid = parseInt(line.trim().split(/\s+/).pop(), 10);
      return Number.isFinite(pid) && pid > 0 ? pid : null;
    }
    const ss = spawnSync('ss', ['-tlnp'], { encoding: 'utf8', timeout: 8000 });
    const ssLine = (ss.stdout || '')
      .split('\n')
      .find((l) => l.includes(`:${port}`) && l.includes('LISTEN'));
    if (ssLine) {
      const m = /pid=(\d+)/.exec(ssLine);
      if (m) return parseInt(m[1], 10);
    }
    const lsof = spawnSync(
      'lsof',
      ['-t', '-i', `:${port}`, '-sTCP:LISTEN'],
      { encoding: 'utf8', timeout: 8000 }
    );
    const lsofPid = parseInt((lsof.stdout || '').trim(), 10);
    return Number.isFinite(lsofPid) && lsofPid > 0 ? lsofPid : null;
  } catch {
    return null;
  }
}

// 按 PID 强制停止：Windows taskkill /T /F（连包装层一起杀树）；Linux
// SIGTERM（redis 优雅退出落盘 AOF）→ 等待 → 仍未退出再 SIGKILL
function killPid(pid) {
  if (!pid) return false;
  try {
    if (IS_WINDOWS) {
      const res = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'pipe',
        windowsHide: true,
        timeout: 10000,
      });
      return res.status === 0 || res.status === 128;
    }
    try {
      process.kill(pid, 'SIGTERM');
    } catch (err) {
      return err.code === 'ESRCH';
    }
    return true;
  } catch {
    return false;
  }
}

// 等待端口释放（killPid 后 redis 退出/落盘需要时间）
async function waitPortReleased(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await isRunning())) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return !(await isRunning());
}

// Linux SIGTERM 后等待进程退出，超时升级 SIGKILL（Windows taskkill /F 无需升级）
async function escalateKill(pid) {
  if (IS_WINDOWS) return killPid(pid);
  if (!killPid(pid)) return false;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (err) {
      return err.code === 'ESRCH';
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* 已退出 */
  }
  return true;
}

/**
 * 停掉端口上的实例（不管它是谁的）：先试 redis-cli 优雅 shutdown（无密码实例
 * 可成），不行再按 PID 强杀。用于"端口被不接受本目录 .env 密码的实例占用"时
 * 让位重起，以及 stop 命令的强制兜底。
 */
async function stopPortInstance() {
  const redisCli = getRedisCliPath();
  spawnSync(redisCli, ['shutdown', 'nosave'], {
    stdio: 'pipe',
    timeout: 5000,
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (!(await isRunning())) return true;

  const pid = getPidByPort(REDIS_PORT);
  if (!pid) {
    log('error', `无法定位占用端口 ${REDIS_PORT} 的进程，停止失败`);
    return false;
  }
  log('warn', `优雅停止未生效，强制停止进程 (PID ${pid})...`);
  if (!(await escalateKill(pid))) {
    log('error', `强制停止进程 (PID ${pid}) 失败`);
    return false;
  }
  const released = await waitPortReleased(10000);
  if (!released) {
    log('error', `进程已终止但端口 ${REDIS_PORT} 仍未释放`);
    return false;
  }
  return true;
}

// 启动 Redis
function startRedis() {
  return new Promise((resolve, reject) => {
    log('info', '启动 Redis...');
    
    // 加载 Redis 密码配置
    const redisPassword = loadRedisPassword();
    
    // 构建 Redis 启动参数
    const redisArgs = [
      '--port', String(REDIS_PORT),
      '--dir', REDIS_DATA_DIR,
      '--appendonly', 'yes'
    ];
    
    // requirepass 走配置文件而非命令行参数：命令行对机器上所有本机会话可见
    // （Get-CimInstance Win32_Process / tasklist / Process Explorer），密码会随
    // 进程列表泄漏。配置文件落在数据目录下，权限随数据目录走。
    // --port/--dir/--appendonly 必须留在命令行：detectRedisOwnership 靠 cmdline
    // 里的数据目录判实例归属，移进配置文件会让整套接管逻辑失效。
    if (redisPassword) {
      const authConf = path.join(REDIS_DATA_DIR, 'cloudcad-redis-auth.conf');
      const quoted = redisPassword.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      try {
        fs.writeFileSync(authConf, `requirepass "${quoted}"\n`, 'utf8');
        try {
          fs.chmodSync(authConf, 0o600);
        } catch {
          /* Windows 无 POSIX 权限位，chmod 无效但无害 */
        }
        redisArgs.unshift(authConf);
        log('info', '已配置 Redis 密码认证（经配置文件传入，不出现在进程列表）');
      } catch (err) {
        // 配置文件写不进去（只读盘等）就退回命令行参数：可见性退让，但不能因此拒绝启动
        log('warn', `写入 redis 密码配置文件失败（${err.message}），退回 --requirepass 命令行参数`);
        redisArgs.push('--requirepass', redisPassword);
      }
    } else {
      log('info', 'Redis 无密码模式');
    }

    const redisProcess = spawn(redisServer, redisArgs, {
      stdio: 'inherit',
      windowsHide: true,
      // 不走 shell：数组传参由 Node 处理引用，路径含空格也安全；走 shell 时
      // redisProcess 是 cmd.exe 包装层，停止信号只杀得到 cmd.exe，
      // redis-server.exe 会孤儿化继续占端口（Windows 下"redis 停不掉"的根因）
      detached: false,
      env: REDIS_LIB_DIR
        ? { ...process.env, LD_LIBRARY_PATH: `${REDIS_LIB_DIR}:${process.env.LD_LIBRARY_PATH || ''}` }
        : process.env
    });
    
    redisProcess.on('error', (err) => {
      log('error', `启动失败: ${err.message}`);
      reject(err);
    });
    
    // 循环等待端口就绪（而非单次固定延时检测）：Redis 加载 appendonly 文件可能耗时
    // 数秒，单次 2s 检测在慢盘/大 AOF 时误判"启动超时"→ main() exit(1) → PM2 反复重启
    // 最终 stopped（实例：redis ↺=1 stopped）。改为最多 READY_WAIT_MS 内轮询端口。
    const READY_WAIT_MS = 20000;
    const READY_POLL_MS = 300;
    const startTime = Date.now();
    const waitReady = async () => {
      if (await isRunning()) {
        log('info', 'Redis 启动成功');
        resolve(redisProcess);
        return;
      }
      // 子进程已退出且非信号终止 → 明确失败，立即 reject，避免白等
      if (redisProcess.exitCode !== null && redisProcess.exitCode !== 0) {
        reject(new Error(`Redis 进程退出，退出码 ${redisProcess.exitCode}`));
        return;
      }
      if (Date.now() - startTime >= READY_WAIT_MS) {
        reject(new Error(`Redis 启动超时（${READY_WAIT_MS / 1000}s）`));
        return;
      }
      setTimeout(waitReady, READY_POLL_MS);
    };
    setTimeout(waitReady, READY_POLL_MS);
    
    redisProcess.on('exit', (code, signal) => {
      if (signal) {
        log('info', `进程被信号 ${signal} 终止`);
      } else if (code !== 0) {
        log('error', `进程异常退出，退出码: ${code}`);
      } else {
        log('info', '服务已正常停止');
      }
    });
    
    // 优雅退出
    const shutdown = (signal) => {
      log('info', `收到 ${signal} 信号，正在停止...`);
      redisProcess.kill('SIGTERM');
      setTimeout(() => {
        redisProcess.kill('SIGKILL');
        process.exit(0);
      }, 5000);
    };
    
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    if (IS_WINDOWS) {
      process.on('SIGBREAK', () => shutdown('SIGBREAK'));
    }
  });
}

/**
 * 保持父进程存活并周期检测 Redis 状态（PM2 托管语义）。
 * 无论 Redis 是"已在运行"还是"本次新启动"，此函数都接管进程生命周期：
 * - 进程未退出：保持存活（process.stdin.resume()），避免 PM2 误判 stopped；
 * - 进程退出：循环尝试重启（startRedis 已内置端口就绪等待）。
 */
async function keepAlive() {
  const checkInterval = setInterval(async () => {
    if (!await isRunning()) {
      log('warn', 'Redis 进程已退出，尝试重启...');
      try {
        await startRedis();
      } catch (err) {
        log('error', 'Redis 重启失败');
        process.exit(1);
      }
    }
  }, 5000);

  // 防止进程退出
  process.stdin.resume();

  // 保持 checkInterval 引用，防 GC（Node 中 interval 会持活 event loop，此引用仅为可读性）
  return checkInterval;
}

/**
 * 端口已被监听时，确保该实例接受本目录 .env 的 REDIS_PASSWORD：
 * - 密码正确 → 采纳（keepAlive 托管语义不变）；
 * - 无密码实例 → 运行中 CONFIG SET 设密（不停机、不动数据）后采纳；
 * - 密码不一致（另一部署目录/人工拉的实例）→ 停掉它，重起本目录实例。
 * 不做这个校验的后果：本目录后端 AUTH 恒失败，而 PM2 的 redis app 却显示
 * online——故障被包装进程的"健康"状态伪装，只能靠重启电脑清场。
 * @returns {Promise<'adopted'|'restarted'|'failed'>}
 */
async function ensurePortInstanceUsable() {
  const password = loadRedisPassword();
  if (!password) return 'adopted'; // 无密码模式：维持既有采纳行为

  const probe = await probeRedisAuth('127.0.0.1', REDIS_PORT, password);
  if (probe.state === 'ok') return 'adopted';

  if (probe.state === 'noauth') {
    log('warn', '端口上的 redis 实例未设密码，运行中设置为 .env 的 REDIS_PASSWORD...');
    const set = await setRedisPasswordAtRuntime('127.0.0.1', REDIS_PORT, password);
    if (set.ok) {
      log('info', '[✓] 密码已设置（未重启实例，数据不受影响）');
      return 'adopted';
    }
    log('warn', `运行中设密失败（${set.reason}），转为一停一起...`);
  } else {
    log(
      'warn',
      `端口 ${REDIS_PORT} 上的 redis 实例密码与 .env 不一致（${probe.reason || '另一部署目录或人工实例'}），停止并重起本目录实例...`
    );
  }

  if (!(await stopPortInstance())) return 'failed';
  return 'restarted';
}

async function main() {
  // 检查是否已在运行
  if (await isRunning()) {
    const action = await ensurePortInstanceUsable();
    if (action === 'failed') {
      log('error', '无法让端口上的 redis 实例接受本目录配置，退出（PM2 将标记 errored）');
      process.exit(1);
    }
    if (action === 'adopted') {
      log('info', `Redis 已在运行（端口 ${REDIS_PORT}）`);
      log('info', '保持进程存活以维持 PM2 状态...');
      await keepAlive();
      return;
    }
    // 'restarted'：旧实例已清掉，继续走下方 startRedis 拉起本目录实例
  }

  // 启动 Redis（startRedis 内部循环等待端口就绪，避免慢盘/AOF 加载误判超时）
  try {
    await startRedis();
    log('info', '保持进程存活以维持 PM2 状态...');
    await keepAlive();
  } catch (err) {
    log('error', `Redis 启动失败: ${err.message}`);
    process.exit(1);
  }
}

// 停止 Redis：先走 redis-cli 优雅 shutdown（本目录密码），失败（常见：端口上
// 是另一部署目录/人工实例，密码与本目录 .env 不一致，shutdown 被 NOAUTH 拒绝）
// 则按 PID 强杀兜底——stop 必须保证端口真正释放，否则整条"停了再起"链路失效。
async function stopRedis() {
  if (!await isRunning()) {
    log('info', 'Redis 未运行');
    return true;
  }

  log('info', '停止 Redis...');

  const redisCli = getRedisCliPath();

  // 加载 Redis 密码配置
  const redisPassword = loadRedisPassword();

  // 构建 redis-cli 参数。密码走 REDISCLI_AUTH 环境变量而非 `-a` 参数——
  // 命令行对本机所有会话可见（Get-CimInstance Win32_Process / tasklist /
  // Process Explorer），env 只进子进程。与 stop.js 的 stopRedisForDataDir 同口径。
  const cliArgs = ['shutdown', 'nosave'];
  const cliEnv = { ...process.env };
  if (redisPassword) cliEnv.REDISCLI_AUTH = redisPassword;

  const result = spawnSync(redisCli, cliArgs, {
    stdio: 'pipe',
    timeout: 5000,
    env: cliEnv,
  });
  if (result.status !== 0 && result.stderr) {
    // 不静默：密码不一致/连接失败等必须留痕，否则"看起来停了其实没停"
    log('warn', `redis-cli shutdown 未成功: ${String(result.stderr).trim().slice(0, 200)}`);
  }

  // 等待一下再检查
  await new Promise(resolve => setTimeout(resolve, 1000));

  if (!await isRunning()) {
    log('info', 'Redis 已停止');
    return true;
  }

  log('warn', '优雅停止未生效，强制停止...');
  if (!(await stopPortInstance())) {
    log('error', 'Redis 停止失败，端口仍被占用');
    return false;
  }
  log('info', 'Redis 已停止');
  return true;
}

// 命令行支持
const args = process.argv.slice(2);
const command = args[0];

if (command === 'status') {
  isRunning().then(running => {
    console.log(running ? 'running' : 'stopped');
    process.exit(running ? 0 : 1);
  });
} else if (command === 'stop') {
  stopRedis();
} else {
  main();
}
