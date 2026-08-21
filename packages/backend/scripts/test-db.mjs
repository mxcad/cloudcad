#!/usr/bin/env node
// 集成测试数据库一键脚本（Docker Compose 测试栈）
// 用法:
//   node scripts/test-db.mjs up     # 启动 postgres+redis 容器并等待就绪
//   node scripts/test-db.mjs down   # 停止容器（保留数据卷）
//   node scripts/test-db.mjs run    # up → 建测试库 → migrate → 跑集成测试
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.join(scriptDir, '..');
const composeFile = path.join(backendDir, 'docker-compose.test.yml');
const COMPOSE_PROJECT = 'cloudcad-test';
const PG_CONTAINER = 'cloudcad-test-postgres';
const REDIS_CONTAINER = 'cloudcad-test-redis';
const TEST_DB = 'cloudcad_test';
const TEST_DB_URL = 'postgresql://postgres:password@localhost:5433/cloudcad_test';

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result;
}

function runCapture(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`命令失败: ${cmd} ${args.join(' ')}`);
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  return result.stdout.trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitHealthy(container, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = spawnSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', container], {
      encoding: 'utf8',
    });
    const value = status.stdout?.trim();
    if (value === 'healthy') return;
    await sleep(2000);
  }
  console.error(`容器 ${container} 未在 ${timeoutMs}ms 内就绪`);
  process.exit(1);
}

function ensureTestDb() {
  const exists = runCapture('docker', [
    'exec', PG_CONTAINER,
    'psql', '-U', 'postgres', '-tAc',
    `SELECT 1 FROM pg_database WHERE datname = '${TEST_DB}'`,
  ]);
  if (exists !== '1') {
    console.log(`创建测试数据库 ${TEST_DB} ...`);
    run('docker', ['exec', PG_CONTAINER, 'psql', '-U', 'postgres', '-c', `CREATE DATABASE ${TEST_DB}`]);
  }
}

async function up() {
  run('docker', ['compose', '-f', composeFile, '-p', COMPOSE_PROJECT, 'up', '-d']);
  console.log('等待 postgres 就绪 ...');
  await waitHealthy(PG_CONTAINER);
  console.log('等待 redis 就绪 ...');
  await waitHealthy(REDIS_CONTAINER);
  console.log('测试栈已就绪');
}

function down() {
  run('docker', ['compose', '-f', composeFile, '-p', COMPOSE_PROJECT, 'down']);
}

function testEnv() {
  return {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB_URL,
    TEST_DATABASE_URL: TEST_DB_URL,
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6380',
    REDIS_DB: '1',
    REDIS_URL: 'redis://localhost:6380/1',
  };
}

async function runIntegration() {
  await up();
  ensureTestDb();
  console.log('执行 prisma migrate deploy ...');
  run('pnpm', ['prisma', 'migrate', 'deploy'], {
    cwd: backendDir,
    env: testEnv(),
  });
  console.log('运行集成测试 ...');
  run('pnpm', ['test:integration'], {
    cwd: backendDir,
    env: testEnv(),
  });
}

const command = process.argv[2] || 'run';
switch (command) {
  case 'up':
    await up();
    break;
  case 'down':
    down();
    break;
  case 'run':
    await runIntegration();
    break;
  default:
    console.error(`未知命令: ${command}（支持 up / down / run）`);
    process.exit(1);
}
