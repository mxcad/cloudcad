/**
 * @fileoverview 启动服务命令（start / startAppServices / 前台模式）
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - waitForServicesForeground / startAppServices / startOnly
 *   testConnection / startMode / startAppServicesWithInfra
 *
 * 依赖方向：commands → lib + 其他 commands。前台分支 childProcesses 经 lib/state 共享。
 * 命令间 require（A-1 机械拆分临时耦合，A-2 收口）。
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const {
  IS_LINUX,
  USE_RUNTIME,
  PROJECT_ROOT,
  RUNTIME_DIR,
  DATA_DIR,
  PORTS,
  NODE_EXE,
  PM2_JS,
  getMobileAccessPath,
  OPS_ENTRY,
  INFRA_SERVICE_APPS,
} = require('../lib/context');
const { colors, log, clearScreen, printHeader } = require('../lib/logger');
const { promptChoice } = require('../lib/prompt');
const { getAdminLoginPath } = require('../lib/admin-login');
const {
  runPm2,
  getPm2AppStatus,
  getPm2StatusList,
  getPidByPort,
  isNodePid,
  isOurRuntimeProcess,
  isForeignCloudCadRuntimeProcess,
  classifyPortOwner,
  getProcessExecutablePath,
  getProcessCmdlines,
  killTree,
} = require('../lib/proc');
const {
  waitForPort,
  waitForDatabase,
  waitForRedis,
  waitAndOpenBrowsers,
  openBrowser,
  isPortOpen,
  waitPortReleased,
} = require('../lib/health');
const { parseEnvFile, updateEnvFile } = require('../lib/env');
const { findFreePortUpFrom, decideConversionPortAction } = require('../lib/infra-gate');
const { writePm2AppConfig } = require('../lib/pm2-bootstrap');
const { resolveMxcadAssemblyPath } = require('../lib/mxcad-path');
const { probeAndFix } = require('../lib/mxcad-probe');
const { promptConfirm } = require('../lib/prompt');
const { alignConversionServiceUrl, syncConversionServiceEnvPort } = require('../config-updater');
const state = require('../lib/state');
const {
  startInfrastructure,
  isPm2AppFromThisProject,
  askForeignServiceStop,
  stopForeignService,
} = require('./infra');
const { stopAppServices } = require('./stop');
const { runDatabaseMigration, runPiiBackfill } = require('./migrate');
const { runSetupWizard, showCurrentPasswords } = require('./setup-wizard');
const { setupSignalHandlers } = require('../foreground/registry');

// 后端 .env：conversion-service 端口顺延时回写 CONVERSION_SERVICE_PORT 的事实源，
// 与 getConversionServiceConfig 内的 envPath 同一路径。
const BACKEND_ENV_PATH = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');

/**
 * 前台模式：等待服务就绪，后端进程退出时即时显示错误
 *
 * P2.7 修复：同时捕获后端 stdout + stderr，启动失败时显示两者尾部（stdout 不再丢失）。
 */
async function waitForServicesForeground(backendProcess, backendOutput) {
  log('cyan', '等待所有服务就绪...');

  // 同时检查后端 health 和进程状态
  const http = require('http');

  // 前端服务只检测端口
  const checkServices = async () => {
    const backendReady = await new Promise((resolve) => {
      // 指数退避：避免后端未就绪时高频探测（每次 /api/health/live 都会触发数据库健康检查）
      let attempt = 0;
      const backoffDelay = () => Math.min(1000 * 2 ** attempt++, 10000);
      // 总超时上限：防止后端进程存活但 health 一直 error/timeout 时无限循环重试
      // （每次重试都会触发一次数据库健康检查，无限循环会持续压垮 DB，导致 PG 反复重启）
      const BACKEND_WAIT_TIMEOUT_MS = 180000; // 3 分钟
      const startTime = Date.now();

      // settled 门禁：成功/退出/超时后必须立刻停手。timeout:3000 是 socket **空闲**
      // 超时，响应回来后若不销毁连接、不拦截后续事件，3s 后 timeout 仍会触发并重排
      // 下一次探测——实测就绪后仍持续探测满 3 分钟（每探测一次都触发一次 DB+Redis
      // 健康检查）。故三处回调全部先判 settled 再动作。
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      const scheduleRetry = () => {
        if (!settled) setTimeout(tryCheck, backoffDelay());
      };

      const tryCheck = () => {
        if (settled) return;
        // 进程已退出 → 不用再等了
        if (backendProcess.exitCode !== null || backendProcess.killed) {
          finish(false);
          return;
        }
        // 超过总等待上限 → 停止循环，避免无限重试
        if (Date.now() - startTime >= BACKEND_WAIT_TIMEOUT_MS) {
          finish(false);
          return;
        }

        const req = http.request(
          { hostname: 'localhost', port: PORTS.backend, path: '/api/health/live', method: 'GET', timeout: 3000 },
          (res) => {
            // 只取状态码，body 不消费：主动释放连接，防止后续空闲超时重排探测
            finish(res.statusCode === 200);
            res.destroy();
          }
        );
        req.on('error', scheduleRetry);
        req.on('timeout', () => {
          req.destroy();
          scheduleRetry();
        });
        req.end();
      };
      tryCheck();
    });

    if (!backendReady) {
      // 区分"进程已退出"与"健康检查未通过但进程仍存活"两种场景（诊断更准确）
      const exited = backendProcess.exitCode !== null || backendProcess.killed;
      const outputText = backendOutput.join('').trim();
      if (exited) {
        log('red', `\n[错误] 后端服务进程已退出（退出码: ${backendProcess.exitCode}）`);
        if (outputText) {
          const lastLines = outputText.split('\n').slice(-30).join('\n');
          log('red', `最后 ${30} 行日志:\n${lastLines}`);
        }
      } else {
        log('red', '\n[错误] 后端服务健康检查未通过（进程仍在运行）');
        if (outputText) {
          const lastLines = outputText.split('\n').slice(-30).join('\n');
          log('red', `最后 ${30} 行日志:\n${lastLines}`);
        }
      }
      return false;
    }

    log('green', `  ✓ 后端服务已就绪 (端口 ${PORTS.backend})`);

    // 等待配置中心和前端端口（较短超时）
    try {
      await waitForPort(PORTS.configService, '配置中心', 15000);
    } catch {
      log('yellow', '  ⚠ 配置中心未就绪');
    }
    try {
      await waitForPort(PORTS.frontend, '前端页面', 15000);
    } catch {
      log('yellow', '  ⚠ 前端页面未就绪');
    }
    return true;
  };

  const ok = await checkServices();
  if (!ok) {
    log('red', '后端服务启动失败，请检查上方日志');
    return false;
  }

  console.log('');
  log('green', '╔══════════════════════════════════════════════════════════╗');
  log('green', `║        所有服务已就绪                                     ║`);
  log('green', '╠══════════════════════════════════════════════════════════╣');
  log('green', '║  后端:  http://localhost:' + PORTS.backend + '           ║');
  log('green', '║  前端:  http://localhost:' + PORTS.frontend + '           ║');
  const map = getMobileAccessPath();
  log('green', '║  移动端: http://localhost:' + PORTS.frontend + '/' + map + '/  ║');
  log('green', '║  API:   http://localhost:' + PORTS.backend + '/api       ║');
  log('green', '║  API文档: http://localhost:' + PORTS.backend + '/api/docs ║');
  log('green', '║  管理员: http://localhost:' + PORTS.frontend + getAdminLoginPath() + '  ║');
  log('green', '╠══════════════════════════════════════════════════════════╣');
  log('green', '║  停止: Ctrl+C / 关闭终端（停止全部服务）               ║');
  log('green', '╚══════════════════════════════════════════════════════════╝');

  // 打开浏览器（前端 + 管理员登录入口）
  openBrowser(`http://localhost:${PORTS.frontend}`);
  openBrowser(`http://localhost:${PORTS.frontend}${getAdminLoginPath()}`);
  return true;
}

