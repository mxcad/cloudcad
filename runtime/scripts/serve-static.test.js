/**
 * serve-static.js gzip 下发回归测试（node:test，0 外部依赖）
 *
 * 背景缺陷（2026-10-26 4G 加载分析）：静态服务恒发原始字节，dist 里预生成的
 * .gz 文件（mxcad-app 的 JS/wasm/配置自带）从未被使用——CAD 页首载 ~53MB 原始
 * 体积，4G 下 2~4 分钟。修复：客户端接受 gzip 时优先下发预生成 <file>.gz
 * （零 CPU），否则 zlib 在线压缩；响应带 Vary: Accept-Encoding 防共享缓存串味。
 * 同批修复：COOP/COEP 从「只加在 .wasm」扩到全部静态响应——浏览器只在顶层
 * 文档读到这两个头才启用跨源隔离，原实现下生产环境 SharedArrayBuffer 不可用、
 * wasm 多线程（wasmConfig.type=2d）实际失效。
 *
 * 端到端用例用原始 http.request 而非 fetch：undici 的 fetch 会透明解码
 * Content-Encoding，用 fetch 测不到「声称 gzip 实际发原始字节」这类线上事故。
 *
 * 运行：node --test runtime/scripts/serve-static.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const stream = require('stream');

const {
  createServer,
  clientAcceptsGzip,
  shouldGzip,
  logProxyError,
} = require('./serve-static');

// --- clientAcceptsGzip ---

test('clientAcceptsGzip: 无头 / 不含 gzip → false', () => {
  assert.equal(clientAcceptsGzip({ headers: {} }), false);
  assert.equal(
    clientAcceptsGzip({ headers: { 'accept-encoding': 'deflate, br' } }),
    false
  );
});

test('clientAcceptsGzip: 浏览器默认 "gzip, deflate, br" → true', () => {
  assert.equal(
    clientAcceptsGzip({ headers: { 'accept-encoding': 'gzip, deflate, br' } }),
    true
  );
});

test('clientAcceptsGzip: q=0 表示显式拒绝，q>0 接受', () => {
  assert.equal(
    clientAcceptsGzip({ headers: { 'accept-encoding': 'gzip;q=0, br' } }),
    false
  );
  assert.equal(
    clientAcceptsGzip({ headers: { 'accept-encoding': 'br, gzip;q=0.5' } }),
    true
  );
});

test('clientAcceptsGzip: 大小写不敏感', () => {
  assert.equal(
    clientAcceptsGzip({ headers: { 'accept-encoding': 'GZIP' } }),
    true
  );
});

// --- shouldGzip ---

test('shouldGzip: 不可压缩类型永不压缩（图片/woff2/二进制）', () => {
  const req = { headers: { 'accept-encoding': 'gzip' } };
  assert.equal(shouldGzip(req, 'image/png'), null);
  assert.equal(shouldGzip(req, 'font/woff2'), null);
  assert.equal(shouldGzip(req, 'application/octet-stream'), null);
});

test('shouldGzip: 可压缩类型 + 客户端接受 → gzip', () => {
  const req = { headers: { 'accept-encoding': 'gzip, br' } };
  assert.equal(shouldGzip(req, 'application/javascript'), 'gzip');
  assert.equal(shouldGzip(req, 'application/wasm'), 'gzip');
  assert.equal(shouldGzip(req, 'text/html'), 'gzip');
  assert.equal(shouldGzip(req, 'font/otf'), 'gzip');
});

test('shouldGzip: 客户端不接受 → null', () => {
  assert.equal(shouldGzip({ headers: {} }, 'application/javascript'), null);
});

// --- 端到端：真实 HTTP 请求（原始 http，保留线上字节） ---

const JS_BODY = 'console.log("cloudcad");\n'.repeat(2000); // ~50KB，压缩比高
// 仅预生成 .gz、无原始文件的形态（mxcad-app 引擎产物：chunks/、wasm/ 均只带 .gz）。
// 回归：serveStaticFile 曾只按原始路径判存在性，gz-only 文件误走 SPA 回退把
// index.html 当 JS 模块下发 → 浏览器 import() 一个 text/html → 整页白屏。
const ONLY_GZ_BODY = '/* engine chunk */ console.log("onlygz");\n'.repeat(500);

function rawGet(port, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: urlPath, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    req.on('error', reject);
  });
}

