#!/usr/bin/env node
/**
 * @fileoverview Docker 一键部署包 —— app 容器入口（ADR-0074，半容器化）
 *
 * 镜像内布局（由 docker/Dockerfile.app 构建）：
 *   /app/app-entrypoint.js            本文件
 *   /app/VERSION                      构建期烙入的版本号
 *   /app/prisma-engines/schema-engine 离线 schema-engine 二进制（musl 变体，构建期重命名为固定名）
 *   /app/packages/backend/dist        后端构建产物
 *   /app/packages/backend/prisma.config.ts   迁移配置（schema 指向 ../db/prisma/schema.prisma）
 *   /app/packages/backend/prisma/migrations/ 迁移 SQL
 *   /app/packages/backend/node_modules       生产依赖 + prisma CLI + tsx（加载 TS 配置）
 *   /app/packages/db/prisma/schema.prisma    Prisma schema（单一源副本）
 *   /app/packages/frontend/dist       前端构建产物（含合并的移动端 dist，nginx root）
 *   /app/nginx/nginx-app.conf.template nginx 配置模板（占位符 @FRONTEND_PORT@ 等）
 *   /app/nginx/nginx.conf             启动时由本入口渲染出的完整 nginx 配置
 *   /app/data/                        同路径挂载（宿主 data/ 绝对路径 = 容器内绝对路径）
 *
 * 职责（PID 1，双进程监督）：
 *   1. 等待 DB/Redis TCP 可达（pg/redis 容器先启动且已 healthy，此处只是保险）
 *   2. prisma migrate deploy（离线：PRISMA_SCHEMA_ENGINE_BINARY 指向包内 musl 二进制，
 *      与裸机部署包同一口径；裸 schema-engine 的 cli 子命令不支持 migrate deploy，
 *      必须经 prisma CLI 编排；DATABASE_URL 由 compose env_file 注入）
 *   3. 写 data/.migrated-version 版本标记（宿主侧 verify 第 8 项校验）
 *   4. 渲染 nginx 配置（端口/移动端路径占位符）→ 拉起 nginx（前端静态 + /api 反代，daemon off）
 *      + backend（dist/main.js）两个子进程
 *   5. 任一子进程退出 → 清理另一进程并以同码退出 → compose restart: unless-stopped 重启容器
 *      （migrate deploy 幂等，重启安全）
 *   6. SIGTERM/SIGINT → 转发子进程 → 10s 宽限后退出
 *
 * 仅依赖 node 内置模块。
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

// APP_ROOT 允许测试用假布局冒烟监督逻辑；生产恒为 /app（Dockerfile WORKDIR）
const APP_ROOT = process.env.APP_ROOT || '/app';
const DATA_DIR = path.join(APP_ROOT, 'data');
const VERSION = process.env.APP_VERSION || readVersionFile();

function readVersionFile() {
  try {
    return fs.readFileSync(path.join(APP_ROOT, 'VERSION'), 'utf8').trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

function log(msg) {
  console.log(`[app] ${msg}`);
}
function fail(msg) {
  console.error(`[app][错误] ${msg}`);
  process.exit(1);
}

// ==================== 移动端访问路径 + nginx 配置渲染 ====================

/**
 * 从 myServerConfig.json 读移动端访问路径名（与裸机 serve-static.js 同一口径）。
 * 运行时配置（data/configs/...）优先于构建期 dist 配置。
 * @returns {string}
 */
function getMobileAccessPath() {
  const configPaths = [
    path.join(APP_ROOT, 'data', 'configs', 'frontend', 'ini', 'myServerConfig.json'),
    path.join(APP_ROOT, 'packages', 'frontend', 'dist', 'ini', 'myServerConfig.json'),
  ];
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.mobileAccessPath && typeof config.mobileAccessPath === 'string') {
          return config.mobileAccessPath;
        }
      } catch {
        // 配置损坏 → 用默认
      }
    }
  }
  return 'mxcad_mobile';
}

/**
 * 渲染 nginx 配置模板（替换 @FRONTEND_PORT@/@BACKEND_PORT@/@DIST_DIR@/@MOBILE_PATH@），
 * 写到 /app/nginx/nginx.conf。返回渲染后的配置路径。
 * @returns {string}
 */
