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
const rootless = require('./lib/rootless');

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
// 权限模式：'root' | 'sudo' | 'rootless'（step1 决定，贯穿全程）
let MODE = 'root';
// rootless 时指向包内静态 docker CLI（/usr/local/bin 未必有）；root/sudo 用 PATH 的 docker
let DOCKER_CLI = 'docker';
// rootless 时 = unix://<影子目录>/docker-rootless.sock；root/sudo 时 = ''（默认 socket）
let DOCKER_HOST = '';
// rootless 启动结果（netnsPid/pidFile/degraded 等），供 stop / 宿主进程 host IP 使用
let ROOTLESS = null;

/** 组 docker CLI 的 env：rootless 注入 DOCKER_HOST，其余透传 */
function dockerEnv() {
  const env = { ...process.env };
  if (DOCKER_HOST) env.DOCKER_HOST = DOCKER_HOST;
  return env;
}

/** 探测 compose 形态：优先 docker compose 插件，回退包内独立 docker-compose 二进制。
 *  rootless 下静态 tgz 无 compose 插件，恒用包内独立 docker-compose（认 DOCKER_HOST）。 */
function detectCompose() {
  if (MODE === 'rootless') {
    COMPOSE = 'docker-compose';
    return;
  }
  const probe = spawnSync(DOCKER_CLI, ['compose', 'version'], {
    encoding: 'utf8',
    timeout: 15000,
    env: dockerEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  COMPOSE = probe.status === 0 ? 'docker compose' : 'docker-compose';
}

/** 解析 compose 可执行文件：rootless/静态包用包内独立二进制，否则用 PATH 的 docker-compose */
function composeBin() {
  const bundled = path.join(DEPLOY_DIR, 'docker', 'docker-compose');
  if (MODE === 'rootless' || (fs.existsSync(bundled) && !whichInPath('docker-compose'))) return bundled;
  return 'docker-compose';
}

/** 执行 compose 命令（数组参数，不经 shell） */
function compose(args, timeoutMs = 120000) {
  let argv;
  if (COMPOSE === 'docker compose') {
    argv = [DOCKER_CLI, 'compose', '-f', COMPOSE_FILE, '--project-directory', DEPLOY_DIR, ...args];
  } else {
    argv = [composeBin(), '-f', COMPOSE_FILE, '-p', 'cloudcad', ...args];
  }
  if (SUDO) argv = [SUDO, ...argv];
  const res = spawnSync(argv[0], argv.slice(1), {
    encoding: 'utf8',
    timeout: timeoutMs,
    env: dockerEnv(),
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
  let argv = [DOCKER_CLI, ...args];
  if (SUDO) argv = [SUDO, ...argv];
  const res = spawnSync(argv[0], argv.slice(1), {
    encoding: 'utf8',
    timeout: timeoutMs,
    env: dockerEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: res.status === 0,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
    error: res.error ? res.error.message : '',
  };
}

/** PATH 中是否有某命令 */
function whichInPath(cmd) {
  const r = spawnSync(`command -v ${cmd} 2>/dev/null || true`, { shell: true, encoding: 'utf8' });
  return !!(r.stdout || '').trim();
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * 慢环境（2 核断网 DinD 验证）兜底：拉长后端客户端的 OS 层 SYN 重试窗口。
 *
 * 根因：2 核打包机过载（负载>核数），redis/pg 服务端 CPU 饿死、回 SYN-ACK 慢；后端多个
 * Redis/PG 客户端的 SYN 发出后，OS 默认 tcp_syn_retries=6（~2 分钟重试窗口）先于服务端
 * 应答超时 → connect ETIMEDOUT，ioredis/Prisma 反复重连要 10+ 分钟才全部就绪，拖爆 step10
 * 就绪窗口。把客户端 SYN 重试拉到 15 次（~16 分钟窗口），给 CPU 饿死的服务端足够机会回
 * SYN-ACK，客户端即可在窗口内完成握手。
 *
 * 仅 root/sudo 模式可写 /proc/sys（rootless 无 CAP_SYS_ADMIN，跳过）；写失败只警告不阻塞
 * （正常部署机核数充足、服务端应答快，本参数无副作用）。per-netns 参数：host 网络下 app
 * 容器与宿主共享 netns，此处写入即对后端客户端生效。
 */
function tuneTcpForSlowEnv() {
  if (MODE === 'rootless') return;
  const sysctlPath = '/proc/sys/net/ipv4/tcp_syn_retries';
  try {
    const cur = fs.readFileSync(sysctlPath, 'utf8').trim();
    if (cur === '15') return; // 已是目标值
    fs.writeFileSync(sysctlPath, '15\n');
    log(`慢环境兜底：tcp_syn_retries ${cur} → 15（拉长客户端 SYN 重试窗口，抗 CPU 饿死服务端）`);
  } catch (e) {
    warn(`无法调整 tcp_syn_retries（${e.message}），慢环境下后端就绪可能偏慢`);
  }
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
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.mkdirSync(PID_DIR, { recursive: true });
  } catch (e) {
    if (e.code === 'EACCES' || e.code === 'EPERM') {
      fail(
        `无法创建 ${LOG_DIR}（${e.message}）：部署目录的 data/ 归其他用户所有。` +
          '若为之前 root 部署的残留，请重新解压包到新目录运行，或用 root 运行 ./start.sh',
      );
    }
    throw e;
  }
}

// ==================== Step 1 权限硬门禁 ====================

/**
 * 权限三级门禁（ADR-0074 D5，用户铁律「不能依赖 root，一切为最终目标兜底」）：
 *   ① root（euid==0）→ 直接跑，SUDO=''
 *   ② sudo：免密（sudo -n）或交互式（sudo -v 提示输密码，需 TTY）→ SUDO='sudo'
 *   ③ rootless：无 root/sudo 时用「用户命名空间 + 包内静态 Docker」兜底
 *      （硬前置 newuidmap/subuid/subgid/slirp4netns 缺失时降级并清晰报错）
 */
function step1Permission() {
  if (typeof process.geteuid === 'function' && process.geteuid() === 0) {
    MODE = 'root';
    SUDO = '';
    return;
  }
  // ② sudo（免密）
  const probe = spawnSync('sudo', ['-n', 'true'], { stdio: 'ignore' });
  if (probe.status === 0) {
    MODE = 'sudo';
    SUDO = 'sudo';
    log('以 sudo 权限继续（免密；Docker 需要 root 创建命名空间与挂载）');
    return;
  }
  // ② sudo（交互式：有 TTY 时提示输密码）
  if (process.stdout.isTTY) {
    log('需要 sudo 权限（创建 Docker 命名空间/挂载）。请输入当前用户密码：');
    const v = spawnSync('sudo', ['-v'], { stdio: 'inherit' });
    if (v.status === 0) {
      MODE = 'sudo';
      SUDO = 'sudo';
      log('以 sudo 权限继续（交互式）');
      return;
    }
    log('sudo 校验未通过，继续尝试 rootless 模式...');
  }
  // ③ rootless 兜底
  log('无 root/sudo 权限 → 启用 rootless 模式（用户命名空间 + 包内静态 Docker）');
  const toolsDir = path.join(DEPLOY_DIR, 'docker');
  const prereq = rootless.checkPrerequisites({ toolsDir, log });
  for (const n of prereq.notes) log(n);
  const nsBin = path.join(toolsDir, 'rootless-ns');
  if (!fs.existsSync(nsBin)) {
    fail(
      '无 root/sudo 权限，且包内缺少 rootless-ns 二进制（' + nsBin + '），无法以 rootless 模式运行。\n' +
        '  请用 root 用户运行 ./start.sh，或为当前用户配置 sudo（免密或可输密码）。'
    );
  }
  MODE = 'rootless';
  SUDO = '';
  DOCKER_CLI = path.join(DEPLOY_DIR, 'docker', 'docker');
  // 提前设置 DOCKER_HOST（影子 socket 路径固定）：step6 的 isPortOurs 需经影子 socket 探测
  // 已运行的 app 容器（rootless dockerd 若已在上次 start 拉起），否则会误判端口被他人占用而顺延。
  // step4 的 rootless.start 会再次确认（幂等）。
  DOCKER_HOST = `unix://${path.join(DOCKER_DATA_ROOT, 'shadow-run', 'docker-rootless.sock')}`;
  for (const m of prereq.missing) {
    warn(`rootless 前置缺失：${m.name}\n      ${m.hint}`);
  }
  if (!prereq.ok) {
    warn('rootless 硬前置不完整，将以降级模式运行（详见上方缺失项）；完整功能请补齐后重跑 ./start.sh');
  }
}

/**
 * rootless 兜底：宿主侧数据目录属主非当前用户（如之前 rootful 部署的残留）时，
 * 单段 uid 映射下落到 overflow 65534，容器内 uid 0 无法读写
 * （postgres 在 $PGDATA 上 mkdir 报 Permission denied，redis 写 appendonly 失败）。
 * 移开备份（保留旧数据）后由 dockerd 在 bind mount 时以当前用户属主重建。
 * 仅 rootless 有意义：root/sudo 模式容器内 uid 0 = 宿主 root，任何属主都可写。
 */
function checkDataDirOwnership() {
  if (MODE !== 'rootless') return;
  for (const rel of ['postgres', 'redis']) {
    const p = path.join(DATA_DIR, rel);
    if (!fs.existsSync(p)) continue; // 不存在：dockerd bind mount 时以当前用户属主创建
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.uid === process.geteuid()) continue;
    const bak = `${p}.bak-${Date.now()}`;
    try {
      fs.renameSync(p, bak);
    } catch (e) {
      fail(`无法移开 ${p}（${e.message}）。若为之前 root 部署残留，请用 root 手动移开后重跑 ./start.sh`);
    }
    warn(
      `宿主侧数据目录 ${p} 属主为 uid ${st.uid}（当前用户 ${process.geteuid()}），` +
        `rootless 下容器内无法读写。已移开到 ${bak} 并全新初始化（旧数据保留在该目录）`,
    );
  }
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
  if (MODE === 'rootless') {
    // rootless：用包内静态 dockerd 经用户命名空间启动（lib/rootless.js），
    // 经 DOCKER_HOST（影子 /run 的 unix socket）与真实宿主通信；netns pid 供宿主进程/stop 用
    const env = parseEnvFile(ENV_FILE);
    const ports = [parseInt(env.FRONTEND_PORT || '8000', 10), parseInt(env.PORT || '3001', 10)];
    const res = rootless.start({
      deployDir: DEPLOY_DIR,
      dockerDir: path.join(DEPLOY_DIR, 'docker'),
      dataRoot: DOCKER_DATA_ROOT,
      logFile: path.join(LOG_DIR, 'dockerd.log'),
      ports,
      toolsDir: path.join(DEPLOY_DIR, 'docker'),
      log,
    });
    if (!res.ok) fail(res.message);
    DOCKER_HOST = res.dockerHost;
    ROOTLESS = res;
    INSTALLED_BY_US = true;
    fs.writeFileSync(path.join(DATA_DIR, '.docker-installed'), '1');
    detectCompose();
    log(
      `rootless dockerd 就绪（${res.degraded ? '降级 plain-netns：服务端口对宿主不可达' : 'slirp4netns 完整网络'}，` +
        `netns pid=${res.netnsPid || '未知'}，DOCKER_HOST=${DOCKER_HOST}）`
    );
    return;
  }

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
    dockerCli: DOCKER_CLI,
    dockerHost: DOCKER_HOST,
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

/**
 * rootless 模式：app 容器（子 netns）经 slirp4netns 宿主 IP（10.0.2.2）访问真实宿主上的
 * 宿主进程（协同/转换）——子 netns 的 localhost 到不了真实宿主，必须走 slirp4netns 的
 * guest→host 通道。DB/Redis 是子 netns 内容器（与 app 同 netns），恒 localhost 无需改。
 * 端口由 step6 定案，故在 step10 启动 app 容器前调用（.env 此时已含最终端口）。
 * root/sudo 模式：app 容器与宿主进程同处真实宿主 netns，后端默认 http://localhost:<port>
 * 即可达，无需改。
 */
function applyRootlessHostUrls() {
  if (MODE !== 'rootless') return;
  const env = parseEnvFile(ENV_FILE);
  const hostIp = '10.0.2.2';
  const coopPort = env.COOPERATE_PORT || '3091';
  const convPort = env.CONVERSION_SERVICE_PORT || '3100';
  updateEnvFile(
    ENV_FILE,
    {
      COOPERATE_URL: `http://${hostIp}:${coopPort}`,
      CONVERSION_SERVICE_URL: `http://${hostIp}:${convPort}`,
    },
    ENV_EXAMPLE
  );
  log(`rootless 模式：app 容器经 ${hostIp} 访问宿主进程（协同 :${coopPort}，转换 :${convPort}）`);
}

async function step10AppContainer() {
  applyRootlessHostUrls();
  log('启动应用容器（backend + 前端）...');
  const up = compose(['up', '-d', 'app']);
  if (!up.ok) fail(`docker compose up app 失败：${up.stderr || up.error}`);

  const env = parseEnvFile(ENV_FILE);
  const port = env.PORT || '3001';
  const http = require('http');
  // 25 分钟就绪窗口 + 150s 单次请求超时（慢环境兜底，2026-10 断网验证暴露）：
  //   ① 慢环境（DinD 断网验证，CPU 受限）下后端多个 Redis/PG 客户端重连要 10+ 分钟才全部就绪；
  //   ② /api/health/live 恒返回 HTTP 200（body 里标 status=ok/degraded），但响应要等 redis.ping()
  //      + db healthCheck 完成。慢环境根因 = 后端事件循环被 2 核 CPU 争用饿死（全新进程 25ms 连上
  //      redis、长驻后端却连不上，2026-10-13 实测），客户端连接超时被放宽（pg 120s / redis 60s）
  //      以消除重试风暴；liveness() 的 db/redis 检查已改并行，单次健康检查最坏 = max(120s,60s)=120s，
  //      故单次请求超时取 150s（>120s）确保能完整取回响应。旧版 3s 超时恒在响应到达前销毁 → 误判未就绪。
  // 判据从"HTTP 200"升级为"响应体 status=ok"（db+redis 均健康），避免 degraded（依赖未就绪）也放行。
  const deadline = Date.now() + 1500000;
  let attempt = 0;
  while (Date.now() < deadline) {
    const res = await new Promise((resolve) => {
      const req = http.get({ hostname: '127.0.0.1', port: parseInt(port, 10), path: '/api/health/live', method: 'GET', timeout: 150000 }, (r) => {
        let data = '';
        r.on('data', (c) => (data += c));
        r.on('end', () => resolve({ code: r.statusCode, body: data }));
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
    if (res && res.code === 200) {
      try {
        const parsed = JSON.parse(res.body);
        // 后端 ResponseInterceptor 将响应统一包装为 {code,message,data,timestamp}，
        // 健康状态实际落在 data.status（liveness() 返回的 {status,...} 被包进 data）；
        // 顶层 parsed.status 恒 undefined，旧判定据此恒判不到 ok → 空转满 25min 窗口后误报未就绪。
        // 兼容未包装的裸 {status} 形态（parsed.status 兜底）。
        const st = (parsed.data && parsed.data.status) || parsed.status;
        if (st === 'ok') {
          log('后端服务已就绪（db + redis 均健康）');
          return;
        }
      } catch {
        // 响应非 JSON（如 nginx 502 页面）→ 继续轮询
      }
    }
    sleep(Math.min(1000 * 2 ** attempt++, 15000));
  }
  const appLogs = docker(['logs', '--tail', '40', 'cloudcad-app'], 15000);
  fail(`后端 25 分钟内未就绪。\n${appLogs.stdout || appLogs.stderr}`);
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
    dockerCli: DOCKER_CLI,
    dockerHost: DOCKER_HOST,
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
  const fe = env.FRONTEND_PORT || '8000';
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
  checkDataDirOwnership();
  step2Env();
  // 慢环境兜底：拉长客户端 SYN 重试窗口（须在 step1Permission 定 MODE 后、容器启动前）
  tuneTcpForSlowEnv();
  // 端口定案必须在 step4 之前：rootless 的 slirp4netns hostfwd 在 step4 拉起 dockerd 时
  // 按 .env 的 PORT/FRONTEND_PORT 建立，若 step6 之后才改端口，新端口不会被转发到子 netns。
  // root/sudo 模式无此约束（host 网络直通），提前也无害（容器未起，docker inspect 落空即视为非本部署占用）。
  await step6Ports();
  step4Docker();
  step5Images();
  await step7MxcadProbe();
  await step8InfraContainers();
  await step9HostProcesses();
  await step10AppContainer();
  await step11Verify();
  step12Summary();
}

async function cmdStop() {
  log('停止 CloudCAD 服务...');
  // 判定 dockerd 形态：rootless（pidfile 存活）或非 rootless。
  // rootless 下宿主进程（协同/转换/运维中心）跑在真实宿主、不在 rootless 进程组内，
  // 需单独停；容器在子 netns（rootless dockerd），须先经影子 socket 停容器再杀 dockerd。
  const rootlessPidFile = path.join(DOCKER_DATA_ROOT, 'rootless.pid');
  const rootlessPid = rootless._readPid(rootlessPidFile);
  const isRootless = !!rootlessPid;
  if (isRootless) {
    MODE = 'rootless';
    SUDO = '';
    DOCKER_CLI = path.join(DEPLOY_DIR, 'docker', 'docker');
    DOCKER_HOST = `unix://${path.join(DOCKER_DATA_ROOT, 'shadow-run', 'docker-rootless.sock')}`;
    COMPOSE = 'docker-compose';
    log(`检测到 rootless dockerd（pid=${rootlessPid}），以 rootless 模式停止`);
  } else {
    if (typeof process.geteuid === 'function' && process.geteuid() === 0) {
      MODE = 'root';
      SUDO = '';
    } else {
      const probe = spawnSync('sudo', ['-n', 'true'], { stdio: 'ignore' });
      MODE = 'sudo';
      SUDO = probe.status === 0 ? 'sudo' : '';
    }
    DOCKER_CLI = 'docker';
    DOCKER_HOST = '';
    detectCompose();
  }

  // 1) 停容器（rootless 下经影子 socket 与 rootless dockerd 通信，必须在杀 dockerd 之前）
  const down = compose(['down'], 120000);
  if (!down.ok) {
    warn(`docker compose down 未完全成功（${down.stderr || down.error}），继续停止其余服务`);
  } else {
    log('容器已停止（数据保留在 data/ 目录）');
  }
  // 2) 停宿主进程（真实宿主上的协同/转换/运维中心，rootless 与非 rootless 均在真实宿主）
  for (const name of ['config-service', 'conversion', 'cooperate']) {
    await hostProcess.stopHostProcess({ name, pidFile: path.join(PID_DIR, `${name}.pid`), log });
  }
  // 3) 停 dockerd
  if (isRootless) {
    const r = rootless.stop({ pidFile: rootlessPidFile, log });
    log(r.stopped ? 'rootless dockerd 已停止' : 'rootless dockerd 未在运行');
  } else if (fs.existsSync(path.join(DATA_DIR, '.docker-installed'))) {
    log('停止本包自装的 dockerd...');
    dockerBootstrap.run(`${SUDO} pkill -x dockerd 2>/dev/null || true`, { sudo: '', timeoutMs: 15000 });
  }
  log('已全部停止');
}

async function cmdVerify() {
  step1Permission();
  // rootless dockerd 存活（pidfile）→ 用影子 socket 通信（与 cmdStop 同口径）
  const rootlessPidFile = path.join(DOCKER_DATA_ROOT, 'rootless.pid');
  const rootlessPid = rootless._readPid(rootlessPidFile);
  if (rootlessPid) {
    MODE = 'rootless';
    SUDO = '';
    DOCKER_CLI = path.join(DEPLOY_DIR, 'docker', 'docker');
    DOCKER_HOST = `unix://${path.join(DOCKER_DATA_ROOT, 'shadow-run', 'docker-rootless.sock')}`;
  }
  const env = parseEnvFile(ENV_FILE);
  const result = await verifyDeployment({
    deployDir: DEPLOY_DIR,
    env,
    sudo: SUDO,
    dockerInstalledByUs: fs.existsSync(path.join(DATA_DIR, '.docker-installed')),
    imageTags: IMAGE_TAGS,
    version: VERSION,
    dockerCli: DOCKER_CLI,
    dockerHost: DOCKER_HOST,
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
