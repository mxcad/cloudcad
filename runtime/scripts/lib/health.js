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

const { spawn } = require('child_process');

const { IS_WINDOWS, IS_LINUX, PORTS } = require('./context');
const { log } = require('./logger');
const { getAdminLoginPath } = require('./admin-login');

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
  isPortOpen,
  waitPortReleased,
};