/**
 * 判断 PM2 应用服务是否应走 restart（而非 start）。
 * 多次 start 后台模式的修复：只要 backend/frontend 任一已注册（非 unknown，含 stopped/errored），
 * 就 restart 而非 start，避免 `pm2 start` 对已注册 app 报 already launched / 启动重复实例。
 * @param {string} backendStatus getPm2AppStatus('backend') 返回值
 * @param {string} frontendStatus getPm2AppStatus('frontend') 返回值
 * @returns {boolean} true=应 restart；false=未注册需 start
 */
function shouldRestartAppServices(backendStatus, frontendStatus) {
  return backendStatus !== 'unknown' || frontendStatus !== 'unknown';
}

/**
 * PM2 注册的应用层服务名（backend/frontend 由 startAppServices 注册，
 * conversion 仅在 FUNCTION_EXECUTOR=conversion-service 时注册）。
 * 归属判定按名字查表、查不到 entry 即跳过，故无条件列出不会误伤未启用的转换服务。
 * 基础服务名不在此重复定义，用 lib/context 的 INFRA_SERVICE_APPS（单一事实源）。
 */
const APP_PM2_NAMES = ['backend', 'frontend', 'conversion'];

/**
 * 前置归属审计门禁：PM2 注册表中存在**属于另一部署目录且处于 online** 的 cloudcad
 * 服务定义时整体中止，不做任何接管动作。
 *
 * Windows 上 PM2 daemon 全机唯一（命名管道寻址，PM2_HOME 只决定文件位置），多个部署
 * 目录共写同一份 app 注册表。基础服务层已有 foreignApp 防护（infra.js），应用层曾一直
 * 缺失——`pm2 restart <config>` 对同名已注册 app 复用注册表里的旧定义，config 里的新
 * 定义被完全忽略。于是两个部署包混用时：基础服务被换成新包（新 .env 密钥/新数据目录），
 * backend/frontend 却仍是旧包定义（旧 .env 密钥），本目录后端用旧 REDIS_PASSWORD 连
 * 新 redis → AUTH 恒失败（ERR invalid password），且输出上看仍是"正在重启更新"，
 * 差别完全不可见。
 *
 * 门禁必须前置到 startInfrastructure 之前：它有两个破坏性入口——
 * ensureRedisPasswordManaged 在密码不符时会 SHUTDOWN 掉 6379 上的实例、
 * reconcileInfrastructureWithPm2 会对别家定义 `pm2 delete` 并重拉本目录定义。
 * 若这些先执行、随后应用层才发现冲突而中止，就留下"基础服务已换新包、应用层仍是
 * 旧包"的半接管态，且旧 redis 已被 SHUTDOWN 无法回退。
 *
 * 只拦 online 的别家定义（PM2 报告其包装进程存活，即对方项目仍在服务），不探端口
 * ——避免"端口探测失败"被漏判成可接管。stopped/errored 的别家定义是安全的：删除只
 * 影响注册表条目，不涉及任何运行中进程，也不碰对方的库（数据按各自 data/ 目录隔离）。
 * 这与基础层"非 redis 服务不做自动接管、停机须由人决定"的既有取舍一致。
 *
 * @returns {boolean} true=可继续；false=存在冲突，调用方中止
 */
async function assertNoForeignAppConflict() {
  const entries = getPm2StatusList();
  const conflicts = [];
  for (const appName of [...INFRA_SERVICE_APPS, ...APP_PM2_NAMES]) {
    const entry = entries.find((a) => a.name === appName);
    if (!entry || isPm2AppFromThisProject(entry)) continue;
    if (!entry.pm2_env || entry.pm2_env.status !== 'online') continue;
    conflicts.push(`${appName}（${entry.pm2_env.pm_cwd || '未知目录'}）`);
  }
  if (conflicts.length === 0) return true;

  log(
    'red',
    `  [错误] 检测到以下服务由另一部署目录提供且仍在运行：${conflicts.join('、')}`
  );
  log(
    'red',
    '  本次不接管——不会误删/误改对方正在提供的服务与其数据库，否则本目录会用错配密钥连接。'
  );
  log(
    'cyan',
    `  继续方式：先在旧部署目录运行 ${OPS_ENTRY} stop（或该目录的 stop.bat），` +
      '确认端口全部释放后重跑本流程。'
  );
  return false;
}

/**
 * 删除 PM2 注册表中属于**另一部署目录**的应用层服务定义。
 *
 * `pm2 restart <config>` 对同名已注册 app 复用注册表里的旧定义（旧 cwd/旧 script/
 * 旧 .env 密钥），config 里的新定义被完全忽略——不清理的话本目录应用层配置不生效，
 * 且输出上仍是"检测到服务已注册，正在重启更新..."，差别不可见。这与基础层 infra.js
 * 对别家定义的处置一致（先 `pm2 delete` 再用本目录配置重新注册）。
 *
 * 只在 assertNoForeignAppConflict 已拦下 online 冲突之后调用，故此处被 delete 的条目
 * 必然处于 stopped/errored，不会终止对方正在运行的服务。
 * @param {string[]} names 本次要注册的应用层服务名
 */
function deleteForeignAppDefinitions(names) {
  const entries = getPm2StatusList();
  const foreign = names.filter((name) => {
    const entry = entries.find((a) => a.name === name);
    return !!entry && !isPm2AppFromThisProject(entry);
  });
  if (foreign.length === 0) return;
  log(
    'yellow',
    `  [接管] PM2 中 ${foreign.join(', ')} 的注册信息来自另一部署目录，删除后用本目录配置重新注册...`
  );
  runPm2(['delete', ...foreign], { silent: true });
}

/**
 * 后端构建产物入口（单一事实源）。
 * 已验证 nest build（outDir=dist，rootDir=null）实际输出为 packages/backend/dist/main.js
 * （main.ts 在 src/ 下，编译到 dist 根），而非 dist/src/main.js。
 */
