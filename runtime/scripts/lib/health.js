/**
 * @fileoverview 端口 / HTTP 健康检查 / 打开浏览器
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - openBrowser：cli.js:197-226
 * - checkHttpHealth：cli.js:228-269
 * - waitAndOpenBrowsers：cli.js:271-319
 * - waitForPort：cli.js:321-359
 *
 * 依赖方向铁律：lib 只允许 require 其他 lib 或独立模块，禁止 require commands。
 */

const path = require('path');
const { spawn } = require('child_process');

const {
  IS_WINDOWS,
  IS_LINUX,
  PORTS,
  USE_RUNTIME,
  PLATFORM_DIR,
  pgLibDir,
} = require('./context');
const { log } = require('./logger');
const { getAdminLoginPath } = require('./admin-login');
const {
  respRequest,
  respReply,
  loadRedisPassword,
} = require('./redis-takeover');

function openBrowser(url) {
  let child;
  try {
    if (IS_WINDOWS) {
      child = spawn('cmd', ['/c', 'start', '', url], {
        detached: true,
        stdio: 'ignore',
      });
    } else if (IS_LINUX) {
      child = spawn('xdg-open', [url], {
        detached: true,
        stdio: 'ignore',
      });
    } else {
      child = spawn('open', [url], {
        detached: true,
        stdio: 'ignore',
      });
    }

    // 处理 spawn 错误，防止未捕获的异常
    child.on('error', () => {
      // 静默忽略打开浏览器的错误
    });

    child.unref();
  } catch {
    // 静默忽略打开浏览器的错误
  }
}

/**
 * 单次 HTTP 健康探测（不重试）：一次 GET，200 → true，其余（非 200 / 连接错误 /
 * 超时）→ false。供自行轮询的调用方（如 verify-deploy 的 waitForService）使用；
 * checkHttpHealth 是内置重试退避的版本，二者共用本探测。
 * @param {number} port
 * @param {string} [path='/health']
 * @param {number} [timeout=5000] 单次请求超时（ms）
 * @returns {Promise<boolean>}
 */
function checkHttpOnce(port, path = '/health', timeout = 5000) {
  const http = require('http');
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'GET',
        timeout,
      },
      (res) => {
        resolve(res.statusCode === 200);
      }
    );

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function checkHttpHealth(port, path, timeout = 60000) {
  const startTime = Date.now();

  // 指数退避：避免服务未就绪时高频探测压垮 DB/后端
  // （每次 /api/health/live 都会触发数据库健康检查，高频连接会加剧负载）
  let attempt = 0;
  const backoffDelay = () => Math.min(1000 * 2 ** attempt++, 10000);

  for (;;) {
    if (await checkHttpOnce(port, path)) return true;
    if (Date.now() - startTime >= timeout) {
      throw new Error(`健康检查超时 (${timeout / 1000}s)`);
    }
    await new Promise((resolve) => setTimeout(resolve, backoffDelay()));
  }
}

/**
 * 组装服务就绪后要打开的页面列表（顺序即标签页打开顺序）。
 * 前端就绪时在其标签页后追加管理员登录入口（同由前端服务承载）。
 * @param {{port: number, url: string}[]} readyServices 已通过就绪检查的服务
 * @returns {string[]} 待打开的 URL 列表
 */
function buildStartupUrls(readyServices) {
  const urls = [];
  for (const service of readyServices) {
    urls.push(service.url);
    if (service.port === PORTS.frontend) {
      urls.push(`http://localhost:${PORTS.frontend}${getAdminLoginPath()}`);
    }
  }
  return urls;
}

async function waitAndOpenBrowsers() {
  log('cyan', '等待所有服务就绪...');

  const services = [
    {
      port: PORTS.backend,
      name: '后端服务',
      path: '/api/health/live',
      type: 'http',
      url: `http://localhost:${PORTS.backend}/api/docs`,
    },
    {
      port: PORTS.configService,
      name: '配置中心',
      path: '/health',
      type: 'http',
      url: `http://localhost:${PORTS.configService}`,
    },
    {
      port: PORTS.frontend,
      name: '前端页面',
      type: 'port',
      url: `http://localhost:${PORTS.frontend}`,
    },
  ];

  const readyServices = [];

  for (const service of services) {
    try {
      if (service.type === 'http') {
        await checkHttpHealth(service.port, service.path, 60000);
      } else {
        await waitForPort(service.port, service.name, 60000);
      }
      log('green', `  ✓ ${service.name} 已就绪`);
      readyServices.push(service);
    } catch (err) {
      log('yellow', `  ⚠ ${service.name} 启动超时，跳过打开浏览器`);
    }
  }

  console.log('');
  log('cyan', '正在打开浏览器...');

  for (const url of buildStartupUrls(readyServices)) {
    openBrowser(url);
  }
}

