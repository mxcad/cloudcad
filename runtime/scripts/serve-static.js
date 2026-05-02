/**
 * CloudCAD 前端静态文件服务
 *
 * 用法: node serve-static.js [options]
 *
 * 选项:
 *   --port <number>     服务端口 (默认: 3000)
 *   --dir <path>        静态文件目录 (默认: ../../packages/frontend/dist)
 *   --api-target <url>  API 代理目标 (默认: http://localhost:3001)
 *   --spa               SPA 模式，所有路由返回 index.html
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    port: parseInt(process.env.FRONTEND_PORT || '3000', 10),
    dir: path.resolve(__dirname, '..', '..', 'packages', 'frontend', 'dist'),
    apiTarget: process.env.BACKEND_URL || 'http://localhost:3001',
    spa: true,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      options.port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dir' && args[i + 1]) {
      options.dir = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--api-target' && args[i + 1]) {
      options.apiTarget = args[i + 1];
      i++;
    } else if (args[i] === '--spa') {
      options.spa = true;
    } else if (args[i] === '--no-spa') {
      options.spa = false;
    }
  }

  return options;
}

// MIME 类型映射
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.data': 'application/octet-stream',
  '.mem': 'application/octet-stream',
};

// 获取 MIME 类型
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// API 代理函数
function proxyRequest(req, res, target) {
  const targetUrl = new URL(target);
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host,
      // 建议：传递真实的客户端 IP，方便后端记录日志或做限流
      'x-forwarded-for': req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'http',
    },
  };

  const protocol = targetUrl.protocol === 'https:' ? https : http;

  const proxyReq = protocol.request(options, (proxyRes) => {
    
    // 1. 复制所有响应头
    const headers = { ...proxyRes.headers };

    // 2. 特殊处理 Set-Cookie
    // proxyRes.headers['set-cookie'] 通常是一个数组 ['cookie1=...', 'cookie2=...']
    // 如果直接展开 {...headers}，数组会变成逗号分隔的字符串，导致浏览器无法识别
    if (proxyRes.headers['set-cookie']) {
      // 强制设置为数组形式，确保浏览器能正确解析
      res.setHeader('set-cookie', proxyRes.headers['set-cookie']);
    }

    // 3. 处理 CORS (如果需要跨域)
    // 如果前端端口和代理端口不一致，需要允许跨域凭证
    // 注意：Access-Control-Allow-Origin 不能是 *，必须是具体域名或镜像请求头的 Origin
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // 4. 发送响应头
    res.writeHead(proxyRes.statusCode, headers);

    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[代理错误] ${err.message}`);
    res.writeHead(502);
    res.end(`Proxy Error: ${err.message}`);
  });

  // 转发请求体
  req.pipe(proxyReq);
}

// 创建服务器
function createServer(options) {
  const server = http.createServer((req, res) => {
    // API 代理：/api 路径代理到后端
    if (req.url.startsWith('/api/')) {
      proxyRequest(req, res, options.apiTarget);
      return;
    }

    // 解码 URL
    let urlPath = decodeURIComponent(req.url.split('?')[0]);

    // 安全检查：防止路径遍历攻击
    if (urlPath.includes('..')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // 构建文件路径
    let filePath = path.join(options.dir, urlPath);

    // 如果是目录，尝试 index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      // SPA 模式：返回 index.html
      if (options.spa) {
        const indexHtml = path.join(options.dir, 'index.html');
        if (fs.existsSync(indexHtml)) {
          filePath = indexHtml;
        } else {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
      } else {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
    }

    // 读取并返回文件
    const mimeType = getMimeType(filePath);

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Internal Server Error');
        return;
      }

      // WASM 需要特殊响应头
      const headers = {
        'Content-Type': mimeType,
      };

      // 静态资源缓存
      if (!filePath.endsWith('.html')) {
        headers['Cache-Control'] = 'public, max-age=31536000';
      }

      // WASM 支持
      if (filePath.endsWith('.wasm')) {
        headers['Cross-Origin-Opener-Policy'] = 'same-origin';
        headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
      }

      res.writeHead(200, headers);
      res.end(data);
    });
  });

  return server;
}

// 主函数
function main() {
  const options = parseArgs();

  // 检查目录是否存在
  if (!fs.existsSync(options.dir)) {
    console.error(`[错误] 静态文件目录不存在: ${options.dir}`);
    console.error('请先运行构建命令: pnpm build');
    process.exit(1);
  }

  const server = createServer(options);

  server.listen(options.port, () => {
    console.log(`[静态服务] 已启动`);
    console.log(`  目录: ${options.dir}`);
    console.log(`  地址: http://localhost:${options.port}`);
    console.log(`  API 代理: /api -> ${options.apiTarget}`);
    console.log(`  SPA:  ${options.spa ? '启用' : '禁用'}`);
  });

  // 优雅关闭
  process.on('SIGTERM', () => {
    console.log('[静态服务] 正在关闭...');
    server.close(() => {
      console.log('[静态服务] 已关闭');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('\n[静态服务] 正在关闭...');
    server.close(() => {
      console.log('[静态服务] 已关闭');
      process.exit(0);
    });
  });
}

main();
