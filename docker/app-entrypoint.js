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
 *   /app/packages/frontend/dist       前端构建产物（含合并的移动端 dist）
 *   /app/runtime/scripts/serve-static.js  前端静态服务（复用裸机同一脚本，含 /api 反代与 SPA 回退）
 *   /app/data/                        同路径挂载（宿主 data/ 绝对路径 = 容器内绝对路径）
 *
 * 职责（PID 1，双进程监督）：
 *   1. 等待 DB/Redis TCP 可达（pg/redis 容器先启动且已 healthy，此处只是保险）
 *   2. prisma migrate deploy（离线：PRISMA_SCHEMA_ENGINE_BINARY 指向包内 musl 二进制，
 *      与裸机部署包同一口径；裸 schema-engine 的 cli 子命令不支持 migrate deploy，
 *      必须经 prisma CLI 编排；DATABASE_URL 由 compose env_file 注入）
 *   3. 写 data/.migrated-version 版本标记（宿主侧 verify 第 8 项校验）
 *   4. 拉起 frontend（serve-static.js）+ backend（dist/main.js）两个子进程
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
  const frontendPort = process.env.FRONTEND_PORT || '3000';

  (async () => {
    await waitTcp('PostgreSQL', dbHost, dbPort, 60000);
    await waitTcp('Redis', redisHost, redisPort, 60000);

    runMigrateDeploy();
    writeVersionMarker();

    // 前端静态服务（复用裸机 serve-static.js：/api 反代 + SPA 回退 + 移动端路径）
    const frontend = spawn(process.execPath, [path.join(APP_ROOT, 'runtime', 'scripts', 'serve-static.js')], {
      env: {
        ...process.env,
        FRONTEND_PORT: frontendPort,
        BACKEND_URL: `http://127.0.0.1:${backendPort}`,
      },
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
