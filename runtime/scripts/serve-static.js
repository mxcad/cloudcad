/**
 * 梦想网页CAD实时协同平台 前端静态文件服务
 *
 * 用法: node serve-static.js [options]
 *
 * 选项:
 *   --port <number>     服务端口 (默认: 8000)
 *   --dir <path>        静态文件目录 (默认: ../../packages/frontend/dist)
 *   --mobile-dir <path> 移动端静态文件目录 (默认: ../../packages/frontend_mobile/dist)
 *   --api-target <url>  API 代理目标 (默认: http://localhost:3001)
 *   --spa               SPA 模式，所有路由返回 index.html
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { URL } = require('url');

const { getMobileAccessPathForRuntime } = require('./lib/mobile-access-path');

// 从 myServerConfig.json 读取移动端访问路径名
// （候选清单与运维入口共用 lib/mobile-access-path，勿在此另起一份）
function getMobileAccessPath() {
  return getMobileAccessPathForRuntime(path.resolve(__dirname, '..', '..'));
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const mobileAccessPath = getMobileAccessPath();
  const options = {
    port: parseInt(process.env.FRONTEND_PORT || '8000', 10),
    dir: path.resolve(__dirname, '..', '..', 'packages', 'frontend', 'dist'),
    mobilePath: mobileAccessPath,
    mobileDir: path.resolve(__dirname, '..', '..', 'packages', 'frontend', 'dist', mobileAccessPath),
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
    } else if (args[i] === '--mobile-dir' && args[i + 1]) {
      options.mobileDir = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--mobile-path' && args[i + 1]) {
      options.mobilePath = args[i + 1];
      options.mobileDir = path.resolve(options.dir, args[i + 1]);
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
  '.otf': 'font/otf',
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

// 值得 gzip 压缩的 MIME（高压缩比或大体积：JS/wasm/JSON/HTML/OTF 字体）。
// woff/woff2、图片、音视频、PDF 本身已压缩，跳过；.shx/.lin/.pat/.data 等
// 二进制资产落到 octet-stream 同样不压。
const COMPRESSIBLE_MIME = new Set([
  'text/html',
  'text/css',
  'text/plain',
  'text/xml',
  'application/javascript',
  'application/json',
  'application/wasm',
  'application/xml',
  'image/svg+xml',
  'font/ttf',
  'font/otf',
  'font/eot',
]);

// 解析 Accept-Encoding：仅当客户端显式接受 gzip 且 q>0 时返回 true
// （浏览器默认发 "gzip, deflate, br"；q=0 表示显式拒绝）
function clientAcceptsGzip(req) {
  const ae = req.headers['accept-encoding'];
  if (!ae) return false;
  for (const part of ae.split(',')) {
    const segs = part.trim().split(';');
    if (segs[0].trim().toLowerCase() !== 'gzip') continue;
    let q = 1;
    for (const p of segs.slice(1)) {
      const m = /^\s*q\s*=\s*([0-9.]+)/i.exec(p);
      if (m) q = parseFloat(m[1]);
    }
    return q > 0;
  }
  return false;
}

// 该响应是否按 gzip 下发（返回 'gzip' 或 null）。
// MIME 可能带参数（如 'application/javascript; charset=utf-8'），先剥参数再匹配
function shouldGzip(req, mimeType) {
  if (!COMPRESSIBLE_MIME.has(mimeType.split(';')[0].trim())) return null;
  return clientAcceptsGzip(req) ? 'gzip' : null;
}

// 代理错误「失败侧」由响应头是否已发给客户端派生，而非硬编码。同一条
// "socket hang up" 在 SSE 长连接上，后端 `flushHeaders` 往往早已发出响应头
// （`headersSent` 已为 true），只是连接随后被掐断——硬编码「请求侧」会误标成
// 「后端未回响应头」，把排障引向「后端卡死」的假线索（2026-10-26 前台排障暴露）。
function proxyErrorSide(res) {
  return res.headersSent
    ? '响应侧（响应头已发给客户端）'
    : '请求侧（后端未回响应头）';
}

// 代理错误日志。历史上只打 err.message 有三个盲区：无时间戳，无法与后端日志对齐；
// 无 err.code，无法定性（Node 内部以空 Error 触发时 message 为空串，看着像日志被截断）；
// 无失败侧，无法区分「后端未回响应头」与「后端已开始回包后中断」——同一条
// "socket hang up" 两种情况都会出现。失败侧现由 `proxyErrorSide` 按 `headersSent` 派生。
function logProxyError(side, err, target, req) {
  const e = err || {};
  const message =
    e.message == null || e.message === '' ? '(空 message)' : JSON.stringify(e.message);
  console.error(
    `[代理错误] ${new Date().toISOString()} code=${e.code || 'UNKNOWN'} ` +
      `message=${message} 侧=${side} 后端=${target} ${req.method} ${req.url}`
  );
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

    // 后端响应流中途出错（如 ECONNRESET）：此时响应头往往已发给客户端，
    // 只能中止，不能再 writeHead，否则 ERR_HTTP_HEADERS_SENT 直接崩进程
    proxyRes.on('error', (err) => {
      logProxyError(proxyErrorSide(res), err, target, req);
      if (!res.headersSent) {
        res.writeHead(502);
      }
      res.end();
    });

    proxyRes.pipe(res);
  });

  // 到后端的请求出错（连接被拒/重置等）：
  // 头未发 → 回 502；头已发（后端回包中途断）→ 只能中止，不能重复 writeHead
  proxyReq.on('error', (err) => {
    logProxyError(proxyErrorSide(res), err, target, req);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end(`Proxy Error: ${err.message}`);
    } else {
      res.end();
    }
  });

  // 客户端中途断开（关页面/取消请求）：主动掐断到后端的请求，
  // 否则后端白干到底 + 连接泄漏
  res.on('close', () => {
    proxyReq.destroy();
  });

  // 转发请求体
  req.pipe(proxyReq);
}

// 从指定目录提供静态文件
function serveStaticFile(req, res, filePath, urlPath, options) {
  // 如果是目录，尝试 index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // 检查文件是否存在。预压缩 dist（mxcad-app 引擎产物）只带 <file>.gz、无原始文件，
  // 故原始路径缺失但 <file>.gz 存在时同样视为命中，否则会误走 SPA 回退把 index.html
  // 当 JS/wasm 模块下发（浏览器 import() 一个 text/html → "Failed to fetch dynamically
  // imported module"，整页白屏）。等价于 nginx 的 gzip_static on 行为。
  if (!fs.existsSync(filePath) && !fs.existsSync(filePath + '.gz')) {
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

  const mimeType = getMimeType(filePath);

  const headers = {
    'Content-Type': mimeType,
  };

  // 静态资源缓存。/mxcad-app/* 是运行时原样 dist（index.js、chunks/ 均无 hash），
  // 部署模型是「覆盖服务器 mxcad-app/ 目录即热更新」，强缓存会让已访问用户永久拿到
  // 旧入口，故改按校验下发
  if (!filePath.endsWith('.html')) {
    headers['Cache-Control'] = urlPath.startsWith('/mxcad-app/')
      ? 'no-cache'
      : 'public, max-age=31536000';
  }

  // COOP/COEP：wasm 多线程（SharedArrayBuffer）的前提。浏览器只在顶层文档
  // （index.html）响应上读到这两个头才启用跨源隔离——只加在 .wasm 文件上无效。
  // 与 dev 环境同口径（mxcadAssetsPlugin 的全局中间件对全部响应加这两个头）
  headers['Cross-Origin-Opener-Policy'] = 'same-origin';
  headers['Cross-Origin-Embedder-Policy'] = 'require-corp';

  // gzip 下发：仅当存在预生成 <file>.gz 时直接 pipe（零 CPU，mxcad-app 的 JS/wasm/
  // 配置均自带 .gz）。无预生成 .gz 时绝不做在线 zlib 压缩——zlib 压缩是同步 CPU，
  // 跑在单进程主事件循环，CAD 页并发加载大 chunk 时会阻塞所有标签的前端资源 + /api
  // 代理（2026-10-26 事故）。无 .gz 的文件直接以未压缩形式下发。Vary 防止共享缓存
  // 把 gzip 响应发给不接受 gzip 的客户端
  const hasPreGz = fs.existsSync(filePath + '.gz');
  if (hasPreGz && shouldGzip(req, mimeType)) {
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
    const src = fs.createReadStream(filePath + '.gz');

    // 头必须等流真正打开成功才提交：existsSync 通过之后文件仍可能因权限/竞态
    // 打不开。先 writeHead(200) 再失败只能 res.end()，浏览器拿到的是「声称 200
    // 实则截断」的响应——对 ES 模块表现为 "Failed to fetch dynamically imported
    // module"，HTTP 状态码看不出错，网络面板也查不出 5xx
    src.on('error', (err) => {
      console.error(`[静态服务错误] ${urlPath}: ${err.message}`);
      if (res.headersSent) {
        // 头已发出、状态码无法再改：掐断连接比把截断字节继续发出去好
        res.destroy();
      } else {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });
    src.on('open', () => {
      res.writeHead(200, headers);
      src.pipe(res);
    });
    return;
  }

  // 读取并返回文件（无预生成 .gz，或客户端不接受 gzip 的分支）。原始文件存在则直接发；
  // 预压缩 dist 里仅 <file>.gz 存在（无原始文件）时，解压后以未压缩形式下发（不发
  // Content-Encoding）。此分支不做任何在线压缩。
  if (fs.existsSync(filePath)) {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Internal Server Error');
        return;
      }
      res.writeHead(200, headers);
      res.end(data);
    });
    return;
  }
  fs.readFile(filePath + '.gz', (err, gzData) => {
    if (err) {
      res.writeHead(500);
      res.end('Internal Server Error');
      return;
    }
    zlib.gunzip(gzData, (err2, data) => {
      if (err2) {
        res.writeHead(500);
        res.end('Internal Server Error');
        return;
      }
      res.writeHead(200, headers);
      res.end(data);
    });
  });
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

    // 移动端页面：根据 mobilePath 配置的路径
    const mobilePrefix = '/' + options.mobilePath;
    if (urlPath === mobilePrefix || urlPath.startsWith(mobilePrefix + '/')) {
      const mobileRelPath = urlPath.replace(new RegExp('^' + mobilePrefix), '') || '/';

      // cooperate 模式引擎文件加载：/buf/$<name>.mxb<N>.wgh → 实际文件 <name>
      // 私有 mxcad/mxdraw（1.0.399+/0.1.389+）走此协议，官方旧版不走。
      // <name> 是 URL 解码后的文件名（可能含路径），直接映射到 mobileDir 下。
      const wghMatch = mobileRelPath.match(/^\/buf\/\$(.+)\.mxb\d+\.wgh$/);
      if (wghMatch) {
        const wghName = wghMatch[1];
        const wghFilePath = path.join(options.mobileDir, wghName);
        if (fs.existsSync(wghFilePath)) {
          serveStaticFile(req, res, wghFilePath, urlPath, {
            ...options,
            dir: options.mobileDir,
          });
          return;
        }
        // 文件不存在时落到下面 SPA fallback（返回 404 或 index.html）
      }

      let filePath = path.join(options.mobileDir, mobileRelPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      if (!fs.existsSync(filePath) && options.spa) {
        const indexHtml = path.join(options.mobileDir, 'index.html');
        if (fs.existsSync(indexHtml)) {
          filePath = indexHtml;
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      }

      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      serveStaticFile(req, res, filePath, urlPath, {
        ...options,
        dir: options.mobileDir,
      });
      return;
    }

    // 桌面端静态文件
    let filePath = path.join(options.dir, urlPath);
    serveStaticFile(req, res, filePath, urlPath, options);
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

  server.listen(options.port, '0.0.0.0', () => {
    console.log(`[静态服务] 已启动`);
    console.log(`  桌面端: ${options.dir}`);
    console.log(`  移动端: ${options.mobileDir}`);
    console.log(`  地址: http://localhost:${options.port}`);
    console.log(`  移动端: http://localhost:${options.port}/${options.mobilePath}/`);
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

// PM2/前台模式均以独立 node 进程拉起（spawn/PM2 script），require.main 守卫
// 只影响测试 require 本文件时的行为
if (require.main === module) {
  main();
}

module.exports = {
  createServer,
  clientAcceptsGzip,
  shouldGzip,
  logProxyError,
  proxyErrorSide,
  COMPRESSIBLE_MIME,
};