function renderNginxConf() {
  const templatePath = path.join(APP_ROOT, 'nginx', 'nginx-app.conf.template');
  const outPath = path.join(APP_ROOT, 'nginx', 'nginx.conf');
  if (!fs.existsSync(templatePath)) {
    fail(`nginx 配置模板缺失（${templatePath}），部署包不完整`);
  }
  let conf = fs.readFileSync(templatePath, 'utf8');
  const frontendPort = process.env.FRONTEND_PORT || '8000';
  const backendPort = process.env.PORT || '3001';
  const distDir = path.join(APP_ROOT, 'packages', 'frontend', 'dist');
  const mobilePath = getMobileAccessPath();
  conf = conf
    .split('@FRONTEND_PORT@').join(frontendPort)
    .split('@BACKEND_PORT@').join(backendPort)
    .split('@DIST_DIR@').join(distDir)
    .split('@MOBILE_PATH@').join(mobilePath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, conf, 'utf8');
  log(`nginx 配置已渲染（前端 :${frontendPort} → 后端 :${backendPort}，移动端路径 /${mobilePath}/）`);
  return outPath;
}

// ==================== 1. 等待 DB / Redis TCP ====================

function tcpReachable(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitTcp(name, host, port, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    if (await tcpReachable(host, port)) {
      log(`${name} 已可达（${host}:${port}）`);
      return;
    }
    if (Date.now() > deadline) {
      fail(`${name} 60s 内不可达（${host}:${port}），请确认 pg/redis 容器健康`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// Redis 就绪探测：TCP 可达 ≠ 能接受命令。半容器化下 redis 容器刚 healthy 时，后端 ioredis 客户端
// 仍可能 connect ETIMEDOUT 并重试（慢环境如 DinD 断网验证下要数分钟才全连上），拖过后端就绪窗口。
// 这里发 PING 等真实响应：+PONG=就绪且免认证；-NOAUTH=就绪但需认证（REDIS_PASSWORD 场景）。
// 两者都说明 Redis 在正常应答，可安全拉起后端（后端客户端自带 AUTH）。
function redisReady(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.write('PING\r\n');
    });
    let buf = '';
    socket.setTimeout(timeoutMs);
    socket.on('data', (chunk) => {
      buf += chunk.toString();
      if (buf.includes('+PONG') || buf.includes('-NOAUTH')) {
        socket.destroy();
        resolve(true);
      }
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitRedisReady(name, host, port, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    if (await redisReady(host, port)) {
      log(`${name} 已就绪（${host}:${port}，PING 有响应）`);
      return;
    }
    if (Date.now() > deadline) {
      fail(`${name} 120s 内未就绪（${host}:${port}），请确认 redis 容器健康`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ==================== 2. 数据库迁移（prisma CLI + 包内离线 schema-engine 二进制） ====================

function findSchemaEngine() {
  const candidates = [
    process.env.PRISMA_SCHEMA_ENGINE_BINARY,
    path.join(APP_ROOT, 'prisma-engines', 'schema-engine'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // 兜底：构建期未按固定名重命名时，按 musl/glibc 变体名找
  const dir = path.join(APP_ROOT, 'prisma-engines');
  try {
    const hit = fs
      .readdirSync(dir)
      .find((f) => f.startsWith('schema-engine') && !f.endsWith('.sha256'));
    if (hit) return path.join(dir, hit);
  } catch {
    // 目录不存在
  }
  return null;
}

function runMigrateDeploy() {
  const { spawnSync } = require('child_process');
  const backendDir = path.join(APP_ROOT, 'packages', 'backend');
  const prismaCli = path.join(backendDir, 'node_modules', 'prisma', 'build', 'index.js');
  const migrationsDir = path.join(backendDir, 'prisma', 'migrations');
  let hasMigrations = false;
  try {
    hasMigrations = fs
      .readdirSync(migrationsDir, { recursive: true })
      .some((f) => String(f).endsWith('.sql'));
  } catch {
    // 无 migrations 目录 → 无迁移可执行
  }
  if (!hasMigrations) {
    log('无迁移文件，跳过 migrate deploy');
    return;
  }
  if (!fs.existsSync(prismaCli)) {
    fail(`prisma CLI 缺失（${prismaCli}），部署包不完整`);
  }
  const env = { ...process.env };
  const schemaEngine = findSchemaEngine();
  if (schemaEngine) {
    // 离线：prisma CLI 用包内预置二进制，不联网下载（与裸机部署包同一口径）
    env.PRISMA_SCHEMA_ENGINE_BINARY = schemaEngine;
  } else {
    log('警告：未找到包内 schema-engine 二进制，prisma CLI 可能尝试联网下载');
  }
  log('执行数据库迁移（prisma migrate deploy）...');
  const res = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: backendDir,
    encoding: 'utf8',
    timeout: 300000,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
  const output = `${res.stdout || ''}${res.stderr || ''}`.trim();
  if (output) console.log(output);
  if (res.status !== 0) {
    fail(`数据库迁移失败（exit ${res.status}），容器将重启重试`);
  }
  log('数据库迁移完成');
}

// ==================== 3. 版本标记 ====================

function writeVersionMarker() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, '.migrated-version'), VERSION, 'utf8');
}

// ==================== 4/5/6. 双进程监督 ====================

function main() {
  log(`CloudCAD app 容器启动（版本 ${VERSION}）`);

  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const backendPort = process.env.PORT || '3001';
  const frontendPort = process.env.FRONTEND_PORT || '8000';

  (async () => {
    await waitTcp('PostgreSQL', dbHost, dbPort, 60000);
    // Redis 用 PING 探测真实就绪（TCP 可达≠能接受命令，见 redisReady 注释）
    await waitRedisReady('Redis', redisHost, redisPort, 120000);

    runMigrateDeploy();
    writeVersionMarker();

    // 前端静态资源 + /api 反代（nginx，替代裸机 serve-static.js 的 node 服务）
    // daemon off 前台运行，作为本入口的子进程受监督（退出→重启容器）
    const nginxConf = renderNginxConf();
    const frontend = spawn('/usr/sbin/nginx', ['-c', nginxConf, '-g', 'daemon off;'], {
      env: process.env,
      stdio: 'inherit',
    });

    // 后端（cwd 固定 packages/backend，与裸机 PM2 启动口径一致）
    const backend = spawn(process.execPath, [path.join(APP_ROOT, 'packages', 'backend', 'dist', 'main.js')], {
      cwd: path.join(APP_ROOT, 'packages', 'backend'),
      env: process.env,
      stdio: 'inherit',
    });

    const children = { frontend, backend };
    let shuttingDown = false;

    const shutdown = (code) => {
      if (shuttingDown) return;
      shuttingDown = true;
      for (const [name, child] of Object.entries(children)) {
        if (child.exitCode === null && child.signalCode === null) {
          try {
            child.kill('SIGTERM');
          } catch {
            // 已退出
          }
        }
      }
      const deadline = Date.now() + 10000;
      const tick = setInterval(() => {
        const alive = Object.values(children).some((c) => c.exitCode === null && c.signalCode === null);
        if (!alive || Date.now() > deadline) {
          clearInterval(tick);
          process.exit(code);
        }
      }, 200);
    };

    for (const [name, child] of Object.entries(children)) {
      child.on('error', (err) => {
        log(`子进程 ${name} 启动失败：${err.message}`);
      });
      child.on('exit', (code, signal) => {
        if (shuttingDown) return;
        log(`子进程 ${name} 退出（${signal ? `signal ${signal}` : `code ${code}`}），重启容器`);
        shutdown(code === 0 ? 1 : code || 1);
      });
    }

    process.on('SIGTERM', () => {
      log('收到 SIGTERM，优雅关闭...');
      shutdown(0);
    });
    process.on('SIGINT', () => {
      shutdown(0);
    });

    log(`前端 :${frontendPort} / 后端 :${backendPort} 已拉起`);
  })().catch((err) => fail(err.stack || err.message));
}

main();
