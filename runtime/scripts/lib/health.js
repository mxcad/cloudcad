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

async function checkHttpHealth(port, path, timeout = 60000) {
  const http = require('http');
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    // 指数退避：避免服务未就绪时高频探测压垮 DB/后端
    // （每次 /api/health/live 都会触发数据库健康检查，高频连接会加剧负载）
    let attempt = 0;
    const backoffDelay = () =>
      Math.min(1000 * 2 ** attempt++, 10000);

    const tryCheck = () => {
      const req = http.request(
        {
          hostname: 'localhost',
          port,
          path,
          method: 'GET',
          timeout: 5000,
        },
        (res) => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            retry();
          }
        }
      );

      req.on('error', () => retry());
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
      req.end();
    };

    const retry = () => {
      if (Date.now() - startTime >= timeout) {
        reject(new Error(`健康检查超时 (${timeout / 1000}s)`));
      } else {
        setTimeout(tryCheck, backoffDelay());
      }
    };

    tryCheck();
  });
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

  for (const service of readyServices) {
    openBrowser(service.url);
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
  checkHttpHealth,
  waitAndOpenBrowsers,
  waitForPort,
  isPortOpen,
  waitPortReleased,
};