function getBackendDist() {
  return path.join(PROJECT_ROOT, 'packages', 'backend', 'dist', 'main.js');
}

/**
 * 转换服务（conversion-service）启动配置。
 * 仅当后端 FUNCTION_EXECUTOR=conversion-service 时启用——否则后端走进程内 process-pool
 * （或 cloud-faas），无需独立转换服务，不起它避免白占进程 + Redis 连接。
 * 启用时从后端 .env 的 REDIS_* 现场拼出 REDIS_URL 注入，保证转换服务的 Redis 连接/密码
 * 与后端始终一致（单一事实源，避免两份配置漂移）。
 * 返回 { enabled, dist, env }；dist 是否真实存在由调用方判断（部署包未含产物时 S9-4 硬失败）。
 */
function getConversionServiceConfig() {
  const dist = path.join(
    PROJECT_ROOT,
    'packages',
    'conversion-service',
    'dist',
    'server.js'
  );
  const envPath = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');
  // CONVERSION_SERVICE_URL ↔ CONVERSION_SERVICE_PORT 对齐，必须在本函数读取 .env 之前：
  // 只改 PORT 不改 URL 时后端恒连旧端口（其缺省值是硬编码 http://localhost:3100），
  // 转换服务却起在新端口——所有转换静默失败而启动全程无感。
  alignConversionServiceUrl(envPath);
  const envConfig = fs.existsSync(envPath) ? parseEnvFile(envPath) : {};
  const executor = (envConfig.FUNCTION_EXECUTOR || 'process-pool').toLowerCase();
  if (executor !== 'conversion-service') {
    return { enabled: false, dist, env: {} };
  }
  // 从后端 REDIS_* 拼 REDIS_URL（与后端 config.redis 同一实例/密码/库）
  const redisHost = envConfig.REDIS_HOST || 'localhost';
  const redisPort = envConfig.REDIS_PORT || '6379';
  const redisDb = envConfig.REDIS_DB || '0';
  const redisPassword = envConfig.REDIS_PASSWORD || '';
  const auth = redisPassword ? `:${redisPassword}@` : '';
  const env = {
    NODE_ENV: 'production',
    CONVERSION_SERVICE_PORT: String(PORTS.conversion),
    REDIS_URL: `redis://${auth}${redisHost}:${redisPort}/${redisDb}`,
    QUEUE_DRIVER: 'redis',
    // #419 内部服务鉴权：与后端共享同一密钥，后端带 X-Internal-Service-Secret 头调用
    ...(envConfig.INTERNAL_SERVICE_SECRET
      ? { INTERNAL_SERVICE_SECRET: envConfig.INTERNAL_SERVICE_SECRET }
      : {}),
    // S1-2 批量管理路由鉴权：后端 conversion-runner 批量下载带 X-Conversion-Service-Secret 头
    // 调用批量路由，须与后端 CONVERSION_SERVICE_SECRET 一致（.env.example 已含该项）。
    // 不注入则服务端该密钥为空，批量路由在部署态实际无密钥防护。
    ...(envConfig.CONVERSION_SERVICE_SECRET
      ? { CONVERSION_SERVICE_SECRET: envConfig.CONVERSION_SERVICE_SECRET }
      : {}),
  };
  // mxcad 二进制路径：conversion-service 的 PROJECT_ROOT 在 dist 布局下会算错，其 assemblyPath
  // 回退会指向不存在的目录。注入绝对路径（取后端 .env 的 MXCAD_ASSEMBLY_PATH，相对则基于部署
  // PROJECT_ROOT 解析；未设则平台默认 runtime/<platform>/mxcad/），确保转换服务找到 mxcad。
  // 跨平台误配置回退见 lib/mxcad-path.js（与后端 resolveMxExecutablePath 同语义）：后端自身会
  // 回退 Linux 上的 Windows .exe 配置，但转换服务直接读该 env 无守卫——原样注入会让它去 spawn
  // 部署包里不存在的 runtime/windows/mxcad/mxcadassembly.exe → 每次转换 ENOENT。
  const mxcadAssemblyRaw = resolveMxcadAssemblyPath(envConfig);
  env.MXCAD_ASSEMBLY_PATH = path.isAbsolute(mxcadAssemblyRaw)
    ? mxcadAssemblyRaw
    : path.join(PROJECT_ROOT, mxcadAssemblyRaw);
  return { enabled: true, dist, env };
}

/**
 * mxcad 双向探针（dwg→mxweb + mxweb→dwg，与 docker 部署路径共用 lib/mxcad-probe）：
 * 失败时 SystemLib 覆盖重试，两次都失败只落标记 + 告警，**永不阻塞启动**
 * （转换不可用不影响登录与协同）。
 *
 * 引擎二进制按后端 .env 的 MXCAD_ASSEMBLY_PATH 解析（与 getConversionServiceConfig
 * 注入转换服务的是同一事实源），保证探针测的就是应用实际使用的那个二进制；
 * 未配置时回退平台默认 runtime/<platform>/mxcad/（lib/mxcad-path）。
 */
async function runMxcadProbe() {
  // 无 runtime/<platform> 的纯开发树没有 mxcad 物料，探针必失败——跳过，
  // 也避免给开发树留下「mxcad 不可用」的误判标记（标记会短路后续探针）
  if (!USE_RUNTIME) return;
  try {
    const envConfig = fs.existsSync(BACKEND_ENV_PATH)
      ? parseEnvFile(BACKEND_ENV_PATH)
      : {};
    const mxcadAssemblyRaw = resolveMxcadAssemblyPath(envConfig);
    const mxcadAssemblyPath = path.isAbsolute(mxcadAssemblyRaw)
      ? mxcadAssemblyRaw
      : path.join(PROJECT_ROOT, mxcadAssemblyRaw);
    await probeAndFix({
      deployDir: PROJECT_ROOT,
      mxcadDir: path.dirname(mxcadAssemblyPath),
      dataDir: DATA_DIR,
      log: (msg) => log('cyan', msg),
    });
  } catch (err) {
    log('yellow', `[mxcad-probe] 探针异常（不影响启动）：${err.message}`);
  }
}

/**
 * 判定应用层端口占用者的归属（与 infra.js 基础服务门禁同一口径）。
 *
 * 走 classifyPortOwner 的统一阶梯，本函数只提供第一级证据（PM2 注册表）与
 * 最终兜底档：
 *   1. PM2 注册表里的 app 名 + pm_cwd 归属（Windows 上 PM2 是机器全局寻址，
 *      注册表本身能覆盖同机所有部署目录）——注意这一级在 pid 为 null 时也能
 *      给出结论，PM2 说在线就说明有实例，端口探测未必扫得到；
 *   2. 可执行文件路径在本目录 runtime/ 下 → 'ours-residual'（本部署包产物，
 *      不是 PM2 托管的残留进程，区别于 'ours-pm2'）；
 *   3. 可执行文件路径含另一目录的 /runtime/<platform>/ → 'foreign-deploy'。
 *
 * @param {{name: string, pid: number|null}} p
 * @returns {'ours-pm2'|'ours-residual'|'foreign-deploy'|'unknown'|'external'}
 */
