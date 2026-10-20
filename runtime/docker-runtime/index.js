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
  DEFAULT_ADMIN_PASSWORD,
} = require(path.join(DEPLOY_DIR, 'runtime', 'scripts', 'lib', 'secret-generator'));
const { composeDatabaseUrl } = require(path.join(DEPLOY_DIR, 'runtime', 'scripts', 'lib', 'database-url'));
const { resolveMxcadAssemblyPath } = require(path.join(DEPLOY_DIR, 'runtime', 'scripts', 'lib', 'mxcad-path'));
const { PRODUCT_NAME } = require(path.join(DEPLOY_DIR, 'runtime', 'scripts', 'lib', 'branding'));

const dockerBootstrap = require('./lib/docker-bootstrap');
const hostProcess = require('./lib/host-process');
const { probeAndFix } = require('./lib/mxcad-probe');
const { verifyDeployment } = require('./lib/verify');
const rootless = require('./lib/rootless');
const {
  formatContainerState,
  formatHostProcState,
} = require('./lib/status-format');

// ==================== 基础工具 ====================

function log(msg) {
  console.log(`[${PRODUCT_NAME}] ${msg}`);
}
function warn(msg) {
  console.warn(`[${PRODUCT_NAME}][警告] ${msg}`);
}
function fail(msg) {
  console.error(`[${PRODUCT_NAME}][错误] ${msg}`);
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
// 权限模式：'root'（用户自愿以 root 运行）| 'system'（普通用户但系统 Docker 无需 sudo 即可用，
// 直接复用）| 'rootless'（普通用户且系统 Docker 不可用 → 包内静态 Docker 走用户命名空间，
// ADR-0075 完全无 root）
let MODE = 'root';
// rootless 时指向包内静态 docker CLI（/usr/local/bin 未必有）；root 用 PATH 的 docker
let DOCKER_CLI = 'docker';
// rootless 时 = unix://<影子目录>/docker-rootless.sock（部署目录过深超 unix socket 108 字节上限时
// 回退 /tmp 短路径，见 rootless.resolveSocketPath）；root 时 = ''（默认 socket）
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
 * 仅 root 模式可写 /proc/sys（rootless 无 CAP_SYS_ADMIN、system 模式是普通用户，均跳过）；
 * 写失败只警告不阻塞（正常部署机核数充足、服务端应答快，本参数无副作用）。per-netns 参数：
 * host 网络下 app 容器与宿主共享 netns，此处写入即对后端客户端生效。
 */
function tuneTcpForSlowEnv() {
  if (MODE !== 'root') return;
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

// ==================== Step 1 权限模式定案 ====================

/**
 * 权限模式定案（ADR-0075：部署完全无 root；取代 ADR-0074 D5 的三级门禁）：
 *   - euid == 0（用户自愿以 root 运行）→ root dockerd 路径（root 无需密码；这是用户选择，非依赖）
 *   - 普通用户 + 系统 Docker 当前用户无需 sudo 即可用（docker version 有 Server 端返回，
 *     如用户在 docker 组）→ 直接复用系统 Docker：零安装、不碰包内静态 Docker
 *   - 普通用户 + 系统 Docker 不可用（未安装 / 需 root 权限）→ rootless（用户命名空间 + 包内静态 Docker）：
 *     **不探测 sudo、不请求任何密码**，部署目录（data/、docker-data/、日志）全部归当前用户。
 *     零管理员前置：包内镜像全部以 uid 0 运行，单段 0→euid 映射即够（无需 uidmap/subuid）。
 */
function step1Permission() {
  if (typeof process.geteuid === 'function' && process.geteuid() === 0) {
    MODE = 'root';
    SUDO = '';
    return;
  }
  // 系统 Docker 对当前用户直接可用（无需 sudo）→ 复用；仅当系统 docker 不可用
  // （未安装 / 需 root）才回退包内 rootless 静态 Docker
  if (dockerBootstrap.dockerReady('')) {
    const v = dockerBootstrap.run(`docker version --format '{{.Server.Version}}'`, { timeoutMs: 15000 });
    MODE = 'system';
    SUDO = '';
    log(`系统 Docker（${v.stdout || '版本未知'}）当前用户可直接使用 → 直接复用（不使用包内静态 Docker）`);
    return;
  }
  log('普通用户模式 → rootless（用户命名空间 + 包内静态 Docker，无需 root/sudo 密码）');
  const toolsDir = path.join(DEPLOY_DIR, 'docker');
  const prereq = rootless.checkPrerequisites({ toolsDir, log });
  for (const n of prereq.notes) log(n);
  const nsBin = path.join(toolsDir, 'rootless-ns');
  if (!fs.existsSync(nsBin)) {
    fail(
      '包内 rootless-ns 二进制缺失（' + nsBin + '），部署包不完整，无法以 rootless 模式启动。\n' +
        '  请重新下载并完整解压部署包。'
    );
  }
  MODE = 'rootless';
  SUDO = '';
  DOCKER_CLI = path.join(DEPLOY_DIR, 'docker', 'docker');
  // 提前设置 DOCKER_HOST（影子 socket 路径固定）：step6 的 isPortOurs 需经影子 socket 探测
  // 已运行的 app 容器（rootless dockerd 若已在上次 start 拉起），否则会误判端口被他人占用而顺延。
  // step4 的 rootless.start 会再次确认（幂等）。
  DOCKER_HOST = `unix://${rootless.resolveSocketPath(DOCKER_DATA_ROOT)}`;
  // 剩余可缺失项只有 slirp4netns（包内静态版恒在；缺失仅降级 plain-netns，不中止）
  for (const m of prereq.missing) {
    warn(`rootless 前置缺失：${m.name}\n      ${m.hint}`);
  }
  if (!prereq.ok) {
    warn('rootless 前置不完整，将以降级模式运行（详见上方缺失项）；完整功能请补齐后重跑 ./start.sh');
  }
}

/**
 * 部署目录属主预检（ADR-0075：完全无 root）——在 12 步入口快速失败。
 * 部署目录（或 data/）由 root 创建时（之前 root 部署 / 以 root 解压包），普通用户
 * 不可写：若不在入口拦下，会在 12 步中途以难懂的 EACCES 失败。给出明确修复路径。
 */
function checkDeployDirOwnership() {
  if (typeof process.geteuid !== 'function' || process.geteuid() === 0) return;
  for (const p of [DEPLOY_DIR, DATA_DIR]) {
    if (!fs.existsSync(p)) continue;
    try {
      fs.accessSync(p, fs.constants.W_OK);
    } catch {
      let owner = '未知';
      try {
        owner = `uid ${fs.statSync(p).uid}`;
      } catch {
        /* stat 失败不影响报错主体 */
      }
      fail(
        `部署目录当前用户不可写：${p}（属主 ${owner}，当前用户 uid ${process.geteuid()}）。\n` +
          '  该部署此前由 root 创建（或以 root 解压了部署包）。\n' +
          `  修复：用 root 执行 chown -R <用户名>:<用户组> ${DEPLOY_DIR}，` +
          '或以普通用户重新解压部署包。'
      );
    }
  }
}

/**
 * rootless 兜底：宿主侧数据目录属主非当前用户（如之前 rootful 部署的残留）时，
 * 单段 uid 映射下落到 overflow 65534，容器内 uid 0 无法读写
 * （postgres 在 $PGDATA 上 mkdir 报 Permission denied，redis 写 appendonly 失败）。
 * 移开备份（保留旧数据）后由 dockerd 在 bind mount 时以当前用户属主重建。
 * 仅 rootless 有意义：root 模式容器内 uid 0 = 宿主 root，任何属主都可写。
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
  if (!fs.existsSync(ENV_FILE)) {
    if (!fs.existsSync(ENV_EXAMPLE)) fail('缺少 .env.example 模板');
    fs.copyFileSync(ENV_EXAMPLE, ENV_FILE);
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

  // 不再落盘 DEPLOY-PASSWORDS.txt：明文重复 .env 的内容，且三份口令都有免旧密码的
  // 重置通道（cli.js admin:reset-password / db:reset-password / redis:reset-password）。
  // 初始管理员口令由 fillEmptySecrets 统一填默认值，非交互部署不再需要「一次可见」的凭据出口。
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
 * root 模式：app 容器与宿主进程同处真实宿主 netns，后端默认 http://localhost:<port>
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
  // 凭据不再落明文文件：三份口令唯一存于 .env，丢失走免旧密码的重置通道
  log(`凭据文件: ${ENV_FILE}`);
  if (env.INITIAL_ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD) {
    log(`⚠ 管理员仍在用默认口令 ${DEFAULT_ADMIN_PASSWORD}，请尽快登录后修改（管理后台顶部有提示横幅）`);
  }
}

// ==================== 命令入口 ====================

async function cmdStart() {
  checkDeployDirOwnership(); // root 残留预检：入口快速失败（ADR-0075 完全无 root）
  step0Artifacts();
  step1Permission();
  checkDataDirOwnership();
  step2Env();
  // 慢环境兜底：拉长客户端 SYN 重试窗口（须在 step1Permission 定 MODE 后、容器启动前）
  tuneTcpForSlowEnv();
  // 端口定案必须在 step4 之前：rootless 的 slirp4netns hostfwd 在 step4 拉起 dockerd 时
  // 按 .env 的 PORT/FRONTEND_PORT 建立，若 step6 之后才改端口，新端口不会被转发到子 netns。
  // root 模式无此约束（host 网络直通），提前也无害（容器未起，docker inspect 落空即视为非本部署占用）。
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

/**
 * 探测运行时形态并设置模块级 docker 环境（MODE/SUDO/DOCKER_CLI/DOCKER_HOST/COMPOSE）。
 * rootless dockerd 存活（rootless.pid）→ rootless（影子 socket + 包内静态 CLI）；
 * 否则按 euid：root → root dockerd；普通用户 → rootless 语义但用 PATH docker
 * （未 start 过时无 rootless dockerd 可连，docker 侧自然降级）。
 * cmdStop / cmdStatus 共用（唯一出口，避免两处各写一份探测）。
 * @returns {{ isRootless: boolean, rootlessPid: number|null }}
 */
function detectRuntimeMode() {
  const rootlessPidFile = path.join(DOCKER_DATA_ROOT, 'rootless.pid');
  const rootlessPid = rootless._readPid(rootlessPidFile);
  const isRootless = !!rootlessPid;
  if (isRootless) {
    MODE = 'rootless';
    SUDO = '';
    DOCKER_CLI = path.join(DEPLOY_DIR, 'docker', 'docker');
    DOCKER_HOST = `unix://${rootless.resolveSocketPath(DOCKER_DATA_ROOT)}`;
    COMPOSE = 'docker-compose';
  } else {
    if (typeof process.geteuid === 'function' && process.geteuid() === 0) {
      MODE = 'root';
      SUDO = '';
    } else {
      // 普通用户：不探测 sudo（ADR-0075 完全无 root）。rootless dockerd 未在运行时，
      // docker 侧无可停对象（系统 docker 若不可用，compose down 自然失败走 warn 分支）。
      MODE = 'rootless';
      SUDO = '';
    }
    DOCKER_CLI = 'docker';
    DOCKER_HOST = '';
    detectCompose();
  }
  return { isRootless, rootlessPid };
}

async function cmdStop() {
  log(`停止 ${PRODUCT_NAME} 服务...`);
  // 判定 dockerd 形态（rootless pidfile 存活 → rootless；否则按 euid），与 cmdStatus 共用
  // detectRuntimeMode（唯一出口）。rootless 下宿主进程（协同/转换/运维中心）跑在真实宿主、
  // 不在 rootless 进程组内，需单独停；容器在子 netns（rootless dockerd），须先经影子 socket
  // 停容器再杀 dockerd。
  const { isRootless, rootlessPid } = detectRuntimeMode();
  if (isRootless) {
    log(`检测到 rootless dockerd（pid=${rootlessPid}），以 rootless 模式停止`);
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
    DOCKER_HOST = `unix://${rootless.resolveSocketPath(DOCKER_DATA_ROOT)}`;
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

/**
 * 服务状态（Docker 形态，#434 / ADR-0075 D3）：容器（pg/redis/app）+ 宿主进程
 * （协同/转换/运维中心）。只读、无副作用——docker 守护进程不可达或从未 start 过时
 * 逐项降级为「未创建/未运行」，不抛错（status 是排障入口，必须恒可用）。
 */
async function cmdStatus() {
  detectRuntimeMode();
  const env = fs.existsSync(ENV_FILE) ? parseEnvFile(ENV_FILE) : {};

  console.log('');
  log('>>> 服务状态（Docker 形态）');
  console.log('');

  // ---- 容器（docker）----
  console.log('■ 容器（docker）');
  const containers = [
    { name: 'cloudcad-pg', label: '数据库 PostgreSQL', portKey: 'DB_PORT', defPort: '5432' },
    { name: 'cloudcad-redis', label: 'Redis 缓存', portKey: 'REDIS_PORT', defPort: '6379' },
    { name: 'cloudcad-app', label: '应用（backend + 前端）', portKey: 'PORT', defPort: '3001' },
  ];
  let containerFailCount = 0;
  for (const c of containers) {
    const port = env[c.portKey] || c.defPort;
    const r = docker(
      ['inspect', '-f', '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}', c.name],
      15000
    );
    if (!r.ok) {
      containerFailCount++;
      console.log(`  ${c.name.padEnd(16)} 未创建   ${c.label}（: ${port}）`);
      continue;
    }
    const [state, health] = r.stdout.split('|');
    console.log(`  ${c.name.padEnd(16)} ${formatContainerState(state, health)}   ${c.label}（: ${port}）`);
  }
  if (containerFailCount === containers.length) {
    console.log('  （docker 守护进程未运行或不可达——未执行过 ./start.sh，或已 ./stop.sh）');
  }
  console.log('');

  // ---- 宿主进程（nohup）----
  console.log('■ 宿主进程（nohup）');
  const useConversion = (env.FUNCTION_EXECUTOR || 'process-pool').toLowerCase() === 'conversion-service';
  const hostProcs = [
    { name: 'cooperate', label: '协同服务', portKey: 'COOPERATE_PORT', defPort: '3091', show: true },
    { name: 'conversion', label: '转换服务', portKey: 'CONVERSION_SERVICE_PORT', defPort: '3100', show: useConversion },
    { name: 'config-service', label: '运维中心', portKey: 'CONFIG_SERVICE_PORT', defPort: '3002', show: true },
  ];
  for (const p of hostProcs) {
    if (!p.show) continue;
    const port = env[p.portKey] || p.defPort;
    const pid = hostProcess.readPid(path.join(PID_DIR, `${p.name}.pid`));
    const alive = hostProcess.isProcessAlive(pid);
    const portOk = alive ? await hostProcess.portOpen(parseInt(port, 10)) : false;
    console.log(`  ${p.name.padEnd(16)} ${formatHostProcState(pid, alive, portOk)}${pid ? `（pid=${pid}）` : ''}   ${p.label}（: ${port}）`);
  }
  console.log('');
}

// CLI 入口守卫：被 require 时（cli.js 前置分派的 docker-form-adapter）只导出编排函数，
// 不执行命令分派（ADR-0075 C4：start.sh/stop.sh/cloudcad.sh 与直调 index.js 共用同一份编排）。
if (require.main === module) {
  const command = process.argv[2];
  if (command === 'start') {
    cmdStart().catch((err) => fail(err.stack || err.message));
  } else if (command === 'stop') {
    cmdStop().catch((err) => fail(err.stack || err.message));
  } else if (command === 'status') {
    cmdStatus().catch((err) => fail(err.stack || err.message));
  } else if (command === 'verify') {
    cmdVerify().catch((err) => fail(err.stack || err.message));
  } else {
    console.error('用法: node runtime/docker-runtime/index.js start|stop|status|verify');
    process.exit(1);
  }
}

module.exports = { cmdStart, cmdStop, cmdStatus, cmdVerify };