async function waitForPort(port, name, timeout = 30000) {
  const net = require('net');
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);

      socket.on('connect', () => {
        socket.destroy();
        log('green', `  ✓ ${name} 已就绪 (端口 ${port})`);
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        retry();
      });

      socket.on('error', () => {
        socket.destroy();
        retry();
      });

      socket.connect(port, '127.0.0.1');
    };

    const retry = () => {
      if (Date.now() - startTime >= timeout) {
        reject(new Error(`${name} 启动超时 (${timeout / 1000}s)`));
      } else {
        setTimeout(tryConnect, 500);
      }
    };

    tryConnect();
  });
}

/**
 * pg_isready 可执行文件路径：离线包用捆绑副本，开发环境用 PATH 上的。
 * 与 commands/db-backup 的 getPsqlPath 同属一个 PostgreSQL bin 目录。
 * @returns {string}
 */
function getPgIsReadyPath() {
  if (!USE_RUNTIME) return 'pg_isready';
  return IS_WINDOWS
    ? path.join(PLATFORM_DIR, 'postgresql', 'pgsql', 'bin', 'pg_isready.exe')
    : path.join(PLATFORM_DIR, 'postgres', 'bin', 'pg_isready');
}

/**
 * 单次 PostgreSQL 就绪探测（不重试）。
 *
 * 不能用 net.connect：postmaster 先开监听 socket、再重放 WAL 完成崩溃恢复，
 * 重放期间会正常 accept 连接并立刻回 `FATAL: the database system is starting
 * up`——TCP 通连是必要不充分条件。pg_isready 对该状态返回退出码 2（rejecting），
 * 只有真正接受查询才返回 0。
 * pg_isready 缺失（开发环境未装、或包内文件不全）时降级为 TCP 探测，保持旧行为。
 * @param {number} port
 * @param {string} [host='127.0.0.1']
 * @param {number} [timeout=3000] 单次探测超时（ms）
 * @returns {Promise<boolean>}
 */
async function checkDatabaseOnce(port, host = '127.0.0.1', timeout = 3000) {
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ready);
    };

    // 必须用异步 spawn 而非 spawnSync：pg_isready 要先拿到服务端对 SSLRequest
    // 的应答才发 startup packet，spawnSync 会阻塞事件循环导致探测挂满超时。
    const child = spawn(getPgIsReadyPath(), ['-h', host, '-p', String(port)], {
      stdio: 'ignore',
      windowsHide: true,
      // Linux 捆绑 libpq 需 LD_LIBRARY_PATH，否则 pg_isready 根本起不来
      env: {
        ...process.env,
        LD_LIBRARY_PATH: pgLibDir() || process.env.LD_LIBRARY_PATH,
      },
    });

    timer = setTimeout(() => {
      child.kill();
      finish(false);
    }, timeout);

    child.once('error', (err) => {
      // pg_isready 不在 PATH / 未随包携带（开发环境常见）：降级为 TCP 探测
      finish(err.code === 'ENOENT' ? isPortOpen(port, host, timeout) : false);
    });
    child.once('close', (code) => finish(code === 0));
  });
}

/**
 * 单次 Redis 就绪探测（不重试）：PING 必须回 PONG。
 *
 * 不能用 net.connect：实例加载 RDB/AOF 期间同样先 accept 连接再回
 * `-LOADING Redis is loading the dataset in memory`，TCP 通连不算就绪。
 * 部署包的实例恒带密码，故先 AUTH 再 PING；respRequest 复用 redis-takeover 的
 * 零依赖 RESP 编码，密码含空格/特殊字符也不踩 shell 引号。
 * @param {number} port
 * @param {string} [host='127.0.0.1']
 * @param {number} [timeout=3000] 单次探测超时（ms）
 * @param {string|null} [password] 缺省取 .env 的 REDIS_PASSWORD；测试可显式传空跳过 AUTH
 * @returns {Promise<boolean>}
 */