function classifyAppPortOwner({ name, pid }) {
  return classifyPortOwner(pid, {
    oursEvidence: () => {
      const entry = getPm2StatusList().find((a) => a.name === name);
      if (!entry || !entry.pm2_env || entry.pm2_env.status !== 'online') return null;
      return isPm2AppFromThisProject(entry) ? 'ours-pm2' : 'foreign-deploy';
    },
    oursLabel: 'ours-residual',
    fallback: (p) => {
      if (!isNodePid(p)) return 'external';
      // plain node：exe 是系统 node，既可能是本仓库 pnpm dev 起的同名服务，也可能是
      // 另一部署目录的前台实例——两者在进程表里完全同形，无法区分。
      return 'unknown';
    },
    isOurs: isOurRuntimeProcess,
    isForeign: isForeignCloudCadRuntimeProcess,
  });
}

/** 描述占用者（PID / 可执行文件 / 命令行），用于把"杀掉谁"摆在用户面前。 */
function describeAppPortOwner(pid) {
  const proc = getProcessCmdlines().find((p) => p.pid === pid) || {};
  const exe = getProcessExecutablePath(pid) || proc.exe || '未知路径';
  const cmdline = proc.cmdline || '未知命令行';
  return { exe, cmdline };
}

/**
 * 转换服务端口冲突处置（归属感知）。
 *
 * 与 infra.js 的 relocatePostgresPort / relocateRedisPort 同语义的部分：换端口时
 * 找空闲端口 → 回写 .env → 同步内存 PORTS。不同之处是**先判归属再决定**——上一版
 * 只看"端口是否被占"，把本部署自己的 PM2 实例和另一部署目录的实例都当成外部冲突
 * 静默顺延，于是每 start 一次端口 +1、多部署并存无人知晓。
 *
 * 换端口时两处必须同步，缺一会让服务仍监听旧端口而后端按新端口找它：
 *   1. PORTS.conversion —— 本进程后续 waitForPort/健康检查/停止用它
 *   2. conversion.env.CONVERSION_SERVICE_PORT —— PM2 与前台两路启动都从这里注入
 * 同时 alignConversionServiceUrl 与 syncConversionServiceEnvPort 各回写一份 .env
 * （后端侧 URL、conversion-service 自己那份端口），三份配置一次性对齐。
 *
 * @param {object} conversion getConversionServiceConfig() 的返回值
 * @returns {Promise<'ok'|'blocked'>} blocked = 归属是别人的且用户未同意让位，调用方须中止
 */
async function resolveConversionPortConflict(conversion) {
  const oldPort = PORTS.conversion;
  const pid = getPidByPort(oldPort);
  const ownership = classifyAppPortOwner({ name: 'conversion', pid });
  const action = decideConversionPortAction({ ownership });

  if (action === 'reuse') {
    log(
      'cyan',
      `  [端口] 转换服务端口 ${oldPort} 由本部署 PM2 托管，沿用（重启后重新绑定）`
    );
    return 'ok';
  }

  if (action === 'clean') {
    const owner = describeAppPortOwner(pid);
    log(
      'yellow',
      `  [清理] 转换服务端口 ${oldPort} 被本部署残留进程占用 (PID ${pid}: ${owner.cmdline})，先清理...`
    );
    killTree(pid, { silent: false });
    if (!(await waitPortReleased(oldPort, 15000))) {
      log(
        'red',
        `  [错误] 清理后端口 ${oldPort} 仍被占用，请手动释放后重跑。`
      );
      return 'blocked';
    }
    return 'ok';
  }

  if (action === 'ask-foreign') {
    const owner = describeAppPortOwner(pid);
    log(
      'red',
      `  [冲突] 转换服务端口 ${oldPort} 被另一部署目录的服务占用 (PID ${pid})`
    );
    log('red', `         可执行文件：${owner.exe}`);
    log('red', `         命令行：${owner.cmdline}`);
    const stopIt = await askForeignServiceStop('conversion', oldPort, pid);
    if (!stopIt) {
      log(
        'red',
        '  本次不接管——静默换端口会让两个部署同时对外服务，且没有任何入口提示旧部署仍在运行。'
      );
      log(
        'cyan',
        `  继续方式：先在旧部署目录运行 stop（或直接关闭其终端），确认端口 ${oldPort} 释放后重跑本流程。`
      );
      return 'blocked';
    }
    if (!stopForeignService('conversion', pid)) {
      log(
        'red',
        `  [错误] 停止另一部署目录的转换服务失败。请在该目录手动执行 stop 后重跑。`
      );
      return 'blocked';
    }
    if (!(await waitPortReleased(oldPort, 15000))) {
      log('red', `  [错误] 对方服务已停止但端口 ${oldPort} 仍未释放，请手动检查。`);
      return 'blocked';
    }
    return 'ok';
  }

  if (action === 'ask-unknown') {
    const owner = describeAppPortOwner(pid);
    log(
      'yellow',
      `  [冲突] 转换服务端口 ${oldPort} 被无法判定归属的 node 进程占用 (PID ${pid})`
    );
    log('yellow', `         命令行：${owner.cmdline}`);
    log(
      'yellow',
      '         它可能是本仓库 pnpm dev 起的转换服务，也可能是另一部署目录的前台实例——两者在进程表里同形。'
    );
    const stopIt = await promptConfirm(
      `是否停止该进程后继续启动？(y/N；不确定请选 N，先到对应目录确认)`
    );
    if (!stopIt) {
      log(
        'cyan',
        `  已取消。若确认是另一部署目录的实例，请先在该目录运行 stop；若不确定占用者是谁，可修改 .env 的 CONVERSION_SERVICE_PORT 避开 ${oldPort}。`
      );
      return 'blocked';
    }
    killTree(pid, { silent: false });
    if (!(await waitPortReleased(oldPort, 15000))) {
      log('red', `  [错误] 停止后端口 ${oldPort} 仍未释放，请手动检查。`);
      return 'blocked';
    }
    return 'ok';
  }

  // external：非 node 的系统服务，不碰别人的进程，自己换端口避让
  const newPort = await findFreePortUpFrom(oldPort + 1, {
    maxTries: 100,
    isPortOpen: (p) => isPortOpen(p, '127.0.0.1'),
    exclude: new Set(Object.values(PORTS)),
  });
  if (!newPort) {
    log(
      'red',
      `  [错误] 转换服务端口 ${oldPort} 被外部服务占用，且 ${oldPort + 1}-${oldPort + 100} 范围内未找到空闲端口。` +
        '请手动释放端口或修改 .env 的 CONVERSION_SERVICE_PORT 后重跑。'
    );
    return 'blocked';
  }
  if (!updateEnvFile(BACKEND_ENV_PATH, { CONVERSION_SERVICE_PORT: String(newPort) })) {
    log(
      'red',
      `  [错误] 新转换服务端口 ${newPort} 写入 ${BACKEND_ENV_PATH} 失败。` +
        `请手动把 .env 的 CONVERSION_SERVICE_PORT 改为 ${newPort} 后重跑。`
    );
    return 'blocked';
  }
  PORTS.conversion = newPort;
  conversion.env.CONVERSION_SERVICE_PORT = String(newPort);
  alignConversionServiceUrl(BACKEND_ENV_PATH);
  // 同一事实的第二份：源码 dev（pnpm -r dev）起的转换服务只读自己那份 .env，
  // 不同步会让它仍监听旧端口、后端连新端口 → 转换全部 ECONNREFUSED。
  syncConversionServiceEnvPort(
    path.join(PROJECT_ROOT, 'packages', 'conversion-service', '.env'),
    newPort
  );
  log(
    'yellow',
    `  [换端口] 转换服务端口 ${oldPort} 被外部服务占用 → 已切换到空闲端口 ${newPort}` +
      '，.env 的 CONVERSION_SERVICE_PORT 与 CONVERSION_SERVICE_URL 已同步更新'
  );
  return 'ok';
}

