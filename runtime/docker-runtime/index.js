#!/usr/bin/env node
/**
 * @fileoverview Docker 一键部署包 —— 宿主侧主控（ADR-0074）
 *
 * 用法：node runtime/docker-runtime/index.js start|stop|verify
 * （start.sh / stop.sh 只是本脚本的薄壳）
 *
 * start 流程（12 步，见 ADR-0074 D1-D14）：
 *   0 产物自检 → 1 权限硬门禁 → 2 .env 生成与占位符替换 → 3 密钥填充
 *   → 4 Docker 检测/自装 → 5 加载离线镜像 → 6 端口冲突处理
 *   → 7 mxcad 运行时探针 → 8 pg/redis 容器 → 9 宿主进程（协同/转换/运维中心）
 *   → 10 app 容器 → 11 验证硬门禁 → 12 收尾输出
 *
 * 复用裸机工具链的纯函数层（单一事实源）：
 *   runtime/scripts/lib/env.js（parseEnvFile/updateEnvFile）、
 *   runtime/scripts/config-updater.js（mergeExampleIntoEnv）、
 *   runtime/scripts/lib/secret-generator.js（fillEmptySecrets）、
 *   runtime/scripts/lib/database-url.js（composeDatabaseUrl）、
 *   runtime/scripts/lib/mxcad-path.js（resolveMxcadAssemblyPath）。
 *
 * 仅依赖 node 内置 + 上述包内模块。
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEPLOY_DIR = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(DEPLOY_DIR, 'data');
const LOG_DIR = path.join(DATA_DIR, 'logs');
const PID_DIR = path.join(DATA_DIR, 'pid');
const ENV_FILE = path.join(DEPLOY_DIR, '.env');
const ENV_EXAMPLE = path.join(DEPLOY_DIR, '.env.example');
const COMPOSE_FILE = path.join(DEPLOY_DIR, 'docker-compose.yml');
const DOCKER_DATA_ROOT = path.join(DEPLOY_DIR, 'docker-data');

const { parseEnvFile, updateEnvFile } = require(path.join(
  DEPLOY_DIR,
  'runtime',
  'scripts',
  'lib',
  'env'
));
const { mergeExampleIntoEnv } = require(path.join(DEPLOY_DIR, 'runtime', 'scripts', 'config-updater'));
const {
  fillEmptySecrets,
  generateStrongPassword,
} = require(path.join(DEPLOY_DIR, 'runtime', 'scripts', 'lib', 'secret-generator'));
const { composeDatabaseUrl } = require(path.join(DEPLOY_DIR, 'runtime', 'scripts', 'lib', 'database-url'));
const { resolveMxcadAssemblyPath } = require(path.join(DEPLOY_DIR, 'runtime', 'scripts', 'lib', 'mxcad-path'));

const dockerBootstrap = require('./lib/docker-bootstrap');
const hostProcess = require('./lib/host-process');
const { probeAndFix } = require('./lib/mxcad-probe');
const { verifyDeployment } = require('./lib/verify');

// ==================== 基础工具 ====================

function log(msg) {
  console.log(`[CloudCAD] ${msg}`);
}
function warn(msg) {
  console.warn(`[CloudCAD][警告] ${msg}`);
}
function fail(msg) {
  console.error(`[CloudCAD][错误] ${msg}`);
  process.exit(1);
}

function readVersion() {
  for (const f of ['VERSION', 'package.json']) {
    try {
      const content = fs.readFileSync(path.join(DEPLOY_DIR, f), 'utf8');
      if (f === 'VERSION') return content.trim();
      return JSON.parse(content).version || 'dev';
    } catch {
      // 试下一个
    }
  }
  return 'dev';
}

const VERSION = readVersion();
const IMAGE_TAGS = [`cloudcad/app:${VERSION}`, 'cloudcad/pg:15-alpine', 'cloudcad/redis:7-alpine'];

let SUDO = '';
let INSTALLED_BY_US = false;
let COMPOSE = 'docker compose';

/** 探测 compose 形态：优先 docker compose 插件，回退包内独立 docker-compose 二进制 */
function detectCompose() {
  const probe = spawnSync('docker', ['compose', 'version'], {
    encoding: 'utf8',
    timeout: 15000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  COMPOSE = probe.status === 0 ? 'docker compose' : 'docker-compose';
}

/** 执行 compose 命令（数组参数，不经 shell） */
function compose(args, timeoutMs = 120000) {
  let argv =
    COMPOSE === 'docker compose'
      ? ['docker', 'compose', '-f', COMPOSE_FILE, '--project-directory', DEPLOY_DIR, ...args]
      : ['docker-compose', '-f', COMPOSE_FILE, '-p', 'cloudcad', ...args];
  if (SUDO) argv = [SUDO, ...argv];
  const res = spawnSync(argv[0], argv.slice(1), {
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: res.status === 0,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
    error: res.error ? res.error.message : '',
  };
}

function docker(args, timeoutMs = 30000) {
  let argv = ['docker', ...args];
  if (SUDO) argv = [SUDO, ...argv];
  const res = spawnSync(argv[0], argv.slice(1), {
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: res.status === 0,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
    error: res.error ? res.error.message : '',
  };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// ==================== Step 0 产物自检 ====================

function step0Artifacts() {
  log('============================================');
  log(` ${VERSION} Docker 一键部署（start）`);
  log('============================================');
  const required = [
    'docker',
    'images',
    'runtime/linux/node',
    'runtime/linux/mxcad',
    'runtime/scripts',
    'packages/conversion-service/dist',
    'packages/engine-exec/dist',
    'packages/contracts/dist',
    'packages/config-service',
    '.env.example',
    'docker-compose.yml',
  ];
  for (const rel of required) {
    if (!fs.existsSync(path.join(DEPLOY_DIR, rel))) {
      fail(`缺少关键产物：${rel}/（包不完整，请重新下载并完整解压）`);
    }
  }
  if (!fs.existsSync(path.join(DEPLOY_DIR, '.deploy-docker'))) {
    warn('未找到 .deploy-docker 标记文件，按全新安装处理');
  }
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(PID_DIR, { recursive: true });
}

// ==================== Step 1 权限硬门禁 ====================

function step1Permission() {
  if (typeof process.geteuid === 'function' && process.geteuid() === 0) {
    SUDO = '';
    return;
  }
  const probe = spawnSync('sudo', ['-n', 'true'], { stdio: 'ignore' });
  if (probe.status === 0) {
    SUDO = 'sudo';
    log('以 sudo 权限继续（Docker 需要 root 创建命名空间与挂载）');
    return;
  }
  fail(
    '本部署需要 root 或 sudo 权限（Docker 需要 CAP_NET_ADMIN/CAP_SYS_ADMIN）。\n' +
      '  请用 root 用户重新运行 ./start.sh，或为当前用户配置免密 sudo。'
  );
}

// ==================== Step 2/3 .env 生成 ====================

function step2Env() {
  let newInstall = false;
  if (!fs.existsSync(ENV_FILE)) {
    if (!fs.existsSync(ENV_EXAMPLE)) fail('缺少 .env.example 模板');
    fs.copyFileSync(ENV_EXAMPLE, ENV_FILE);
    newInstall = true;
    log('首次部署：已从 .env.example 生成 .env');
  }

  // 占位符一次性替换（幂等）
  let content = fs.readFileSync(ENV_FILE, 'utf8');
  if (content.includes('<DEPLOY_DIR>')) {
    content = content.replace(/<DEPLOY_DIR>/g, DEPLOY_DIR);
    if (!/^DEPLOY_DIR=/m.test(content)) {
      content = `DEPLOY_DIR=${DEPLOY_DIR}\n${content}`;
    }
    fs.writeFileSync(ENV_FILE, content, 'utf8');
    log(`已把配置中的 <DEPLOY_DIR> 替换为实际部署目录：${DEPLOY_DIR}`);
  }

  // 增量合并模板（升级部署时补新键、保留用户值）
  const exampleContent = fs.readFileSync(ENV_EXAMPLE, 'utf8');
  const merged = mergeExampleIntoEnv(fs.readFileSync(ENV_FILE, 'utf8'), exampleContent);
  fs.writeFileSync(ENV_FILE, merged, 'utf8');

  // 空白密钥填充（单一事实源 lib/secret-generator.js）
  fillEmptySecrets(ENV_FILE, (m) => log(m.trim()));

  let env = parseEnvFile(ENV_FILE);

  // DB_PASSWORD 必填（compose 的 :? 硬要求）
  if (!env.DB_PASSWORD) {
    env.DB_PASSWORD = generateStrongPassword();
    log('已自动生成数据库密码 DB_PASSWORD');
  }
  // DATABASE_URL 与 DB_* 成对写（DATABASE_URL 优先级更高；含 # 的口令由 composeDatabaseUrl 编码）
  const url = composeDatabaseUrl({
    host: env.DB_HOST || 'localhost',
    port: env.DB_PORT || '5432',
    user: env.DB_USERNAME || 'postgres',
    password: env.DB_PASSWORD,
    dbName: env.DB_DATABASE || 'cloudcad',
  });
  updateEnvFile(ENV_FILE, { DB_PASSWORD: env.DB_PASSWORD, DATABASE_URL: url }, ENV_EXAMPLE);
  env = parseEnvFile(ENV_FILE);

  if (newInstall) {
    const credFile = path.join(DEPLOY_DIR, 'DEPLOY-PASSWORDS.txt');
    fs.writeFileSync(
      credFile,
      [
        `${VERSION} 初始凭据（请妥善保存，首次登录并修改密码后可删除本文件）`,
        `生成时间: ${new Date().toISOString()}`,
        '',
        `管理员初始密码 (INITIAL_ADMIN_PASSWORD): ${env.INITIAL_ADMIN_PASSWORD || '（未生成）'}`,
        `数据库密码 (DB_PASSWORD): ${env.DB_PASSWORD}`,
        `Redis 密码 (REDIS_PASSWORD): ${env.REDIS_PASSWORD || '（未启用）'}`,
        '',
        '管理员入口: 前端页面右上角/登录页的管理员入口',
      ].join('\n'),
      'utf8'
    );
    log(`初始凭据已写入 ${credFile}（管理员密码只在终端显示这一次，请妥善保存）`);
  }
  return env;
}

// ==================== Step 4 Docker 检测/自装 ====================

function step4Docker() {
  if (dockerBootstrap.dockerReady(SUDO)) {
    const v = docker(['version', '--format', '{{.Server.Version}}']);
    log(`系统已有 Docker（${v.stdout}），直接复用`);
    INSTALLED_BY_US = fs.existsSync(path.join(DATA_DIR, '.docker-installed'));
  } else {
    log('未检测到可用 Docker，使用包内静态二进制安装...');
    const compat = dockerBootstrap.probeOsCompat(DEPLOY_DIR);
    for (const n of compat.notes) log(n);
    const res = dockerBootstrap.installStaticDocker({
      sudo: SUDO,
      dockerDir: path.join(DEPLOY_DIR, 'docker'),
      dataRoot: DOCKER_DATA_ROOT,
      logFile: path.join(LOG_DIR, 'dockerd.log'),
      storageDriver: compat.storageDriver,
      log,
    });
    if (!res.ok) fail(res.message);
    INSTALLED_BY_US = true;
    fs.writeFileSync(path.join(DATA_DIR, '.docker-installed'), '1');
  }
  detectCompose();
  log(`compose 形态：${COMPOSE}`);
}

// ==================== Step 5 加载镜像 ====================

function step5Images() {
  const res = dockerBootstrap.loadImages({
    sudo: SUDO,
    imagesDir: path.join(DEPLOY_DIR, 'images'),
    tags: IMAGE_TAGS,
    log,
  });
  if (!res.ok) fail(res.message);
  log(res.message);
}

// ==================== Step 6 端口冲突 ====================

/** 该端口是否被本部署占用（容器在跑 / 宿主进程存活）→ 冲突时跳过不移位 */
function isPortOurs(key, env) {
  const port = parseInt(env[key], 10);
  if (!port) return false;
  const containerOf = { DB_PORT: 'cloudcad-pg', REDIS_PORT: 'cloudcad-redis', PORT: 'cloudcad-app', FRONTEND_PORT: 'cloudcad-app' };
  if (containerOf[key]) {
    const out = docker(['inspect', '-f', '{{.State.Running}}', containerOf[key]], 10000);
    return out.ok && out.stdout === 'true';
  }
  const pidOf = {
    CONFIG_SERVICE_PORT: 'config-service',
    COOPERATE_PORT: 'cooperate',
    CONVERSION_SERVICE_PORT: 'conversion',
  };
  if (pidOf[key]) {
    return hostProcess.isProcessAlive(hostProcess.readPid(path.join(PID_DIR, `${pidOf[key]}.pid`)));
  }
  return false;
}

async function step6Ports() {
  const env = parseEnvFile(ENV_FILE);
  const portKeys = [
    ['FRONTEND_PORT', '前端页面'],
    ['PORT', '后端'],
    ['CONFIG_SERVICE_PORT', '运维中心'],
    ['DB_PORT', '数据库'],
    ['REDIS_PORT', 'Redis'],
    ['COOPERATE_PORT', '协同服务'],
    ['CONVERSION_SERVICE_PORT', '转换服务'],
  ];
  const changes = {};
  for (const [key, label] of portKeys) {
    const port = parseInt(env[key], 10);
    if (!port) continue;
    if (isPortOurs(key, env)) continue; // 本部署自己占着，幂等复用
    if (!(await hostProcess.portOpen(port))) continue; // 空闲
    let candidate = port + 10;
    let tries = 0;
    while (tries < 50 && (await hostProcess.portOpen(candidate))) {
      candidate += 10;
      tries++;
    }
    if (tries >= 50) {
      fail(`${label} 端口 ${port} 被其他程序占用，且自动顺延未找到空闲端口。请关闭占用程序或手动修改 .env 的 ${key} 后重跑 ./start.sh`);
    }
    changes[key] = String(candidate);
    log(`[端口] ${label} 端口 ${port} 被其他程序占用 → 已改为 ${candidate}（.env ${key}）`);
  }
  if (Object.keys(changes).length > 0) {
    updateEnvFile(ENV_FILE, changes, ENV_EXAMPLE);
  }
}

// ==================== Step 7 mxcad 探针 ====================

async function step7MxcadProbe() {
  const result = await probeAndFix({
    deployDir: DEPLOY_DIR,
    mxcadDir: path.join(DEPLOY_DIR, 'runtime', 'linux', 'mxcad'),
    dataDir: DATA_DIR,
    log,
  });
  return result;
}

// ==================== Step 8 pg/redis 容器 ====================

async function step8InfraContainers() {
  log('启动 PostgreSQL / Redis 容器...');
  const up = compose(['up', '-d', 'pg', 'redis']);
  if (!up.ok) fail(`docker compose up 失败：${up.stderr || up.error}`);

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const pg = docker(['inspect', '-f', '{{.State.Health.Status}}', 'cloudcad-pg'], 10000);
    const redis = docker(['inspect', '-f', '{{.State.Health.Status}}', 'cloudcad-redis'], 10000);
    if (pg.stdout === 'healthy' && redis.stdout === 'healthy') {
      log('PostgreSQL / Redis 已就绪');
      return;
    }
    sleep(2000);
  }
  const pgLogs = docker(['logs', '--tail', '40', 'cloudcad-pg'], 15000);
  fail(`PostgreSQL/Redis 60s 内未就绪。\n${pgLogs.stdout || pgLogs.stderr}`);
}

// ==================== Step 9 宿主进程 ====================

async function step9HostProcesses() {
  const env = parseEnvFile(ENV_FILE);
  const nodeExe = path.join(DEPLOY_DIR, 'runtime', 'linux', 'node', 'bin', 'node');
  const mxcadDir = path.join(DEPLOY_DIR, 'runtime', 'linux', 'mxcad');
  const mxcadBin = path.join(mxcadDir, 'mxcadassembly');

  // 协同服务（mxcadAssembly 折叠形态，参数协议与 cooperate-manager.js 一致）
  const coopPort = parseInt(env.COOPERATE_PORT || '3091', 10);
  if (await hostProcess.isServiceRunning({ pidFile: path.join(PID_DIR, 'cooperate.pid'), port: coopPort })) {
    log('协同服务已在运行，复用');
  } else {
    hostProcess.startHostProcess({
      name: 'cooperate',
      exe: mxcadBin,
      args: [JSON.stringify({ run_cooperate_server: true, print_server: true })],
      cwd: mxcadDir,
      logFile: path.join(LOG_DIR, 'cooperate.log'),
      pidFile: path.join(PID_DIR, 'cooperate.pid'),
      log,
    });
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && !(await hostProcess.portOpen(coopPort))) sleep(500);
    if (await hostProcess.portOpen(coopPort)) {
      log(`协同服务已就绪（端口 ${coopPort}）`);
    } else {
      warn(`协同服务 15s 内未就绪（看 ${path.join(LOG_DIR, 'cooperate.log')}），继续启动其余服务`);
    }
  }

  // 转换服务（仅 FUNCTION_EXECUTOR=conversion-service 时）
  if ((env.FUNCTION_EXECUTOR || 'process-pool').toLowerCase() === 'conversion-service') {
    const convPort = parseInt(env.CONVERSION_SERVICE_PORT || '3100', 10);
    const dist = path.join(DEPLOY_DIR, 'packages', 'conversion-service', 'dist', 'server.js');
    if (!fs.existsSync(dist)) {
      fail(`FUNCTION_EXECUTOR=conversion-service 但转换服务产物缺失（${dist}），部署包与配置不一致`);
    }
    if (await hostProcess.isServiceRunning({ pidFile: path.join(PID_DIR, 'conversion.pid'), port: convPort })) {
      log('转换服务已在运行，复用');
    } else {
      const redisAuth = env.REDIS_PASSWORD ? `:${env.REDIS_PASSWORD}@` : '';
      const convEnv = {
        NODE_ENV: 'production',
        CONVERSION_SERVICE_PORT: String(convPort),
        REDIS_URL: `redis://${redisAuth}${env.REDIS_HOST || 'localhost'}:${env.REDIS_PORT || 6379}/${env.REDIS_DB || 0}`,
        QUEUE_DRIVER: 'redis',
        MXCAD_ASSEMBLY_PATH: resolveMxcadAssemblyPath(env),
      };
      if (env.INTERNAL_SERVICE_SECRET) convEnv.INTERNAL_SERVICE_SECRET = env.INTERNAL_SERVICE_SECRET;
      if (env.CONVERSION_SERVICE_SECRET) convEnv.CONVERSION_SERVICE_SECRET = env.CONVERSION_SERVICE_SECRET;
      hostProcess.startHostProcess({
        name: 'conversion',
        exe: nodeExe,
        args: [dist],
        cwd: path.join(DEPLOY_DIR, 'packages', 'conversion-service'),
        env: convEnv,
        logFile: path.join(LOG_DIR, 'conversion.log'),
        pidFile: path.join(PID_DIR, 'conversion.pid'),
        log,
      });
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline && !(await hostProcess.portOpen(convPort))) sleep(500);
      if (await hostProcess.portOpen(convPort)) {
        log(`转换服务已就绪（端口 ${convPort}）`);
      } else {
        warn(`转换服务 15s 内未就绪（看 ${path.join(LOG_DIR, 'conversion.log')}），继续启动其余服务`);
      }
    }
  }

  // 运维中心 config-service（0 依赖，宿主进程）
  const cfgPort = parseInt(env.CONFIG_SERVICE_PORT || '3002', 10);
  if (await hostProcess.isServiceRunning({ pidFile: path.join(PID_DIR, 'config-service.pid'), port: cfgPort })) {
    log('运维中心已在运行，复用');
  } else {
    hostProcess.startHostProcess({
      name: 'config-service',
      exe: nodeExe,
      args: [path.join(DEPLOY_DIR, 'packages', 'config-service', 'server.js')],
      cwd: path.join(DEPLOY_DIR, 'packages', 'config-service'),
      env: { CONFIG_SERVICE_PORT: String(cfgPort), DEPLOY_FORM: 'docker' },
      logFile: path.join(LOG_DIR, 'config-service.log'),
      pidFile: path.join(PID_DIR, 'config-service.pid'),
      log,
    });
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && !(await hostProcess.portOpen(cfgPort))) sleep(500);
    if (await hostProcess.portOpen(cfgPort)) {
      log(`运维中心已就绪（端口 ${cfgPort}）`);
    } else {
      warn(`运维中心 15s 内未就绪（看 ${path.join(LOG_DIR, 'config-service.log')}），继续启动其余服务`);
    }
  }
}

// ==================== Step 10 app 容器 ====================

async function step10AppContainer() {
  log('启动应用容器（backend + 前端）...');
  const up = compose(['up', '-d', 'app']);
  if (!up.ok) fail(`docker compose up app 失败：${up.stderr || up.error}`);

  const env = parseEnvFile(ENV_FILE);
  const port = env.PORT || '3001';
  const http = require('http');
  const deadline = Date.now() + 180000;
  let attempt = 0;
  while (Date.now() < deadline) {
    const code = await new Promise((resolve) => {
      const req = http.get({ hostname: '127.0.0.1', port: parseInt(port, 10), path: '/api/health/live', method: 'GET', timeout: 3000 }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
    if (code === 200) {
      log('后端服务已就绪');
      return;
    }
    sleep(Math.min(1000 * 2 ** attempt++, 10000));
  }
  const appLogs = docker(['logs', '--tail', '40', 'cloudcad-app'], 15000);
  fail(`后端 3 分钟内未就绪。\n${appLogs.stdout || appLogs.stderr}`);
}

// ==================== Step 11 验证 ====================

async function step11Verify() {
  log('执行部署验证...');
  const env = parseEnvFile(ENV_FILE);
  const result = await verifyDeployment({
    deployDir: DEPLOY_DIR,
    env,
    sudo: SUDO,
    dockerInstalledByUs: INSTALLED_BY_US,
    imageTags: IMAGE_TAGS,
    version: VERSION,
    log,
  });
  for (const item of result.items) {
    console.log(`  ${item.ok ? '✓' : '✗'} ${item.name}${item.hint ? `\n      ${item.hint}` : ''}`);
  }
  if (!result.ok) {
    fail('部署验证未全部通过，请按上方指引处理后重跑 ./start.sh（幂等）');
  }
}

// ==================== Step 12 收尾 ====================

function step12Summary() {
  const env = parseEnvFile(ENV_FILE);
  const fe = env.FRONTEND_PORT || '3000';
  const be = env.PORT || '3001';
  const cfg = env.CONFIG_SERVICE_PORT || '3002';
  console.log('');
  log('╔══════════════════════════════════════════════════════════╗');
  log('║        所有服务已就绪                                     ║');
  log('╠══════════════════════════════════════════════════════════╣');
  log(`║  前端:   http://<服务器IP>:${fe}                    ║`);
  log(`║  API:    http://<服务器IP>:${be}/api                     ║`);
  log(`║  API文档: http://<服务器IP>:${be}/api/docs                ║`);
  log(`║  运维中心: http://<服务器IP>:${cfg}                       ║`);
  log('╠══════════════════════════════════════════════════════════╣');
  log('║  停止: ./stop.sh    升级: 新包解压到本目录后重跑 ./start.sh ║');
  log('╚══════════════════════════════════════════════════════════╝');
  if (fs.existsSync(path.join(DEPLOY_DIR, 'DEPLOY-PASSWORDS.txt'))) {
    log('初始管理员密码见 DEPLOY-PASSWORDS.txt（首次登录后请修改并删除该文件）');
  }
}

// ==================== 命令入口 ====================

async function cmdStart() {
  step0Artifacts();
  step1Permission();
  step2Env();
  step4Docker();
  step5Images();
  await step6Ports();
  await step7MxcadProbe();
  await step8InfraContainers();
  await step9HostProcesses();
  await step10AppContainer();
  await step11Verify();
  step12Summary();
}

async function cmdStop() {
  log('停止 CloudCAD 服务...');
  const down = compose(['down'], 120000);
  if (!down.ok) {
    warn(`docker compose down 未完全成功（${down.stderr || down.error}），继续停止宿主进程`);
  } else {
    log('容器已停止（数据保留在 data/ 目录）');
  }
  for (const name of ['config-service', 'conversion', 'cooperate']) {
    await hostProcess.stopHostProcess({ name, pidFile: path.join(PID_DIR, `${name}.pid`), log });
  }
  if (fs.existsSync(path.join(DATA_DIR, '.docker-installed'))) {
    log('停止本包自装的 dockerd...');
    dockerBootstrap.run(`${SUDO} pkill -x dockerd 2>/dev/null || true`, { sudo: '', timeoutMs: 15000 });
  }
  log('已全部停止');
}

async function cmdVerify() {
  step1Permission();
  const env = parseEnvFile(ENV_FILE);
  const result = await verifyDeployment({
    deployDir: DEPLOY_DIR,
    env,
    sudo: SUDO,
    dockerInstalledByUs: fs.existsSync(path.join(DATA_DIR, '.docker-installed')),
    imageTags: IMAGE_TAGS,
    version: VERSION,
    log,
  });
  for (const item of result.items) {
    console.log(`  ${item.ok ? '✓' : '✗'} ${item.name}${item.hint ? `\n      ${item.hint}` : ''}`);
  }
  process.exit(result.ok ? 0 : 1);
}

const command = process.argv[2];
if (command === 'start') {
  cmdStart().catch((err) => fail(err.stack || err.message));
} else if (command === 'stop') {
  cmdStop().catch((err) => fail(err.stack || err.message));
} else if (command === 'verify') {
  cmdVerify().catch((err) => fail(err.stack || err.message));
} else {
  console.error('用法: node runtime/docker-runtime/index.js start|stop|verify');
  process.exit(1);
}