async function withServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-static-'));
  const mobileDir = path.join(dir, 'mxcad_mobile');
  fs.mkdirSync(mobileDir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), '<html>desktop</html>');
  fs.writeFileSync(path.join(dir, 'app.js'), JS_BODY);
  fs.writeFileSync(
    path.join(dir, 'app.js.gz'),
    zlib.gzipSync(JS_BODY, { level: 6 })
  );
  fs.writeFileSync(path.join(dir, 'logo.png'), Buffer.from([0x89, 0x50]));
  fs.writeFileSync(path.join(dir, 'font.otf'), Buffer.alloc(2048, 3));
  const wasmDir = path.join(dir, 'mxcad-app', 'mxcadAppAssets', 'wasm', '2d');
  fs.mkdirSync(wasmDir, { recursive: true });
  const wasmBody = Buffer.alloc(4096, 7);
  fs.writeFileSync(path.join(wasmDir, 'x.wasm'), wasmBody);
  fs.writeFileSync(
    path.join(wasmDir, 'x.wasm.gz'),
    zlib.gzipSync(wasmBody, { level: 6 })
  );
  // 仅 .gz、无原始文件（引擎产物形态）
  fs.writeFileSync(
    path.join(dir, 'onlygz.js.gz'),
    zlib.gzipSync(ONLY_GZ_BODY, { level: 6 })
  );
  fs.writeFileSync(path.join(mobileDir, 'index.html'), '<html>mobile</html>');

  const server = createServer({
    port: 0,
    dir,
    mobilePath: 'mxcad_mobile',
    mobileDir,
    apiTarget: 'http://127.0.0.1:1',
    spa: true,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('gzip: 客户端接受时优先下发预生成 .gz，带 Vary，解码后与原文一致', async () => {
  await withServer(async (port) => {
    const res = await rawGet(port, '/app.js', { 'accept-encoding': 'gzip' });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-encoding'], 'gzip');
    assert.equal(res.headers['vary'], 'Accept-Encoding');
    assert.equal(res.headers['content-type'], 'application/javascript; charset=utf-8');
    // COOP/COEP 覆盖全部静态响应（wasm 多线程前提，与 dev 同口径）
    assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin');
    assert.equal(res.headers['cross-origin-embedder-policy'], 'require-corp');
    assert.equal(zlib.gunzipSync(res.body).toString('utf8'), JS_BODY);
  });
});

test('gzip: 无预生成 .gz 时 zlib 在线压缩（应用外壳 assets/ 场景）', async () => {
  await withServer(async (port) => {
    const res = await rawGet(port, '/index.html', { 'accept-encoding': 'gzip' });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-encoding'], 'gzip');
    assert.equal(
      zlib.gunzipSync(res.body).toString('utf8'),
      '<html>desktop</html>'
    );
  });
});

test('gzip: 客户端不带 Accept-Encoding 时发原始字节（旧客户端兼容）', async () => {
  await withServer(async (port) => {
    const res = await rawGet(port, '/app.js');
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-encoding'], undefined);
    assert.equal(res.headers['vary'], undefined);
    assert.equal(res.body.toString('utf8'), JS_BODY);
  });
});

test('gzip: Accept-Encoding: gzip;q=0 显式拒绝时发原始字节', async () => {
  await withServer(async (port) => {
    const res = await rawGet(port, '/app.js', { 'accept-encoding': 'gzip;q=0' });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-encoding'], undefined);
    assert.equal(res.body.toString('utf8'), JS_BODY);
  });
});

test('gzip: 不可压缩类型即使客户端接受也发原始字节', async () => {
  await withServer(async (port) => {
    const res = await rawGet(port, '/logo.png', { 'accept-encoding': 'gzip' });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-encoding'], undefined);
  });
});

test('gzip: otf 字体走在线压缩（syadobe.otf 7.9MB 场景）', async () => {
  await withServer(async (port) => {
    const res = await rawGet(port, '/font.otf', { 'accept-encoding': 'gzip' });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'font/otf');
    assert.equal(res.headers['content-encoding'], 'gzip');
    assert.equal(zlib.gunzipSync(res.body).length, 2048);
  });
});

test('gzip: wasm 走 .gz 兄弟文件且保留 COOP/COEP 头', async () => {
  await withServer(async (port) => {
    const res = await rawGet(port, '/mxcad-app/mxcadAppAssets/wasm/2d/x.wasm', {
      'accept-encoding': 'gzip',
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-encoding'], 'gzip');
    assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin');
    assert.equal(res.headers['cross-origin-embedder-policy'], 'require-corp');
    const body = zlib.gunzipSync(res.body);
    assert.equal(body.length, 4096);
  });
});

test('gzip: 仅预生成 .gz（无原始文件）时按正确 Content-Type 下发，不误走 SPA 回退', async () => {
  await withServer(async (port) => {
    const res = await rawGet(port, '/onlygz.js', { 'accept-encoding': 'gzip' });
    assert.equal(res.status, 200);
    // 关键回归：曾是 text/html（SPA 回退发 index.html），引擎 import() 即白屏
    assert.equal(res.headers['content-type'], 'application/javascript; charset=utf-8');
    assert.equal(res.headers['content-encoding'], 'gzip');
    assert.equal(zlib.gunzipSync(res.body).toString('utf8'), ONLY_GZ_BODY);
  });
});

test('gzip: 仅 .gz 且客户端不接受 gzip 时解压后以原始字节下发', async () => {
  await withServer(async (port) => {
    const res = await rawGet(port, '/onlygz.js');
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'application/javascript; charset=utf-8');
    assert.equal(res.headers['content-encoding'], undefined);
    assert.equal(res.body.toString('utf8'), ONLY_GZ_BODY);
  });
});

test('SPA 回退与缓存头策略不受 gzip 影响', async () => {
  await withServer(async (port) => {
    const res = await rawGet(port, '/some/spa/route', {
      'accept-encoding': 'gzip',
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(res.headers['cache-control'], undefined); // html 不下发缓存头（既有行为）
    // 顶层文档必须带 COOP/COEP，否则 Chrome 不启用跨源隔离、SAB 不可用
    assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin');
    assert.equal(res.headers['cross-origin-embedder-policy'], 'require-corp');
    assert.match(zlib.gunzipSync(res.body).toString('utf8'), /<html>/);

    const res2 = await rawGet(port, '/app.js');
    assert.equal(res2.headers['cache-control'], 'public, max-age=31536000');
  });
});

test('移动端目录同样走 gzip 下发', async () => {
  await withServer(async (port) => {
    const res = await rawGet(port, '/mxcad_mobile/', {
      'accept-encoding': 'gzip',
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-encoding'], 'gzip');
    assert.equal(
      zlib.gunzipSync(res.body).toString('utf8'),
      '<html>mobile</html>'
    );
  });
});

// --- 流读取失败：不得发出「声称 200 实则截断」的响应 ---
//
// 背景缺陷（2026-10-26 上传链路排查）：gzip 分支曾在 createReadStream 之前就
// writeHead(200)，流一失败只能 res.end()——客户端拿到 200 状态 + Content-Encoding:
// gzip + 0 字节 body。对 ES 模块浏览器报 "Failed to fetch dynamically imported
// module"，HTTP 状态码和网络面板都查不出错。修法是把 200 头推迟到流打开成功之后。

function withStubbedCreateReadStream(openFirst, fn) {
  const realCreateReadStream = fs.createReadStream;
  fs.createReadStream = () => {
    const s = new stream.PassThrough();
    setImmediate(() => {
      if (openFirst) s.emit('open', 1);
      s.emit('error', new Error('EIO: 模拟流读取失败'));
    });
    return s;
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      fs.createReadStream = realCreateReadStream;
    });
}

test('gzip: 流打开失败时回 500，不发出截断的 200 响应', async () => {
  await withServer(async (port) => {
    await withStubbedCreateReadStream(false, async () => {
      const res = await rawGet(port, '/app.js', {
        'accept-encoding': 'gzip',
        connection: 'close',
      });
      // 关键回归：曾是 status 200 + content-encoding gzip + 空 body
      assert.equal(res.status, 500);
      assert.equal(res.headers['content-encoding'], undefined);
      assert.equal(res.body.toString('utf8'), 'Internal Server Error');
    });
  });
});

test('gzip: 流读到一半失败时掐断连接，不发送截断内容', async () => {
  await withServer(async (port) => {
    await withStubbedCreateReadStream(true, async () => {
      // 头已发出、状态码改不回来：掐断连接，而不是把残缺字节当正常内容发完
      await assert.rejects(
        rawGet(port, '/app.js', {
          'accept-encoding': 'gzip',
          connection: 'close',
        })
      );
    });
  });
});
// --- 代理错误日志可定位性 ---
//
// 背景缺陷（2026-10-26 前台排障）：代理错误曾只打 err.message。同一条
// "socket hang up" 既可能是后端未回完整响应就断开，也可能是浏览器关闭连接后本服务
// 主动掐断上游（res.on('close') → proxyReq.destroy()），排障时无法定性；Node 内部以
// 空 Error 触发时 message 为空串，整行看着像被截断。无时间戳、无 err.code、无失败侧
// 三个盲区叠加，只能临时外挂打点重跑才能定位。
// 回归点：日志必须含 err.code、失败侧、后端目标、被代理的请求行与时间戳；
// message 为空时渲染成显式标记而非空串。

function withCapturedError(fn) {
  const lines = [];
  const realError = console.error;
  console.error = (...args) => lines.push(args.map(String).join(' '));
  return Promise.resolve()
    .then(async () => {
      await fn();
      return lines;
    })
    .finally(() => {
      console.error = realError;
    });
}

async function withProxyServer(apiTarget, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-proxy-'));
  fs.mkdirSync(path.join(dir, 'mxcad_mobile'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), '<html>ok</html>');
  const server = createServer({
    port: 0,
    dir,
    mobilePath: 'mxcad_mobile',
    mobileDir: path.join(dir, 'mxcad_mobile'),
    apiTarget,
    spa: true,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// 代理请求可能以错误结束（后端断连），统一归一成字符串而非 reject
function rawGetProxy(port, urlPath) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      res.resume();
      res.on('end', () => resolve('status=' + res.statusCode));
      res.on('error', (e) => resolve('res-err=' + e.code));
    });
    req.on('error', (e) => resolve('req-err=' + e.code));
  });
}

test('logProxyError: message 为空 / 无 code 时渲染成显式标记，不呈现为截断行', () => {
  const lines = [];
  const realError = console.error;
  console.error = (...args) => lines.push(args.join(' '));
  try {
    logProxyError(
      '请求侧（后端未回响应头）',
      new Error(''),
      'http://localhost:3001',
      { method: 'GET', url: '/api/v1/auth/refresh' }
    );
    const reset = new Error('read ECONNRESET');
    reset.code = 'ECONNRESET';
    logProxyError('响应侧（响应头已发给客户端）', reset, 'http://localhost:3001', {
      method: 'POST',
      url: '/api/v1/upload',
    });
  } finally {
    console.error = realError;
  }

  // 空 message 是线上最常见的形态（Node 内部 destroy(new Error()) 触发），
  // 必须渲染成显式标记，否则整行看起来像日志被截断
  assert.match(lines[0], /message=\(空 message\)/);
  assert.match(lines[0], /code=UNKNOWN/);
  assert.match(lines[0], /侧=请求侧（后端未回响应头）/);
  assert.match(lines[0], /后端=http:\/\/localhost:3001/);
  assert.match(lines[0], /GET \/api\/v1\/auth\/refresh$/);
  assert.match(lines[0], /^\[代理错误\] \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);

  assert.match(lines[1], /code=ECONNRESET/);
  assert.match(lines[1], /message="read ECONNRESET"/);
  assert.match(lines[1], /侧=响应侧（响应头已发给客户端）/);
  assert.match(lines[1], /POST \/api\/v1\/upload$/);
});

test('代理错误: 后端不可达时回 502，日志含 code、失败侧、后端目标与请求行', async () => {
  const lines = await withCapturedError(async () => {
    await withProxyServer('http://127.0.0.1:1', async (port) => {
      await rawGetProxy(port, '/api/v1/auth/refresh');
    });
  });
  const errLine = lines.find((l) => l.includes('[代理错误]'));
  assert.ok(errLine, `应打出代理错误日志，实际: ${JSON.stringify(lines)}`);
  assert.match(errLine, /code=ECONNREFUSED/);
  assert.match(errLine, /侧=请求侧（后端未回响应头）/);
  assert.match(errLine, /后端=http:\/\/127\.0\.0\.1:1/);
  assert.match(errLine, /GET \/api\/v1\/auth\/refresh/);
  assert.match(errLine, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
});

test('代理错误: 后端回包中途断开时标记响应侧（客户端已收到响应头）', async () => {
  // 后端发出响应头+半包后销毁 socket：模拟后端进程崩溃或被杀
  const backend = await new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.write('half');
      setImmediate(() => req.socket.destroy());
    });
    srv.listen(0, '127.0.0.1', () =>
      resolve({
        target: `http://127.0.0.1:${srv.address().port}`,
        stop: () => new Promise((r) => srv.close(r)),
      })
    );
  });
  try {
    const lines = await withCapturedError(async () => {
      await withProxyServer(backend.target, async (port) => {
        await rawGetProxy(port, '/api/v1/notices/stream');
      });
    });
    assert.ok(
      lines.some((l) => l.includes('[代理错误]')),
      `应打出代理错误日志，实际: ${JSON.stringify(lines)}`
    );
    assert.ok(
      lines.some((l) => l.includes('侧=响应侧（响应头已发给客户端）')),
      `应标记为响应侧，实际: ${JSON.stringify(lines)}`
    );
  } finally {
    await backend.stop();
  }
});