/**
 * 统一的应用服务启动函数
 * @param {'pm2' | 'foreground'} mode - 启动模式
 * @param {Function} [onReady] - 服务就绪后、阻塞等待前回调（P2.4 部署收尾时序修正）
 */
async function startAppServices(mode, onReady) {
  const backendDist = getBackendDist();
  const frontendScript = path.join(RUNTIME_DIR, 'scripts', 'serve-static.js');

  if (!fs.existsSync(backendDist)) {
    log('red', '[错误] 后端 dist 不存在');
    return;
  }
  if (!fs.existsSync(frontendScript)) {
    log('red', '[错误] 前端服务脚本不存在');
    return;
  }

  const modeLabel = mode === 'pm2' ? 'PM2 后台模式' : '前台模式';
  log('blue', `[5/5] 启动生产服务 (${modeLabel})...`);

  // 转换服务：仅当后端 FUNCTION_EXECUTOR=conversion-service 时启用（见 getConversionServiceConfig）。
  // S9-4 dist 缺失硬失败：FUNCTION_EXECUTOR=conversion-service 但部署包未含 conversion-service 产物
  // 属配置/包不一致——静默降级启动会让后端所有转换失败（生产隐患）。故硬失败拒绝启动（exit 1），
  // 强制改用完整部署包或改回 process-pool。process-pool 默认模式 conversion.enabled=false，不受影响。
  // 注：此处 infra（PG/Redis）已由 startAppServicesWithInfra 拉起（PM2 托管、幂等），退出后保留，
  // 下次 start 复用；如需清理可 cloudcad stop。
  const conversion = getConversionServiceConfig();
  const conversionReady = conversion.enabled && fs.existsSync(conversion.dist);
  if (conversion.enabled && !fs.existsSync(conversion.dist)) {
    log(
      'red',
      `[错误] FUNCTION_EXECUTOR=conversion-service 但转换服务构建产物不存在（${conversion.dist}）。` +
        '部署包与配置不一致——继续启动会让后端所有转换静默失败。请改用包含 conversion-service 的完整部署包，或将后端 .env 的 FUNCTION_EXECUTOR 改回 process-pool。'
    );
    process.exit(1);
  }

  // 转换服务端口冲突：先判归属再决定（复用 / 清理本部署残留 / 询问对方部署 / 换端口）。
  // PM2 模式自身不做端口冲突检测，不提前处理就会 EADDRINUSE 反复重试，故两路模式共用。
  let conversionPortHandled = false;
  if (conversionReady && (await isPortOpen(PORTS.conversion))) {
    if ((await resolveConversionPortConflict(conversion)) === 'blocked') return;
    conversionPortHandled = true;
  }

  if (mode === 'pm2') {
    // PM2 后台模式
    // 后端服务环境变量
    const backendEnv = {
      NODE_ENV: 'production',
      PORT: String(PORTS.backend),
      FRONTEND_URL: `http://localhost:${PORTS.frontend}`,
    };
    


    const backendConfig = {
      name: 'backend',
      script: backendDist,
      cwd: path.join(PROJECT_ROOT, 'packages', 'backend'),
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: backendEnv,
    };

    const frontendConfig = {
      name: 'frontend',
      script: frontendScript,
      cwd: PROJECT_ROOT,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        FRONTEND_PORT: String(PORTS.frontend),
        BACKEND_URL: `http://localhost:${PORTS.backend}`,
      },
    };

    // 转换服务条件性追加（未启用时 apps 仍为 [backend, frontend]，pm2-deploy.config.js 格式不变，守 C8）
    const apps = [backendConfig, frontendConfig];
    if (conversionReady) {
      apps.push({
        name: 'conversion',
        script: conversion.dist,
        cwd: path.join(PROJECT_ROOT, 'packages', 'conversion-service'),
        autorestart: true,
        watch: false,
        max_restarts: 10,
        env: conversion.env,
      });
    }

    // 先清理别家定义，再判定 start/restart：别家定义对 `pm2 restart` 会复用注册表里的
    // 旧定义（旧 cwd/旧 script/旧 .env 密钥），本目录配置完全不生效（见
    // deleteForeignAppDefinitions）。必须在清理之后取值——否则别家定义仍算"已注册"，
    // 会误走 restart 去跑别家脚本。
    deleteForeignAppDefinitions(apps.map((a) => a.name));

    const tempConfigPath = writePm2AppConfig(
      path.join(DATA_DIR, 'pm2-deploy.config.js'),
      apps
    );

    // 用"是否已注册"（unknown = 未注册）而非"是否 online"判断 start/restart：
    // - 已注册（online/stopped/errored/launching）→ restart（pm2 start 已注册 app 会报 already launched）
    // - 都未注册（unknown）→ start
    // 这修复"多次 start 后台模式"时，stop 过的 backend/frontend 被重复 start 的问题。
    const backendStatus = getPm2AppStatus('backend');
    const frontendStatus = getPm2AppStatus('frontend');
    const anyRegistered = shouldRestartAppServices(backendStatus, frontendStatus);

    if (anyRegistered) {
      log('yellow', '检测到服务已注册（PM2），正在重启更新...');
      runPm2(['restart', tempConfigPath]);
    } else {
      runPm2(['start', tempConfigPath]);
    }
  } else {
    // 前台模式

    // Q2 应用层端口冲突处理：若 backend/frontend 端口已被占用（如另一前台实例/PM2 旧实例/外部进程），
    // 先判定占用者并提示，避免 EADDRINUSE 静默失败或重复 spawn 双实例。
    const backendPortTaken = await isPortOpen(PORTS.backend);
    const frontendPortTaken = await isPortOpen(PORTS.frontend);
    // 转换服务端口（仅启用时检测，避免 process-pool 模式下误报 3100 占用）。
    // 已由 resolveConversionPortConflict 处理过则不再算冲突——它保证返回后端口要么
    // 归本部署且即将重绑，要么已释放，要么已换到空闲端口。
    const conversionPortTaken =
      conversionReady && !conversionPortHandled && (await isPortOpen(PORTS.conversion));
    if (backendPortTaken || frontendPortTaken || conversionPortTaken) {
      const takenDesc = [];
      if (backendPortTaken) takenDesc.push(`后端 ${PORTS.backend}`);
      if (frontendPortTaken) takenDesc.push(`前端 ${PORTS.frontend}`);
      if (conversionPortTaken) takenDesc.push(`转换服务 ${PORTS.conversion}`);

      log(
        'yellow',
        `[检测] 以下端口已被占用：${takenDesc.join('、')}`
      );

      // 收集每个被占端口的占用者 PID（可能不同进程分别占 backend/frontend/转换服务）
      const takenPids = new Set();
      for (const port of [
        backendPortTaken ? PORTS.backend : null,
        frontendPortTaken ? PORTS.frontend : null,
        conversionPortTaken ? PORTS.conversion : null,
      ]) {
        if (port) {
          const pid = getPidByPort(port);
          if (pid) takenPids.add(pid);
        }
      }

      // 判定占用者归属。三类分开处置，**不能合并成"node 进程即可清理"**：
      // 另一部署目录的 backend/frontend 同样是 node 进程，按残留杀掉等于直接把
      // 别人的部署打掉（且其 PM2 autorestart 会立刻拉起，端口继续被占）。
      const foreignPids = [];
      const cleanable = [];
      const external = [];
      for (const pid of takenPids) {
        if (isForeignCloudCadRuntimeProcess(pid)) foreignPids.push(pid);
        else if (isNodePid(pid) || isOurRuntimeProcess(pid)) cleanable.push(pid);
        else external.push(pid);
      }

      if (foreignPids.length > 0) {
        log(
          'red',
          '  [错误] 以下端口被另一部署目录的服务占用，本次不接管：'
        );
        for (const pid of foreignPids) {
          const owner = describeAppPortOwner(pid);
          log('red', `         PID ${pid}: ${owner.cmdline}`);
          log('red', `         可执行文件：${owner.exe}`);
        }
        log(
          'red',
          '  杀掉对方进程只会被其 PM2 自动拉起，且会造成对方服务中断；静默换端口则会让两个部署同时对外服务。'
        );
        log(
          'cyan',
          `  继续方式：先在旧部署目录运行 ${OPS_ENTRY} stop（或直接关闭其终端），确认端口全部释放后重跑本流程。`
        );
        return;
      }

      if (external.length > 0) {
        log(
          'yellow',
          '  [提示] 部分端口被外部进程占用，CLI 不自动处理；若启动失败请检查端口占用。'
        );
      }

      if (cleanable.length > 0) {
        log(
          'yellow',
          `  （占用者 PID ${cleanable.join(', ')}，疑似残留的应用实例）`
        );
        for (const pid of cleanable) {
          const owner = describeAppPortOwner(pid);
          log('yellow', `         PID ${pid}: ${owner.cmdline}`);
        }
        log(
          'yellow',
          '  提示：命令行是相对路径（如 node dist/main）时无法据此判断属于哪个部署目录；' +
            '若是另一部署目录的前台实例，请选 N 并在该目录用 stop 退出。'
        );
        const killOld = await promptConfirm(
          `是否停止占用这些端口的残留实例后重新启动？(y/N)`
        );
        if (killOld) {
          for (const pid of cleanable) {
            killTree(pid, { silent: false });
          }
          // 等端口释放
          for (const port of [
            backendPortTaken ? PORTS.backend : null,
            frontendPortTaken ? PORTS.frontend : null,
            conversionPortTaken ? PORTS.conversion : null,
          ]) {
            if (port) await waitPortReleased(port, 15000);
          }
          log('green', '[✓] 已清理残留实例，端口已释放');
        } else {
          log('yellow', '[提示] 保留现有实例，跳过前台启动（避免双实例端口冲突）');
          return;
        }
      }
    }

    log('cyan', '启动后端服务...');

    // 构建后端环境变量
    const backendEnv = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORTS.backend),
      FRONTEND_URL: `http://localhost:${PORTS.frontend}`,
    };

    // 前台模式捕获后端 stdout+stderr（P2.7），健康检查失败时显示尾部
    // stdin 必须 ignore：后端不读输入，pipe 会让它持有父进程控制台输入句柄，
    // 表现为命令行"卡住、要点回车才继续"——与下方前端/转换服务同一约束
    //
    // 只保留有界尾部：waitForServicesForeground 只取 slice(-30) 行。此前无界 push
    // 会让 CLI 驱动进程在前台整个生命周期（终端开着就常驻）内持续累积后端全量日志
    // ——按 0.35KB/s 量级约 1.2MB/h、5.3KB/s 量级约 180MB/h，长开终端会一路涨到
    // 堆上限，驱动进程随后被杀，关窗哨兵按「无前台驱动」触发全量停止。
    const BACKEND_OUTPUT_MAX_CHUNKS = 2000;
    const backendOutput = [];
    const pushBackendOutput = (chunk) => {
      backendOutput.push(chunk.toString());
      if (backendOutput.length > BACKEND_OUTPUT_MAX_CHUNKS) {
        backendOutput.shift();
      }
    };
    const backendProcess = spawn(NODE_EXE, [backendDist], {
      cwd: path.join(PROJECT_ROOT, 'packages', 'backend'),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
      detached: IS_LINUX,
      env: backendEnv,
    });
    backendProcess.stdout.on('data', (chunk) => {
      pushBackendOutput(chunk);
      process.stdout.write(chunk);
    });
    backendProcess.stderr.on('data', (chunk) => {
      pushBackendOutput(chunk);
      process.stderr.write(chunk);
    });
    state.childProcesses.add(backendProcess);
    state.appProcesses.add(backendProcess);

    log('cyan', '启动前端服务...');
    const frontendProcess = spawn(NODE_EXE, [frontendScript], {
      cwd: PROJECT_ROOT,
      // stdin 必须 ignore：常驻服务进程不读取输入，避免占用父进程 stdin
      // 导致命令行"卡住，需点回车才继续"（Windows 控制台 stdin 共享问题）
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false,
      windowsHide: true,
      detached: IS_LINUX,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        FRONTEND_PORT: String(PORTS.frontend),
        BACKEND_URL: `http://localhost:${PORTS.backend}`,
      },
    });
    state.childProcesses.add(frontendProcess);
    state.appProcesses.add(frontendProcess);

    // 转换服务（仅 FUNCTION_EXECUTOR=conversion-service 时）：Redis 连接/密码从后端 .env 同步
    if (conversionReady) {
      log('cyan', `启动转换服务 (conversion-service, port=${PORTS.conversion})...`);
      const conversionProcess = spawn(NODE_EXE, [conversion.dist], {
        cwd: path.join(PROJECT_ROOT, 'packages', 'conversion-service'),
        stdio: ['ignore', 'inherit', 'inherit'],
        shell: false,
        windowsHide: true,
        detached: IS_LINUX,
        env: {
          ...process.env,
          ...conversion.env,
        },
      });
      state.childProcesses.add(conversionProcess);
      state.appProcesses.add(conversionProcess);
    }

    // 兜底再武装一次（startAppServicesWithInfra 已在前台模式提前注册过）：
    // setupSignalHandlers 会 removeAllListeners，中间若向导/readline 装过自己的
    // SIGINT 处理器会把它清掉；这里在最长的 waitForServicesForeground 之前补回。
    setupSignalHandlers();

    // 等待所有服务就绪（前台模式）
    const backendOk = await waitForServicesForeground(backendProcess, backendOutput);
    if (!backendOk) return; // 后端启动失败，不继续
  }

  // PM2 模式：等待服务就绪并打开浏览器
  //（前台模式已经在 waitForServicesForeground 中处理了）
  if (mode === 'pm2') {
    console.log('');
    log('green', '╔══════════════════════════════════════════════════════════╗');
    log(
      'green',
      `║        服务已启动 (${modeLabel})${' '.repeat(Math.max(0, 30 - modeLabel.length))}║`
    );
    log('green', '╠══════════════════════════════════════════════════════════╣');
    log('green', '║  后端:  http://localhost:' + PORTS.backend + '           ║');
    log('green', '║  前端:  http://localhost:' + PORTS.frontend + '           ║');
    const map = getMobileAccessPath();
    log('green', '║  移动端: http://localhost:' + PORTS.frontend + '/' + map + '/  ║');
    log('green', '║  API:   http://localhost:' + PORTS.backend + '/api       ║');
    log('green', '║  API文档: http://localhost:' + PORTS.backend + '/api/docs ║');
    log('green', '║  管理员: http://localhost:' + PORTS.frontend + getAdminLoginPath() + '  ║');
    log(
      'green',
      '║  配置:  http://localhost:' + PORTS.configService + '           ║'
    );
    if (conversionReady) {
      log(
        'green',
        '║  转换:  http://localhost:' + PORTS.conversion + '           ║'
      );
    }
    log('green', '╠══════════════════════════════════════════════════════════╣');
    log('green', '║  停止:  选择菜单 [停止服务]                               ║');
    log('green', '╚══════════════════════════════════════════════════════════╝');

    showCurrentPasswords();

    await waitAndOpenBrowsers();
  }

  if (mode === 'foreground') {
    // 部署收尾时序修正（P2.4）：在"阻塞等待进程退出"之前执行 onReady 回调
    //（图纸版本验证 / changelog 等必须在服务仍运行时完成）
    if (typeof onReady === 'function') {
      try {
        await onReady();
      } catch (err) {
        log('yellow', `[警告] onReady 回调执行失败: ${err.message}`);
      }
    }

    // 前台模式：常驻监督，直到终端关闭 / Ctrl+C（信号处理器触发全量停止并退出）。
    // 不再在子进程全部退出时退出 CLI——保持 CLI 存活，确保「关终端 = 全停」始终
    // 成立（覆盖后端崩溃后关终端的场景）。子进程崩溃仅记录日志，不退出。
    await new Promise(() => {
      // setInterval 保持事件循环存活，直到信号处理器 process.exit(0) 终止进程。
      setInterval(() => {
        for (const proc of state.childProcesses) {
          if (proc.exitCode !== null && !proc._crashLogged) {
            proc._crashLogged = true;
            log(
              'red',
              `[警告] 子进程退出（退出码 ${proc.exitCode}），服务可能不可用`
            );
          }
        }
      }, 2000);
      // 不 resolve——CLI 常驻，直到信号处理器 process.exit(0)
    });
  }
}

