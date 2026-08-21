/**
 * CloudCAD 部署配置中心
 * 0 依赖独立服务，纯 Node.js 原生模块实现
 *
 * 端口: 3002
 * 认证: 使用 INITIAL_ADMIN_PASSWORD
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { log, sendJson } = require('./lib/utils');
const { PUBLIC_DIR, FRONTEND_DIST_DIR, PORT } = require('./lib/constants');

const routes = [
  require('./routes/auth'),
  require('./routes/system-config'),
  require('./routes/brand-config'),
  require('./routes/ui-config'),
  require('./routes/runtime-config'),
  require('./routes/database'),
  require('./routes/service'),
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 健康检查端点
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() })
    );
    return;
  }

  // API 请求
  if (pathname.startsWith('/api/')) {
    try {
      let handled = false;
      for (const route of routes) {
        if (await route.handle(req, res, pathname, method)) {
          handled = true;
          break;
        }
      }
      if (!handled) {
        sendJson(res, 404, { error: '接口不存在' });
      }
    } catch (err) {
      log('error', `API 错误: ${err.message}`);
      sendJson(res, 500, { error: '服务器内部错误' });
    }
    return;
  }

  // 静态文件
  let filePath = path.join(
    PUBLIC_DIR,
    pathname === '/' ? 'index.html' : pathname
  );

  // 如果 public 找不到 /brand/ 文件,回退到 frontend/dist
  if (!fs.existsSync(filePath) && pathname.startsWith('/brand/')) {
    filePath = path.join(FRONTEND_DIST_DIR, pathname);
  }

  if (
    !filePath.startsWith(PUBLIC_DIR) &&
    !filePath.startsWith(FRONTEND_DIST_DIR)
  ) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not Found');
      } else {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
      return;
    }

    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
    };

    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(content);
  });
});

server.listen(PORT, () => {
  log('info', `部署配置中心已启动: http://localhost:${PORT}`);
  log('info', '使用 INITIAL_ADMIN_PASSWORD 进行管理员登录');
});

process.on('SIGTERM', () => {
  log('info', '正在关闭服务...');
  server.close(() => {
    log('info', '服务已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('info', '正在关闭服务...');
  server.close(() => {
    log('info', '服务已关闭');
    process.exit(0);
  });
});