async function checkRedisOnce(
  port,
  host = '127.0.0.1',
  timeout = 3000,
  password = loadRedisPassword()
) {
  const commands = password ? [['AUTH', password], ['PING']] : [['PING']];
  const { ok, lines } = await respRequest(host, port, commands, timeout);
  if (!ok) return false;
  const replies = lines.map(respReply);
  if (replies.some((reply) => /loading/i.test(reply))) return false;
  return replies.includes('PONG');
}

/**
 * 等待 PostgreSQL 真正接受查询（退避重试）。
 * 部署/迁移前必须用本函数而非 waitForPort：WAL 重放窗口内执行
 * CREATE DATABASE / migrate deploy 会撞 `FATAL: the database system is starting
 * up` 并中止部署（Windows 停机走 taskkill，重启后重放量可能不小）。
 * @param {number} port
 * @param {string} [name='PostgreSQL']
 * @param {number} [timeout=30000] 总超时（ms）
 * @param {string} [host='127.0.0.1']
 */
async function waitForDatabase(
  port,
  name = 'PostgreSQL',
  timeout = 30000,
  host = '127.0.0.1'
) {
  const startTime = Date.now();
  let attempt = 0;
  for (;;) {
    if (await checkDatabaseOnce(port, host)) {
      log('green', `  ✓ ${name} 已就绪 (端口 ${port})`);
      return true;
    }
    if (Date.now() - startTime >= timeout) {
      throw new Error(`${name} 启动超时 (${Math.round(timeout / 1000)}s)`);
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(1000 * 2 ** attempt++, 5000))
    );
  }
}

/**
 * 等待 Redis 真正接受命令（退避重试）。理由见 checkRedisOnce。
 * @param {number} port
 * @param {string} [name='Redis']
 * @param {number} [timeout=30000] 总超时（ms）
 * @param {string} [host='127.0.0.1']
 */
async function waitForRedis(
  port,
  name = 'Redis',
  timeout = 30000,
  host = '127.0.0.1'
) {
  const startTime = Date.now();
  let attempt = 0;
  for (;;) {
    if (await checkRedisOnce(port, host)) {
      log('green', `  ✓ ${name} 已就绪 (端口 ${port})`);
      return true;
    }
    if (Date.now() - startTime >= timeout) {
      throw new Error(`${name} 启动超时 (${Math.round(timeout / 1000)}s)`);
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(1000 * 2 ** attempt++, 5000))
    );
  }
}

/**
 * 单次检测端口是否已被监听。
 * @param {number} port
 * @param {string} [host='127.0.0.1']
 * @param {number} [timeout=1000]
 * @returns {Promise<boolean>}
 */
function isPortOpen(port, host = '127.0.0.1', timeout = 1000) {
  const net = require('net');
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/**
 * 等待端口释放（由占用 → 空闲）。用于清理残留实例后确认端口已让出。
 * @param {number} port
 * @param {number} [timeout=15000]
 * @returns {Promise<boolean>} 端口已释放返回 true；超时返回 false
 */
async function waitPortReleased(port, timeout = 15000) {
  const net = require('net');
  const startTime = Date.now();
  return new Promise((resolve) => {
    const tryCheck = () => {
      const socket = new net.Socket();
      socket.setTimeout(500);
      let finished = false;
      const done = (result) => {
        if (!finished) {
          finished = true;
          socket.destroy();
          if (result) resolve(true);
          else if (Date.now() - startTime >= timeout) resolve(false);
          else setTimeout(tryCheck, 300);
        }
      };
      socket.once('connect', () => done(false)); // 仍被占用
      socket.once('timeout', () => done(false)); // 无响应视为可能仍在半关闭
      socket.once('error', () => done(true)); // 连接失败 = 已释放
      socket.connect(port, '127.0.0.1');
    };
    tryCheck();
  });
}

module.exports = {
  openBrowser,
  checkHttpOnce,
  checkHttpHealth,
  buildStartupUrls,
  waitAndOpenBrowsers,
  waitForPort,
  getPgIsReadyPath,
  checkDatabaseOnce,
  waitForDatabase,
  checkRedisOnce,
  waitForRedis,
  isPortOpen,
  waitPortReleased,
};