async function startOnly() {
  clearScreen();
  printHeader();
  log('bright', '>>> 启动基础服务');
  console.log('');

  if (!(await startInfrastructure())) {
    return;
  }

  console.log('');
  log('green', '[✓] 基础服务已启动');
  log('cyan', '  PostgreSQL: localhost:' + PORTS.postgresql);
  log('cyan', '  Redis:      localhost:' + PORTS.redis);
  log('cyan', '  协同服务:   localhost:' + PORTS.cooperate);
  log('cyan', '  配置中心:   localhost:' + PORTS.configService);
}

async function testConnection() {
  const envPath = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');
  if (!fs.existsSync(envPath)) {
    return false;
  }

  const envConfig = parseEnvFile(envPath);
  const dbHost = envConfig.DB_HOST || 'localhost';
  const dbPort = parseInt(envConfig.DB_PORT || '5432');
  const redisHost = envConfig.REDIS_HOST || 'localhost';
  const redisPort = parseInt(envConfig.REDIS_PORT || '6379');

  let dbOk = false;
  let redisOk = false;

  // 测试数据库（协议级：须接受查询，TCP 通连不算就绪）
  try {
    await waitForDatabase(dbPort, 'PostgreSQL', 5000, dbHost);
    dbOk = true;
  } catch (e) {
    log('yellow', `[警告] 数据库连接失败: ${e.message}`);
  }

  // 测试 Redis（协议级：须回 PONG）
  try {
    await waitForRedis(redisPort, 'Redis', 5000, redisHost);
    redisOk = true;
  } catch (e) {
    log('yellow', `[警告] Redis 连接失败: ${e.message}`);
  }

  return dbOk && redisOk;
}

// options 非空 = 非交互调用（运维中心 ADR-0071）：{ mode: 'pm2'|'foreground' }。
// 返回 true/false 表示启动成败；交互调用行为不变。
async function startMode(options = null) {
  // 检查构建产物是否存在（后端入口统一走 getBackendDist，见 startAppServices）
  const backendDist = getBackendDist();
  const frontendDist = path.join(PROJECT_ROOT, 'packages', 'frontend', 'dist');

  if (!fs.existsSync(backendDist)) {
    clearScreen();
    printHeader();
    log('red', '>>> 错误：后端构建产物不存在');
    console.log('');
    log('yellow', '请先构建项目：');
    console.log(`  ${colors.cyan}pnpm build${colors.reset}`);
    console.log('');
    log('cyan', '或使用部署模式（包含构建）：');
    console.log(`  ${colors.cyan}${OPS_ENTRY} deploy${colors.reset}`);
    console.log('');

    if (options) {
      log('red', '非交互模式：构建产物缺失，已中止启动');
      return false;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    await new Promise((resolve) => {
      rl.question(`${colors.bright}按回车键退出...${colors.reset}`, () => {
        rl.close();
        resolve();
      });
    });
    process.exit(1);
  }

  if (!fs.existsSync(frontendDist)) {
    log('yellow', '[警告] 前端构建产物不存在，前端服务将不可用');
  }

  // 确定启动模式
  let usePm2;
  if (options) {
    usePm2 = options.mode !== 'foreground';
    log('cyan', `启动模式: ${usePm2 ? 'PM2 后台运行' : '前台运行'}（非交互）`);
  } else {
    // 询问启动模式
    console.log('');
    console.log(`${colors.cyan}请选择启动模式：${colors.reset}`);
    console.log('');
    console.log(
      `  ${colors.cyan}[1]${colors.reset} PM2 后台运行（服务常驻后台，重启后自动恢复）`
    );
    console.log(
      `  ${colors.cyan}[2]${colors.reset} 前台运行（关闭终端即停止全部服务，可直接删除部署目录，推荐）`
    );
    console.log('');

    // 只接受 1/2（空输入=默认 2 前台）；3 等任意输入不再被静默当成默认项
    const choice = await promptChoice(
      `${colors.bright}请输入选项 [2]: ${colors.reset}`,
      ['1', '2'],
      '2'
    );

    console.log('');

    usePm2 = choice !== '2';
  }

  // 只停止应用层（后端/前端），保留基础服务：避免切换模式时旧后端占用 3001 端口
  // 导致新实例 EADDRINUSE；基础服务由 startInfrastructure 幂等复用，不重启。
  await stopAppServices();

  // 启动基础服务（幂等：已在运行则复用，不重启；由 startAppServicesWithInfra → startInfrastructure 处理）
  if (usePm2) {
    // PM2 模式
    if (!PM2_JS || !fs.existsSync(PM2_JS) || !USE_RUNTIME) {
      log('yellow', '[提示] PM2 不可用，将使用前台模式启动');
      return (await startAppServicesWithInfra('foreground', options)) !== false;
    } else {
      return (await startAppServicesWithInfra('pm2', options)) !== false;
    }
  } else {
    // 前台模式
    return (await startAppServicesWithInfra('foreground', options)) !== false;
  }
}

/**
 * 启动基础服务 + 应用服务（用于 startMode）。
 * options 非空 = 非交互调用：基础服务未就绪时不询问重配、直接中止（return false）。
 */
async function startAppServicesWithInfra(mode, options = null) {
  // 前置归属审计门禁：必须早于 startInfrastructure 的任何破坏性动作（见函数注释）。
  // 失败时不打印 "[1/2] 启动基础服务..."，避免让调用者误以为已进入启动流程。
  if (!(await assertNoForeignAppConflict())) return false;

  // 前台模式：在拉起基础服务**之前**武装退出处理器。此前处理器在 startAppServices
  // 内注册（应用层子进程 spawn 之后），而 startInfrastructure 到 startAppServices
  // 之间那整段窗口（DB/Redis 就绪等待、重配向导、数据库迁移、PII 回填）里关终端
  // 只会触发 OS 硬杀——不派生 detached 全量停止，PM2 托管的基础服务就此残留。
  if (mode === 'foreground') setupSignalHandlers();

  log('blue', '[1/3] 启动基础服务...');

  // 统一走 startInfrastructure（P2.5 双实现合一 + Q0 统一 PM2 托管）：
  // - 部署机（PM2 可用）：基础服务一律 PM2 托管（无论应用层前台/后台）
  // - 纯开发环境（PM2 不可用）：前台 spawn 兜底
  // mode 参数仍传递给应用层（startAppServices），基础服务不再按 mode 分叉。
  if (!(await startInfrastructure(mode === 'pm2'))) {
    return false;
  }

  // 等待基础服务就绪
  log('cyan', '等待服务就绪...');
  let connected = false;

  while (!connected) {
    try {
      await waitForDatabase(PORTS.postgresql, 'PostgreSQL', 30000);
      await waitForRedis(PORTS.redis, 'Redis', 30000);
      connected = true;
    } catch (err) {
      log('red', `[错误] ${err.message}`);
      console.log('');

      if (options) {
        // 非交互（运维中心）：不进入重配向导，直接中止——
        // 配置问题应到「环境配置」页或 CLI 密码向导里解决后重试
        log('red', '非交互模式：基础服务未就绪，已中止启动');
        return false;
      }

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise((resolve) => {
        rl.question(
          `${colors.yellow}是否重新配置？(Y/n): ${colors.reset}`,
          (ans) => {
            rl.close();
            resolve(ans.trim().toLowerCase());
          }
        );
      });

      if (answer !== 'n' && answer !== 'no') {
        await runSetupWizard();
        connected = true;
      } else {
        log('yellow', '跳过配置，启动可能失败');
        connected = true;
      }
    }
  }

  log('green', '[✓] 基础服务已启动');

  // mxcad 双向探针（与 docker 部署路径 step7 同语义）：基础服务就绪后、迁移与应用
  // 服务启动前执行；失败只告警不阻塞（见 runMxcadProbe）。
  await runMxcadProbe();

  // 自动迁移 + PII 存量回填（均幂等：无待应用迁移 / 已回填时秒跳过）。
  // deploy 路径本就做了这两步；start 是升级包「解压覆盖 → 重跑 start」的入口，
  // 这里跳过会让后端带着陈旧 schema 启动（列缺失、枚举新增值未落库），
  // 且数据库不存在时后端直接连不上。
  //
  // 迁移失败必须中止：带着旧 schema 拉起应用只会表现为随机 5xx。
  // PII 回填失败只告警——deploy 已把回填放在启动前，start 再拦一次会新增
  // 「从旧备份整体还原部署目录后 start 起不来」的回归（那个 dist/ 里还没有
  // pii-backfill.js 依赖的产物），而登录侧的降级本就该由回填脚本自己负责。
  if (!(await runDatabaseMigration(options))) {
    log('red', '数据库迁移失败，已中止启动');
    return false;
  }
  if (!(await runPiiBackfill())) {
    log(
      'yellow',
      '⚠️  PII 存量回填失败，应用仍会继续启动（deploy 路径已拦过）；如需立即执行: node packages/backend/scripts/pii-backfill.js'
    );
  }

  // 启动应用服务
  log('blue', '[3/3] 启动应用服务...');
  await startAppServices(mode);
  return true;
}

module.exports = {
  waitForServicesForeground,
  startAppServices,
  shouldRestartAppServices,
  assertNoForeignAppConflict,
  deleteForeignAppDefinitions,
  // 应用层端口归属判定与冲突处置（导出供回归测试；决策表本身在 lib/infra-gate）
  classifyAppPortOwner,
  resolveConversionPortConflict,
  APP_PM2_NAMES,
  startOnly,
  testConnection,
  startMode,
  startAppServicesWithInfra,
};
