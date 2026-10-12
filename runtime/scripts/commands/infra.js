/**
 * @fileoverview 基础设施启动命令（PostgreSQL/Redis/Cooperate/配置中心）
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - startInfrastructure
 * - isServiceRunning
 * （原注释里的 cli.js 行号在拆分后会漂移，故不记录）
 *
 * 依赖方向：commands → lib + foreground/registry（PM2 分支独立实现，前台分支保持现状）。
 * 前台分支的 childProcesses 经 lib/state 共享。
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn, spawnSync } = require('child_process');

const {
  IS_WINDOWS,
  IS_LINUX,
  USE_RUNTIME,
  PROJECT_ROOT,
  RUNTIME_DIR,
  PLATFORM_DIR,
  PORTS,
  BACKEND_ENV_PATH,
  NODE_EXE,
  PM2_JS,
  PM2_HOME,
  INFRA_SERVICE_APPS,
  INFRA_APP_TO_PORT_KEY,
} = require('../lib/context');
const {
  runCommand,
  runPm2,
  getPm2StatusList,
  getPm2AppStatus,
  getPidByPort,
  detectPortOwner,
  isNodePid,
  isOurRuntimeProcess,
  isForeignCloudCadRuntimeProcess,
  getProcessExecutablePath,
  killTree,
} = require('../lib/proc');
const state = require('../lib/state');
// isPortOpen 单一实现位于 lib/health（infra 直接复用，避免重复实现）
const { isPortOpen, waitPortReleased } = require('../lib/health');
const { log } = require('../lib/logger');
const { parseEnvFile } = require('../lib/env');
const { updateEnvFile } = require('../config-updater');
const { credentialFilePath, saveCredentialBackup } = require('../lib/credentials');
const {
  detectRedisOwnership,
  stopRedisProcess,
  loadRedisPassword,
  loadRedisHost,
  probeRedisAuth,
  setRedisPasswordAtRuntime,
  persistRedisConfig,
} = require('../lib/redis-takeover');
// 门禁纯判定层（redis/PG 两套门禁共用，ADR-0056 下沉）：
// 决策矩阵 / URL 形状解析 / 归属判定 / 空闲端口扫描
const {
  isLocalHost,
  decideRedisGateAction,
  findFreePortUpFrom,
  decidePostgresGateAction,
  parseDatabaseUrlHostPort,
  rewriteDatabaseUrlPort,
  detectPostgresOwnership,
} = require('../lib/infra-gate');

/**
 * 启动基础服务。
 *
 * 托管策略（已理顺，Q0）：基础服务（PG/Redis/协同/配置中心）**统一由 PM2 托管**，
 * 无论应用层是前台 spawn 还是 PM2 后台。这样避免"前台 spawn 的基础服务 + PM2 的基础服务"
 * 双实例冲突，且基础服务不依赖 CLI 父进程存活——前台模式 Ctrl+C 退出时基础服务常驻。
 * - PM2 可用（离线部署包 USE_RUNTIME）：基础服务一律走 PM2，首次 start、已注册 restart（不 delete）
 * - PM2 不可用（纯开发环境）：回退前台 spawn（仅兜底，基础服务随 CLI 退出）
 *
 * @param {boolean} [_usePm2] 已不再决定基础服务托管方式（统一 PM2），仅保留兼容参数。
 *   - 部署机（PM2 可用）：无论传 true/false 都走 PM2（Q0）。
 *   - 纯开发环境（PM2 不可用）：一律前台 spawn 兜底。
 *   true/false 只影响"PM2 不可用时是否允许前台兜底"（false 表示调用方明确要求前台语义，
 *   但若 PM2 可用仍以 PM2 为准，避免双轨漂移）。
 */
async function startInfrastructure(_usePm2 = true) {
  log('blue', '[1/3] 启动基础服务...');

  const pm2Available = !!(PM2_JS && fs.existsSync(PM2_JS) && USE_RUNTIME);

  // #419 升级路径前置门禁：PM2 的 `redis` app 为 online 只说明包装进程存活，
  // 不代表数据实例用了 .env 密码（包装进程见端口已占即采纳现有实例），
  // 故必须在端口扫描 / 短路复用之前独立探测。
  // 'taken-over' 时 redis 端口已释放，下方扫描会自然进入 reconcile 以 --requirepass 重拉；
  // 'configured' 表示本部署无密码实例已在运行中按 .env 设好密码，实例继续运行、数据
  // 不动，reconcile 不把它当"端口被外部进程占用"的冲突，而是把 PM2 包装进程拉起以
  // 采纳该实例；
  // 'relocated' 表示 .env 端口被外部实例（系统 redis 等）占用——外部实例未被触碰，
  // 本部署自带 redis 已切换到空闲端口且 .env 的 REDIS_PORT 已改写（内存 PORTS 同步
  // 更新），下方扫描按新端口进行；reconcile 须强制重注册 PM2 redis 定义（旧 env 的
  // REDIS_PORT 在 pm2 start 时固化，restart 不会刷新）；
  // 'blocked' 表示无法自动修复，中止部署。
  const redisGate = pm2Available ? await ensureRedisPasswordManaged() : 'ok';
  if (redisGate === 'blocked') return false;
  const redisPasswordConfigured = redisGate === 'configured';
  const redisRelocated = redisGate === 'relocated';

  // #425 PG 端口门禁：自带 PG 必须恒由本部署包提供（"始终用本地的"）。
  // .env 端口被外部实例（系统装的 PG 等）占用时不碰外部实例——自带 PG 换到空闲
  // 端口并成对改写 .env（DB_PORT + DATABASE_URL）；被另一部署目录的实例占用时
  // 直接停掉对方、启动本目录的。'relocated' 时内存 PORTS.postgresql 已更新、
  // .env 已改写，下方扫描按新端口进行；reconcile 须强制重注册 PM2 postgresql
  // 定义（旧 env 的 DB_PORT 在 pm2 start 时固化，restart 不会刷新）；
  // 'blocked' 表示无法自动修复，中止部署。
  const pgGate = pm2Available ? await ensurePostgresPortManaged() : 'ok';
  if (pgGate === 'blocked') return false;
  const postgresRelocated = pgGate === 'relocated';

  // 逐服务检测端口 + PM2 托管状态，判定"缺失"与"重复/残留"。
  // 这是 Q1 的核心：端口状态与 PM2 状态必须一致，不一致即视为待清理的重复实例。
  const portOpenMap = {};
  const pm2StatusMap = {};
  for (const appName of INFRA_SERVICE_APPS) {
    const portKey = INFRA_APP_TO_PORT_KEY[appName];
    portOpenMap[appName] = await isPortOpen(PORTS[portKey]);
    pm2StatusMap[appName] = pm2Available ? getPm2AppStatus(appName) : 'unknown';
  }

  const allPortsOpen = INFRA_SERVICE_APPS.every((name) => portOpenMap[name]);
  if (allPortsOpen) {
    // 端口全开，但可能存在"端口被非 PM2 进程占用"或"PM2 服务定义与端口不一致"的残留，
    // 需在部署机场景下校验 PM2 是否真的在托管这些端口。
    if (pm2Available && !areAllInfraOnline(pm2StatusMap)) {
      log(
        'yellow',
        '[警告] 检测到基础服务端口已占用，但本目录 PM2 未在托管（可能是前台残留/另一部署目录的服务/外部进程），尝试理顺 PM2 托管...'
      );
      return reconcileInfrastructureWithPm2(portOpenMap, pm2StatusMap, {
        redisPasswordConfigured,
        redisRelocated,
        postgresRelocated,
      });
    }
    log('green', '[✓] 基础服务已在运行，复用现有实例（不重启）');
    return true;
  }

  if (pm2Available) {
    return reconcileInfrastructureWithPm2(portOpenMap, pm2StatusMap, {
      redisPasswordConfigured,
      redisRelocated,
      postgresRelocated,
    });
  }

  // PM2 不可用：回退前台 spawn（纯开发环境兜底）
  return startInfrastructureForeground({
    pgOpen: portOpenMap['postgresql'],
    redisOpen: portOpenMap['redis'],
    cooperateOpen: portOpenMap['cooperate'],
    configOpen: portOpenMap['config-service'],
  });
}

/**
 * 是否所有基础服务在 PM2 中均处于 online。
 */
function areAllInfraOnline(pm2StatusMap) {
  return INFRA_SERVICE_APPS.every((name) => pm2StatusMap[name] === 'online');
}

/**
 * 把本部署自带 redis 切换到空闲端口并改写 .env（单一事实源）。
 *
 * 触发条件：.env 端口被**外部实例**（系统装的 redis / 其他用户 / 另一部署目录）
 * 占用且无法接管。外部实例完全不被触碰（不停、不改密、不采纳）；本部署自带
 * redis 改到空闲端口。backend（自己 dotenv 读 .env）、redis-manager（env 优先
 * 否则读 .env）、ecosystem（加载时读 .env）、conversion-service（start.js 现场
 * 拼 REDIS_URL）、config-service、verify-deploy 都从同一份 .env 读 REDIS_PORT，
 * 全部自动跟随；内存 PORTS 同步更新，供本进程后续 waitForPort/健康检查/stop 使用。
 *
 * 换端口后不回迁（外部实例消失也不迁回）：.env 即长期事实源，避免端口抖动。
 *
 * @param {string} redisHost .env 的 REDIS_HOST（仅用于日志展示）
 * @returns {Promise<'relocated'|'blocked'>}
 */
async function relocateRedisPort(redisHost) {
  const oldPort = PORTS.redis;
  const newPort = await findFreePortUpFrom(oldPort + 1, {
    maxTries: 100,
    isPortOpen: (p) => isPortOpen(p, '127.0.0.1'),
    exclude: new Set(Object.values(PORTS)),
  });
  if (!newPort) {
    log(
      'red',
      `  [错误] redis 端口 ${oldPort} 被外部实例占用，且 ${oldPort + 1}-${oldPort + 100} 范围内未找到空闲端口，部署中止。请手动释放端口或修改 .env 的 REDIS_PORT 后重跑。`
    );
    return 'blocked';
  }
  const ok = updateEnvFile(BACKEND_ENV_PATH, { REDIS_PORT: String(newPort) });
  if (!ok) {
    log(
      'red',
      `  [错误] 新 redis 端口 ${newPort} 写入 ${BACKEND_ENV_PATH} 失败，部署中止。请手动把 .env 的 REDIS_PORT 改为 ${newPort} 后重跑。`
    );
    return 'blocked';
  }
  PORTS.redis = newPort;
  log(
    'yellow',
    `  [换端口] redis 端口 ${oldPort} 被外部实例占用（如系统安装的 redis，主机 ${redisHost}）——该实例未被停止、未改密、未被采纳`
  );
  log(
    'yellow',
    `  [换端口] 本部署自带 redis 已切换到空闲端口 ${newPort}，.env 的 REDIS_PORT 已自动更新（backend/conversion-service/config-service/verify 均从 .env 读取，自动跟随）`
  );
  return 'relocated';
}

/**
 * 升级路径强制门禁（#419，2026-10 修订）：.env 端口上的 redis 实例必须属于本
 * 部署并接受 .env 的 REDIS_PASSWORD；外部实例（系统 redis 等）一律不碰，改为
 * 本部署自带 redis 自动换端口（见 decideRedisGateAction / relocateRedisPort）。
 *
 * 为什么不复用 reconcile 里"端口开但 PM2 未托管"的分支：PM2 的 `redis` app 为
 * online 只说明 redis-manager 包装进程存活——包装进程见端口已占即采纳现有实例
 * 进入 keepAlive（见 redis-manager main()），实际承载数据的 redis-server 可能仍是
 * 升级前的无密码旧实例。那种情况下 `allPortsOpen + areAllInfraOnline` 会判定"健康
 * 复用"，旧实例永远不被设密，后端 AUTH 恒 NOAUTH。
 *
 * @returns {Promise<'ok'|'configured'|'taken-over'|'relocated'|'blocked'>}
 *   ok         无需再处理：端口未开 / 未配置密码 / 本部署实例密码正确
 *   configured 本部署无密码实例已在运行中按 .env 设好密码（CONFIG SET +
 *              CONFIG REWRITE，未杀进程、数据不动），调用方须把 PM2 的 redis
 *              包装进程拉起以采纳该实例
 *   taken-over 本部署旧实例（密码不一致/未知）已停止并等端口释放，后续流程以
 *              --requirepass 重拉本目录实例
 *   relocated  端口被外部实例占用（未被触碰），本部署自带 redis 已切换到空闲
 *              端口且 .env 的 REDIS_PORT 已改写，调用方须强制重注册 PM2 redis
 *              定义（旧 env 的 REDIS_PORT 在 pm2 start 时固化，restart 不刷新）
 *   blocked    无法自动修复（远程实例 / 探测手段不足无法排除本部署实例 /
 *              本部署实例停止后端口未释放 / 无空闲端口 / .env 写入失败），调用方中止
 */
async function ensureRedisPasswordManaged() {
  const password = loadRedisPassword();
  if (!password) {
    // 部署入口 setupOffline → fillEmptySecrets 本应生成该值；走到这里说明 .env 仍为空。
    // 此时 redis-manager 会以无密码模式拉起实例，后端生产配置校验会拒绝启动。
    log(
      'yellow',
      '  [警告] .env 未配置 REDIS_PASSWORD，跳过 redis 密码校验（将以无密码模式拉起，后端生产配置校验会拒绝启动）...'
    );
    return 'ok';
  }
  const redisHost = loadRedisHost();
  if (!(await isPortOpen(PORTS.redis, redisHost))) return 'ok';

  const { state: probe, reason } = await probeRedisAuth(
    redisHost,
    PORTS.redis,
    password
  );
  const isLocal = isLocalHost(redisHost);
  const owner = isLocal
    ? detectPortOwner(PORTS.redis)
    : { pid: null, fullScanDone: false };
  const ownership = owner.pid ? detectRedisOwnership(owner.pid) : null;

  const action = decideRedisGateAction({
    probeState: probe,
    ownership,
    fullScanDone: owner.fullScanDone,
    isLocal,
  });

  if (action === 'ok') return 'ok';
  if (action === 'relocate') return relocateRedisPort(redisHost);
  if (action === 'blocked') {
    if (!isLocal) {
      log(
        'red',
        `  [错误] 远程 redis（${redisHost}:${PORTS.redis}）不接受 .env 的 REDIS_PASSWORD，无法自动处置远程实例，部署中止。请人工确认该实例，或修改 .env 的 REDIS_HOST/REDIS_PORT 指向本部署可用的端口后重跑。`
      );
    } else if (ownership === null && !owner.fullScanDone) {
      log(
        'red',
        `  [错误] redis 端口 ${PORTS.redis} 被占用，但无法定位其进程（ss/lsof/netstat 均不可用且 /proc 不可读），无法排除是本部署自己的实例，部署中止。请安装 lsof（sudo apt install lsof）或以 root 运行，或用 sudo ss -tlnp | grep ${PORTS.redis} 人工确认占用者后处理再重跑。`
      );
    } else {
      log(
        'red',
        `  [错误] redis 端口 ${PORTS.redis} 的占用进程 (PID ${owner.pid || '未知'}) 归属无法确认（cmdline 不可读），为避免与本部署实例共写同一数据目录，本次不自动处置，部署中止。请人工确认该进程后重跑。`
      );
    }
    return 'blocked';
  }

  // 以下两个分支都只针对本部署实例（ownership === 'ours'）
  if (action === 'fix-ours') {
    // 本部署的无密码实例直接在运行中改密（`CONFIG SET requirepass`）：不需要先
    // AUTH，不杀进程、不动数据、无停机。生效范围是该进程存活期；任何后续重启
    // 都由 redis-manager 以 --requirepass <.env> 拉起（见 redis-manager
    // startRedis），密码不会回退。
    log(
      'yellow',
      `  redis（${redisHost}:${PORTS.redis}）未设密码，正在运行中重置为 .env 的 REDIS_PASSWORD（不停止实例）...`
    );
    const set = await setRedisPasswordAtRuntime(
      redisHost,
      PORTS.redis,
      password
    );
    if (set.ok) {
      const check = await probeRedisAuth(redisHost, PORTS.redis, password);
      if (check.state === 'ok') {
        log(
          'green',
          '  [✓] redis 密码已设为 .env 的 REDIS_PASSWORD（未重启实例，数据不受影响）'
        );
        // 运行期设置只对该进程生效；写回实例自己的配置文件，否则独立托管的
        // 实例重启后会回到无密码，后端 AUTH 立刻 NOAUTH。
        const persist = await persistRedisConfig(
          redisHost,
          PORTS.redis,
          password
        );
        if (persist.ok) {
          log('green', '  [✓] 密码已写回实例配置文件，重启后仍生效');
        } else {
          log(
            'yellow',
            `  [提示] 密码未持久化到配置文件（${persist.reason}）：若该实例由命令行参数启动属正常（每次拉起由 --requirepass 注入）；若由 systemd 独立托管，重启后会回到无密码，下次 start.sh 会自动再设一次`
          );
        }
        return 'configured';
      }
      log(
        'yellow',
        `  [警告] 改密后复核认证状态仍为 ${check.state}，回退到停止旧实例后按 --requirepass 重拉...`
      );
    } else {
      log(
        'yellow',
        `  [警告] 运行中改密失败（${set.reason}），回退到停止旧实例后按 --requirepass 重拉...`
      );
    }
    // 落到下方 takeover-ours 分支
  }

  // takeover-ours：停止本部署旧实例，交 PM2 以 --requirepass 重拉。
  // 实例数据在 data/redis（--dir 隔离），停止进程不删数据（SIGTERM 优雅落盘/
  // taskkill 强杀）。
  const pid = owner.pid;
  const desc =
    probe === 'noauth'
      ? '未设密码'
      : probe === 'unknown'
        ? `认证状态未知（${reason}）`
        : '密码与 .env 不一致';
  log(
    'yellow',
    `  [接管] redis 端口 ${PORTS.redis} 由本部署旧实例占用（PID ${pid}）${desc}，停止并按 .env REDIS_PASSWORD 重新拉起...`
  );
  // 先停 PM2 的 redis 包装进程（若在本机 PM2 中处于托管）：否则其 keepAlive
  // 会在实例被停后 5 秒内重拉旧实例，与下方端口释放等待形成竞态。
  if (getPm2AppStatus('redis') === 'online') {
    runPm2(['stop', 'redis'], { silent: true });
  }
  // taskkill 可能与 PM2 stop 的杀树并发（目标处于"正在终止"时报错），单次
  // 报错不代表失败——以端口最终释放为接管成功的准绳。
  if (!stopRedisProcess(pid)) {
    log(
      'yellow',
      `  [警告] 停止 redis 实例 (PID ${pid}) 的信号未确认成功，以端口释放为准继续等待...`
    );
  }
  // 等端口真正释放：旧实例收到 SIGTERM 需优雅退出并落盘 AOF；若仍处半关闭状态，
  // redis-manager 的 keepAlive 会误判"已在运行"采纳临终实例，反复退出被 PM2 重启。
  const released = await waitPortReleased(PORTS.redis, 15000);
  if (!released) {
    log(
      'red',
      `  [错误] redis 实例 (PID ${pid}) 已发停止信号但端口 ${PORTS.redis} 未释放，部署中止。请手动确认后重跑。`
    );
    return 'blocked';
  }
  log('green', '  [✓] 占用实例已停止，端口已释放，交 PM2 按 .env 密码重新拉起');
  return 'taken-over';
}

// ==================== PostgreSQL 端口门禁（#425） ====================
// 纯判定层（决策矩阵 / URL 形状解析 / 归属判定）在 lib/infra-gate.js，
// 本文件只保留处置动作（换端口改写 .env / 停进程）。

/**
 * 把本部署自带 PG 切换到空闲端口并成对改写 .env（单一事实源）。
 *
 * 触发条件：.env 端口被**外部实例**（系统装的 PG / 其他用户）占用。外部实例
 * 完全不被触碰（不停、不改密、不采纳）；本部署自带 PG 改到空闲端口。
 * DB_PORT 与 DATABASE_URL 必须**成对**改写（Prisma 优先用 DATABASE_URL，只改
 * DB_PORT 会让后端/迁移仍连旧端口的系统库）；pg-manager、db-backup、预检、
 * backend、verify-deploy 都从同一份 .env 读，全部自动跟随；内存 PORTS 同步
 * 更新，供本进程后续 waitForPort/健康检查/stop 使用。
 *
 * 换端口后不回迁（外部实例消失也不迁回）：.env 即长期事实源，避免端口抖动。
 *
 * @param {string} dbHost .env 的 DB_HOST（仅用于日志展示）
 * @returns {Promise<'relocated'|'blocked'>}
 */
async function relocatePostgresPort(dbHost) {
  const oldPort = PORTS.postgresql;
  const newPort = await findFreePortUpFrom(oldPort + 1, {
    maxTries: 100,
    isPortOpen: (p) => isPortOpen(p, '127.0.0.1'),
    exclude: new Set(Object.values(PORTS)),
  });
  if (!newPort) {
    log(
      'red',
      `  [错误] PG 端口 ${oldPort} 被外部实例占用，且 ${oldPort + 1}-${oldPort + 100} 范围内未找到空闲端口，部署中止。请手动释放端口或修改 .env 的 DB_PORT（连同 DATABASE_URL 的端口）后重跑。`
    );
    return 'blocked';
  }

  let envConfig = {};
  try {
    envConfig = parseEnvFile(BACKEND_ENV_PATH);
  } catch {
    /* .env 不可读时仅改写 DB_PORT */
  }
  const updates = { DB_PORT: String(newPort) };
  if (envConfig.DATABASE_URL) {
    const newUrl = rewriteDatabaseUrlPort(
      envConfig.DATABASE_URL,
      oldPort,
      newPort
    );
    if (!newUrl) {
      log(
        'red',
        `  [错误] .env 的 DATABASE_URL 形状无法识别，或其端口与 DB_PORT（${oldPort}）不一致，无法安全改写端口，部署中止。请人工把 DATABASE_URL 的端口改为 ${newPort}（与 DB_PORT 保持一致）后重跑。`
      );
      return 'blocked';
    }
    updates.DATABASE_URL = newUrl;
  }

  const ok = updateEnvFile(BACKEND_ENV_PATH, updates);
  if (!ok) {
    log(
      'red',
      `  [错误] 新 PG 端口 ${newPort} 写入 ${BACKEND_ENV_PATH} 失败，部署中止。请手动把 .env 的 DB_PORT（连同 DATABASE_URL 的端口）改为 ${newPort} 后重跑。`
    );
    return 'blocked';
  }
  PORTS.postgresql = newPort;

  // 刷新首次部署凭据备份（其中记录了数据库端口；用户已删除该文件则不重建）
  try {
    if (fs.existsSync(credentialFilePath())) {
      saveCredentialBackup(
        { ...updates, DB_PASSWORD: envConfig.DB_PASSWORD || '' },
        parseEnvFile(BACKEND_ENV_PATH)
      );
    }
  } catch {
    /* 凭据备份失败不影响部署 */
  }

  log(
    'yellow',
    `  [换端口] PG 端口 ${oldPort} 被外部实例占用（如系统安装的 PostgreSQL，主机 ${dbHost}）——该实例未被停止、未改密、未被采纳`
  );
  log(
    'yellow',
    `  [换端口] 本部署自带 PostgreSQL 已切换到空闲端口 ${newPort}，.env 的 DB_PORT 与 DATABASE_URL 已成对自动更新（pg-manager/backend/迁移/verify 均从 .env 读取，自动跟随）`
  );
  return 'relocated';
}

/**
 * DATABASE_URL ↔ DB_PORT 一致性修复（单一出口，PG 门禁前置步骤）。
 *
 * DB_PORT 是端口的单一事实源（pg-manager / pg_dump / 建库 / 预检都读它），
 * DATABASE_URL 是 Prisma（migrate deploy / 后端）的最高优先连接源。两者漂移
 * （只手动改了 DB_PORT 绕开系统 PG、或旧包门禁只改过 DB_PORT）→ pg_dump 在
 * 新端口成功、Prisma 连旧端口的系统库 → P1000（用户 VM 实锤：DB_PORT=5433、
 * URL 仍 5432，备份成功但迁移失败）。
 *
 * 修复规则（仅 DB_HOST 指向本机时执行）：
 * - DATABASE_URL 缺失 → ok（Prisma CLI / 后端都回落 DB_* 部件，跟随 DB_PORT）；
 * - URL 形状无法识别 → blocked（不得猜测）；
 * - URL 主机与 DB_HOST 指向不同机器（且非 localhost/127.0.0.1/::1 等价形态）
 *   → blocked（真实冲突：连哪个库须人工裁定）；
 * - URL 端口 ≠ DB_PORT → 只改写 URL 端口段（其余字节逐字保留）→ repaired；
 * - 已一致 → ok。
 *
 * @returns {Promise<'ok'|'repaired'|'blocked'>}
 */
async function repairDatabaseUrlConsistency() {
  let envConfig;
  try {
    envConfig = parseEnvFile(BACKEND_ENV_PATH);
  } catch {
    return 'ok';
  }
  const url = envConfig.DATABASE_URL;
  if (!url) return 'ok';

  const parsed = parseDatabaseUrlHostPort(url);
  if (!parsed) {
    log(
      'red',
      `  [错误] .env 的 DATABASE_URL 形状无法识别（${url}），无法确认其指向的数据库，部署中止。请人工修正后重跑。`
    );
    return 'blocked';
  }

  const dbHost = envConfig.DB_HOST || 'localhost';
  // 主机冲突判定：不同名且非"双方都是本机形态"（localhost/127.0.0.1/::1 等价）
  const bothLocal = isLocalHost(dbHost) && isLocalHost(parsed.host);
  if (dbHost !== parsed.host && !bothLocal) {
    log(
      'red',
      `  [错误] .env 的 DATABASE_URL 指向主机 ${parsed.host}，与 DB_HOST（${dbHost}）指向不同的数据库，部署中止。请人工确认应连接哪个数据库、保持两者一致后重跑。`
    );
    return 'blocked';
  }

  const dbPort = Number(envConfig.DB_PORT || 5432);
  if (parsed.port === dbPort) return 'ok';

  const aligned = `${parsed.prefix}:${dbPort}${parsed.rest}`;
  const ok = updateEnvFile(BACKEND_ENV_PATH, { DATABASE_URL: aligned });
  if (!ok) {
    log(
      'red',
      `  [错误] DATABASE_URL 端口对齐写入 ${BACKEND_ENV_PATH} 失败，部署中止。请手动把 DATABASE_URL 的端口改为 ${dbPort}（与 DB_PORT 一致）后重跑。`
    );
    return 'blocked';
  }
  log(
    'yellow',
    `  [修复] DATABASE_URL 端口（${parsed.port}）与 DB_PORT（${dbPort}）不一致，已自动对齐为 ${aligned}（Prisma 优先用 DATABASE_URL，漂移会让迁移连到旧端口的库）`
  );
  return 'repaired';
}

/**
 * 停止另一部署目录的 PostgreSQL（PG 门禁"直接停掉"的动作）。
 *
 * 1) 优先经对方目录的 PM2 停止：只杀 postgres 进程的话，对方 pg-manager 的
 *    keepAlive 会在 5 秒内把它重拉、再次占住端口，与下方端口释放等待形成竞态；
 *    `pm2 stop` 标记 stopped 不触发自动重启。对方根目录从可执行文件路径推导
 *    （exe 位于 <对方根>/runtime/<platform>/ 下，PM2_HOME = <对方根>/data/pm2，
 *    与 context.js 的 DATA_DIR/data/pm2 约定一致）。
 * 2) 回退（对方 PM2 daemon 未运行 / 停止失败）：直接向 postmaster 发信号——
 *    Linux 用 SIGINT（= pg_ctl -m fast，崩溃安全停机、WAL 安全落盘）；Windows
 *    用 taskkill。不用 killTree 的进程组信号：postgres 由 pg_ctl 直接 spawn，
 *    不属于对方 PM2 的进程组，`process.kill(-pid)` 会 ESRCH 被误判"成功"而实际
 *    未杀掉（与 redis-takeover 同一教训）。
 *
 * @param {number|null} pid
 * @returns {boolean} 是否已发出停止信号（调用方以端口最终释放为准绳）
 */
function stopForeignPostgres(pid) {
  if (!pid) return false;
  const exe = getProcessExecutablePath(pid);
  const normalized = (exe || '').toLowerCase().replace(/\\/g, '/');
  const runtimeIdx = normalized.indexOf('/runtime/');
  if (exe && runtimeIdx > 0 && PM2_JS && fs.existsSync(PM2_JS)) {
    const foreignRoot = exe.slice(0, runtimeIdx);
    const foreignPm2Home = path.join(foreignRoot, 'data', 'pm2');
    if (fs.existsSync(foreignPm2Home)) {
      const nodeDir = path.dirname(NODE_EXE);
      const existingPath = process.env.PATH || '';
      const res = spawnSync(NODE_EXE, [PM2_JS, 'stop', 'postgresql'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30000,
        env: {
          ...process.env,
          PM2_HOME: foreignPm2Home,
          PATH: IS_WINDOWS
            ? `${nodeDir};${existingPath}`
            : `${nodeDir}:${existingPath}`,
        },
      });
      if (res.status === 0) {
        log(
          `  [✓] 已通过对方目录 PM2 停止 PostgreSQL（PM2_HOME: ${foreignPm2Home}）`
        );
        return true;
      }
      log(
        'yellow',
        `  [警告] 对方目录 PM2 停止失败（退出码 ${res.status}），回退为直接向 postmaster 发信号...`
      );
    }
  }
  try {
    if (IS_WINDOWS) {
      const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'pipe',
        windowsHide: true,
      });
      // 退出码：0=成功终止；128=目标不存在（已退出，视为已停止）
      return result.status === 0 || result.status === 128;
    }
    process.kill(pid, 'SIGINT');
    return true;
  } catch (err) {
    // ESRCH = 进程已不存在，视为已停止；其余（EPERM 等）为真实失败
    return err.code === 'ESRCH';
  }
}

/**
 * PG 端口门禁（#425）：.env 端口上的 PostgreSQL 必须属于本部署包。
 *
 * 为什么需要独立门禁（不能靠 reconcile 的"端口被占用"分支兜底）：reconcile 对
 * "端口开但 PM2 未托管"只告警跳过，部署继续走到迁移步骤时，pg_dump/prisma 拿
 * 本部署的密码连 .env 端口上的外部实例（系统 PG 等），认证恒失败，"是否继续
 * 部署？"的提示成了假选择（同一套凭据下迁移必败）。门禁在端口扫描之前运行：
 * 外部实例占着 .env 端口 → 自带 PG 换端口并改写 .env；另一部署目录的实例占着
 * → 直接停掉、启动本目录的。此后扫描/迁移/健康检查全部针对本部署自己的实例。
 *
 * @param {{stopForeign?: (pid: number) => boolean}} [deps] 注入用（测试）
 * @returns {Promise<'ok'|'relocated'|'stopped-foreign'|'blocked'>}
 *   ok              无需处理：端口未开 / 远程 DB_HOST（自带 PG 不服务远程库）/
 *                   本部署实例已在运行
 *   relocated       端口被外部实例占用（未被触碰），自带 PG 已切换到空闲端口且
 *                   .env 的 DB_PORT/DATABASE_URL 已成对改写，调用方须强制重注册
 *                   PM2 postgresql 定义（旧 env 的 DB_PORT 在 pm2 start 时固化，
 *                   restart 不会刷新）
 *   stopped-foreign 端口被另一部署目录的实例占用，已停止并等端口释放，后续流程
 *                   在原端口启动本目录实例
 *   blocked         无法自动修复（手段不足无法排除本部署实例 / 停止失败 / 端口
 *                   未释放 / 无空闲端口 / .env 写入失败 / DATABASE_URL 形状不一致
 *                   / DATABASE_URL 主机与 DB_HOST 冲突），调用方中止
 */
async function ensurePostgresPortManaged(deps = {}) {
  const stopForeign = deps.stopForeign || stopForeignPostgres;

  if (!fs.existsSync(BACKEND_ENV_PATH)) return 'ok';
  let envConfig;
  try {
    envConfig = parseEnvFile(BACKEND_ENV_PATH);
  } catch {
    return 'ok';
  }
  const dbHost = envConfig.DB_HOST || 'localhost';
  if (!isLocalHost(dbHost)) return 'ok';

  // DATABASE_URL 一致性修复（所有本机场景都执行，含"端口空闲"提前返回路径）：
  // DB_PORT 是端口单一事实源、Prisma 优先用 DATABASE_URL——两者漂移时
  // pg_dump 在新端口成功、migrate deploy 连旧端口的系统库报 P1000
  const urlRepair = await repairDatabaseUrlConsistency();
  if (urlRepair === 'blocked') return 'blocked';

  if (!(await isPortOpen(PORTS.postgresql, dbHost))) return 'ok';

  const owner = detectPortOwner(PORTS.postgresql);
  const ownership = owner.pid ? detectPostgresOwnership(owner.pid) : null;

  const action = decidePostgresGateAction({
    ownership,
    fullScanDone: owner.fullScanDone,
    isLocal: true,
  });

  if (action === 'ok') return 'ok';
  if (action === 'relocate') return relocatePostgresPort(dbHost);

  if (action === 'stop-foreign') {
    const pid = owner.pid;
    const exe = getProcessExecutablePath(pid) || '未知路径';
    log(
      'yellow',
      `  [停止] PG 端口 ${PORTS.postgresql} 被另一部署目录的服务占用 (PID ${pid}): ${exe}——直接停止并启动本目录的 PostgreSQL...`
    );
    if (!stopForeign(pid)) {
      log(
        'red',
        `  [错误] 停止另一部署目录的 PostgreSQL (PID ${pid}) 失败，部署中止。请手动停止该实例后重跑。`
      );
      return 'blocked';
    }
    const released = await waitPortReleased(PORTS.postgresql, 15000);
    if (!released) {
      log(
        'red',
        `  [错误] 已发停止信号但另一部署目录的 PostgreSQL (PID ${pid}) 未释放端口 ${PORTS.postgresql}，部署中止。请手动确认后重跑。`
      );
      return 'blocked';
    }
    log(
      'green',
      `  [✓] 另一部署目录的 PostgreSQL 已停止，端口已释放，本目录实例将接管端口 ${PORTS.postgresql}`
    );
    return 'stopped-foreign';
  }

  // blocked：给出可执行的排查指引
  if (ownership === null && !owner.fullScanDone) {
    log(
      'red',
      `  [错误] PG 端口 ${PORTS.postgresql} 被占用，但无法定位其进程（ss/lsof/netstat 均不可用且 /proc 不可读），无法排除是本部署自己的实例，部署中止。请安装 lsof（sudo apt install lsof）或以 root 运行，或用 sudo ss -tlnp | grep ${PORTS.postgresql} 人工确认占用者后处理再重跑。`
    );
  } else {
    log(
      'red',
      `  [错误] PG 端口 ${PORTS.postgresql} 的占用进程 (PID ${owner.pid || '未知'}) 归属无法确认（可执行文件不可读），为避免与本部署实例共写同一数据目录，本次不自动处置，部署中止。请人工确认该进程后重跑。`
    );
  }
  return 'blocked';
}

/**
 * 端口被**另一部署目录**的 cloudcad 服务占用时的用户询问。
 *
 * 不同部署目录是相互独立的项目（各自 .env 密钥/数据目录），静默接管对方服务
 * 会导致本目录密钥与对方存量数据错位（PII 回填校验拦截部署），故必须询问：
 * 停止对方服务、起本目录自己的，还是中止部署。
 * 非交互环境（非 TTY，如 CI/无人值守）不询问、默认中止——无人值守下
 * 静默停掉另一个项目的服务风险不可接受。
 * @returns {Promise<boolean>} true=用户确认停止对方服务
 */
function askForeignServiceStop(appName, port, pid) {
  if (!process.stdin.isTTY) {
    return Promise.resolve(false);
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(
      `  [?] ${appName} 端口 ${port} 被另一部署目录的服务占用 (PID ${pid})。停止该服务并启动本目录的？[y/N]: `,
      (ans) => {
        rl.close();
        resolve(/^y(es)?$/i.test((ans || '').trim()));
      }
    );
  });
}

/**
 * 停止另一部署目录的基础服务（用户确认后的停止动作）。
 *
 * 直接 killTree 杀进程会被对方 PM2（autorestart: true）立即拉起，端口再次
 * 被占；须通过对方目录的 PM2_HOME 执行 `pm2 stop <app>`（PM2 标记 stopped，
 * 不触发自动重启）。对方根目录从可执行文件路径推导（exe 位于
 * <对方根>/runtime/<platform>/ 下，PM2_HOME = <对方根>/data/pm2，与
 * context.js 的 DATA_DIR/data/pm2 约定一致）。
 * 对方 PM2 daemon 未运行（命令非 0 退出）时回退 killTree——daemon 不在则
 * 无人拉起，直接杀进程树安全。
 * @returns {boolean} 是否成功停止
 */
function stopForeignService(appName, pid) {
  const exe = getProcessExecutablePath(pid);
  const normalized = (exe || '').toLowerCase().replace(/\\/g, '/');
  const runtimeIdx = normalized.indexOf('/runtime/');
  if (exe && runtimeIdx > 0 && PM2_JS && fs.existsSync(PM2_JS)) {
    const foreignRoot = exe.slice(0, runtimeIdx);
    const foreignPm2Home = path.join(foreignRoot, 'data', 'pm2');
    if (fs.existsSync(foreignPm2Home)) {
      const nodeDir = path.dirname(NODE_EXE);
      const existingPath = process.env.PATH || '';
      const res = spawnSync(NODE_EXE, [PM2_JS, 'stop', appName], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30000,
        env: {
          ...process.env,
          PM2_HOME: foreignPm2Home,
          PATH: IS_WINDOWS
            ? `${nodeDir};${existingPath}`
            : `${nodeDir}:${existingPath}`,
        },
      });
      if (res.status === 0) {
        log(
          `  [✓] 已通过对方目录 PM2 停止 ${appName}（PM2_HOME: ${foreignPm2Home}）`
        );
        return true;
      }
      log(
        'yellow',
        `  [警告] 对方目录 PM2 停止失败（退出码 ${res.status}），回退为直接终止进程树...`
      );
    }
  }
  return killTree(pid, { silent: false });
}

/**
 * 用 PM2 理顺基础服务托管（Q1）：
 * 1. 对"端口未开"的服务 → 若 PM2 已注册（stopped/errored/launching）则 restart，否则 start；
 * 2. 对"端口被本目录 PM2 未托管的进程占用"的服务，按占用者归属分类：
 *    - 另一部署目录的 cloudcad 服务（exe 在另一目录 runtime/ 下）：静默接管会导致
 *      本目录 .env 密钥与对方存量数据错位（PII 回填校验拦截部署），须询问用户
 *      "停止对方服务起自己的"（经对方 PM2_HOME 停止，防 autorestart 竞态）或中止部署；
 *    - 本目录残留（本 runtime 进程 / node 进程）：先按 PID 清掉（避免双实例）再交 PM2 启动；
 *    - 外部系统服务（系统自带 PG/Redis）：告警跳过，不误杀。
 *
 * @param {object} [opts]
 * @param {boolean} [opts.redisPasswordConfigured] 前置门禁确认本部署无密码实例已
 *   在运行中按 .env 设好密码（CONFIG SET + CONFIG REWRITE）。此时数据实例不动，
 *   但不报"端口被外部进程占用，未接管"的冲突告警，而是把 PM2 的 redis 包装进程
 *   拉起/重启以纳入托管——包装进程采纳现有实例，不会重启数据实例。
 * @param {boolean} [opts.redisRelocated] 前置门禁已把本部署 redis 换到空闲端口
 *   （.env 的 REDIS_PORT 已改写）。PM2 中若已注册过 redis app，其 env.REDIS_PORT
 *   是上次 pm2 start 时固化的旧值（restart 不会刷新），必须 delete 后重新 start
 *   让 ecosystem 重新加载 .env，否则 redis-manager 会按旧 env 拉回旧端口。
 * @param {boolean} [opts.postgresRelocated] 前置 PG 门禁已把本部署 PostgreSQL 换到
 *   空闲端口（.env 的 DB_PORT/DATABASE_URL 已成对改写）。同 redisRelocated：旧注册
 *   条目的 env.DB_PORT 是上次 pm2 start 时固化的旧值，必须 delete 后重新 start，
 *   否则 pg-manager 会按旧 env 拉回旧端口（旧端口仍被外部实例占用 → 冲突复现）。
 */
/**
 * 判断 PM2 app 的注册信息（pm_cwd）是否属于本部署目录。
 *
 * Windows 上 PM2 daemon 全机唯一（命名管道寻址，PM2_HOME 只决定文件位置），
 * 多个部署目录共写同一份 app 注册表：先注册者恒赢，后 start 的目录对同名 app
 * 发 `pm2 restart` 跑的还是别家脚本（别家 .env/数据目录）——redis 的表现为
 * "start 成功、PM2 online，但本目录后端 AUTH 恒失败"。
 * @param {{pm2_env?: {pm_cwd?: string, cwd?: string}}} entry pm2 jlist 单项
 * @returns {boolean} true=属于本目录（或无法判定，按本目录处理维持现行为）
 */
function isPm2AppFromThisProject(entry) {
  const cwd =
    entry && entry.pm2_env && (entry.pm2_env.pm_cwd || entry.pm2_env.cwd);
  if (!cwd) return true;
  const norm = (p) => String(p).toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
  const root = norm(PROJECT_ROOT);
  const c = norm(cwd);
  if (c === root) return true;
  if (!c.startsWith(`${root}/`)) return false;
  // cwd 在本仓库内：部署包解包进仓库（release/...）时其目录是本仓库的前缀，
  // 但它是独立部署目录（pack-offline 写入 .deploy 标记，开发仓库没有）。
  // 纯前缀匹配会误判为本项目 → reconcile 对别家定义发 restart，跑别家脚本
  // （别家 .env 密码/数据目录），本目录后端 AUTH 恒失败。
  return !fs.existsSync(path.join(String(cwd), '.deploy'));
}

async function reconcileInfrastructureWithPm2(
  portOpenMap,
  pm2StatusMap,
  {
    redisPasswordConfigured = false,
    redisRelocated = false,
    postgresRelocated = false,
  } = {}
) {
  const ecosystemPath = path.join(RUNTIME_DIR, 'ecosystem.config.js');
  const pm2Entries = getPm2StatusList();
  const onlineApps = new Set(
    pm2Entries
      .filter((a) => a.pm2_env && a.pm2_env.status === 'online')
      .map((a) => a.name)
  );

  const toStart = []; // 未注册 → pm2 start
  const toRestart = []; // 已注册但未运行 → pm2 restart
  const conflicts = []; // 端口被非 node 外部进程占用，跳过

  for (const appName of INFRA_SERVICE_APPS) {
    const portKey = INFRA_APP_TO_PORT_KEY[appName];
    const portOpen = portOpenMap[appName];
    const pm2Entry = pm2Entries.find((a) => a.name === appName);
    // PM2 定义属于另一部署目录。Windows 上 PM2 daemon 全机唯一、PM2_HOME 只决定
    // 文件位置：先注册者恒赢，后 start 的目录若对同名 app 发 restart，跑的还是
    // 别家脚本（别家 .env 密钥 / 别家数据目录）——本目录的库连接或 REDIS AUTH
    // 必然错配，且从输出上看不出差别。
    // redis 另有密码门禁授权强制接管；其余服务不能静默沿用——那等于拿别人的库
    // 当自己的库，数据错配的后果由本目录用户承担。
    const foreignApp = !!pm2Entry && !isPm2AppFromThisProject(pm2Entry);
    if (foreignApp) {
      log(
        'yellow',
        `  [提示] PM2 中 ${appName} 的注册信息来自另一部署目录（${pm2Entry.pm2_env.pm_cwd}），将用本目录配置重新注册`
      );
    }

    if (portOpen && onlineApps.has(appName)) {
      if (foreignApp && appName === 'redis') {
        // redis 定义属于另一部署目录：restart 跑的是别家 redis-manager（别家
        // .env 密码/别家数据目录），本目录后端 AUTH 必失败。删除别家定义、
        // 停掉其 redis-server（数据按 --dir 隔离，不删数据），用本目录定义重拉。
        // 这里用 stopRedisProcess 而非 killTree：pm2 delete 只杀 node 包装进程，
        // Windows 上信号处理器不执行，redis-server 会成孤儿；SHUTDOWN SAVE 是
        // 优雅停机（落盘 AOF），killTree 是硬杀（可能截断 AOF）。
        log(
          'yellow',
          `  [接管] PM2 中的 redis 定义属于另一部署目录（${pm2Entry.pm2_env.pm_cwd}），删除并用本目录配置重拉...`
        );
        runPm2(['delete', appName], { silent: true });
        const pid = getPidByPort(PORTS[portKey]);
        if (pid) {
          stopRedisProcess(pid);
          for (let i = 0; i < 10 && (await isPortOpen(PORTS.redis)); i++) {
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        }
        toStart.push(appName);
        continue;
      }
      if (foreignApp) {
        // 非 redis 的服务：端口上的实例是**另一部署目录的项目**在提供（PM2 online
        // 说明其包装进程在跑，即它启动了自身数据目录的库）。静默沿用等于拿别人的
        // 库当自己的库、本目录 .env 密钥与之错位，且输出上看不出差别，故必须显式
        // 中止而非接管。杀对方的库属于对方项目的停机，须由人决定，本流程不做自动
        // 接管（redis 例外：密码门禁已授权让位，且 redis 数据按 --dir 隔离）。
        log(
          'red',
          `  [错误] ${appName} 端口 ${PORTS[portKey]} 上的实例由另一部署目录（${pm2Entry.pm2_env.pm_cwd}）提供，本次不接管（不会误删/误改对方的库）`
        );
        log(
          'cyan',
          '  继续方式：先在另一部署目录停止该服务后重跑；或修改本目录 .env 的端口配置避开冲突。'
        );
        return false;
      }
      // 端口开 + PM2 online：健康，复用
      continue;
    }

    if (portOpen && !onlineApps.has(appName)) {
      // 端口开但 PM2 未托管：存在占用者。按归属判定处理方式：
      // - 另一部署目录的 cloudcad 服务（exe 在另一目录 runtime/ 下）：
      //   静默接管会使本目录 .env 密钥与对方存量数据错位（PII 回填校验拦截部署），
      //   须询问用户：停止对方服务起自己的，或中止部署
      // - 本部署包 runtime 进程 / node 进程（本目录）：PM2 崩溃或前台 spawn 残留 → 清理
      // - 外部系统服务（系统自带 PG/Redis）：不误杀，跳过告警
      const pid = getPidByPort(PORTS[portKey]);
      if (pid && isForeignCloudCadRuntimeProcess(pid)) {
        const exe = getProcessExecutablePath(pid) || '未知路径';
        log(
          'yellow',
          `  [冲突] ${appName} 端口 ${PORTS[portKey]} 被另一部署目录的服务占用 (PID ${pid}): ${exe}`
        );
        const stopForeign = await askForeignServiceStop(
          appName,
          PORTS[portKey],
          pid
        );
        if (stopForeign) {
          log(
            'yellow',
            `  [清理] 正在按用户确认停止另一部署目录的 ${appName} 服务 (PID ${pid})...`
          );
          if (!stopForeignService(appName, pid)) {
            log(
              'red',
              `  [错误] 停止另一部署目录的 ${appName} 服务失败，部署中止。请在该目录手动执行 stop 后重跑。`
            );
            return false;
          }
          // 停止后直接交给 PM2 启动（start 幂等，若仍占用会失败）
          toStart.push(appName);
        } else {
          log(
            'red',
            `  [错误] ${appName} 端口 ${PORTS[portKey]} 被另一部署目录的服务占用且未停止——端口冲突，当前项目无法启动，部署中止。`
          );
          log(
            'cyan',
            '  继续方式：停止另一部署目录的服务（在该目录执行 stop），或修改本目录 .env 的端口配置避开冲突后重跑。'
          );
          return false;
        }
        continue;
      }
      if (pid && (isNodePid(pid) || isOurRuntimeProcess(pid))) {
        const kind = isNodePid(pid) ? 'node 进程' : '本部署包残留进程';
        log(
          'yellow',
          `  [清理] 检测到 ${appName} 端口 ${PORTS[portKey]} 被残留${kind}占用 (PID ${pid})，先清理再交 PM2 托管...`
        );
        killTree(pid, { silent: false });
        // 清理后需重查端口，但此处直接交给 PM2 启动（start 幂等，若仍占用会失败）
        toStart.push(appName);
      } else if (appName === 'redis') {
        // 前置门禁已运行中设好密码（本部署实例）：密码正确、实例不动（不杀进程、
        // 数据不受影响），只需把 PM2 的 redis 包装进程拉起纳入托管。包装进程见端口
        // 已占即采纳现有实例进入 keepAlive，因此不会重启/替换该实例——这是全套
        // 基础服务统一 PM2 托管的既定形态（否则 pm2 status 恒显示 stopped，运维侧
        // 无法判断状态）。
        if (redisPasswordConfigured) {
          log(
            'cyan',
            `  [提示] redis 端口 ${PORTS.redis} 由本部署实例提供（PID ${pid || '未知'}），密码与 .env 一致；拉起 PM2 包装进程采纳该实例（不重启实例）...`
          );
          // 已注册（可能处于 stopped）走 restart，未注册走 start——与下方"端口未开"
          // 分支的判定一致；对未注册 app 发 restart 会直接报错并中止部署。
          // 定义属于另一部署目录时同样删除重注册（restart 会跑别家脚本）。
          if (foreignApp) {
            runPm2(['delete', appName], { silent: true });
            toStart.push(appName);
          } else if (getPm2AppStatus(appName) === 'unknown') {
            toStart.push(appName);
          } else {
            toRestart.push(appName);
          }
        } else if (detectRedisOwnership(pid) === 'ours') {
          // 端口被非 PM2 托管进程占用：不误杀。redis 额外做归属确认（升级路径 #419）：
          // 占用实例 cmdline 含本部署 data/redis 目录 → 本部署旧实例（可能无密码/
          // 密码不一致，且不在 PM2 托管内）→ 停掉并交 PM2 重启（redis-manager 按
          // .env REDIS_PASSWORD 以 --requirepass 拉起，密码持久化 + 纳入托管）；
          // 非本部署实例 / 归属未知 → 不触碰，落入下方冲突告警。
          log(
            'yellow',
            `  [清理] redis 端口 ${PORTS.redis} 被本部署旧无托管实例占用 (PID ${pid})，停止并交 PM2 重启（按 .env REDIS_PASSWORD 设密）...`
          );
          if (!stopRedisProcess(pid)) {
            log(
              'red',
              `  [错误] 停止旧 redis 实例 (PID ${pid}) 失败，落入冲突告警`
            );
            conflicts.push(`${appName}(${PORTS[portKey]})`);
          } else {
            // 等端口释放（redis 收到 SIGTERM 优雅退出、落盘 AOF，通常 1 秒内），
            // 避免新 redis-manager 误判旧实例"已在运行"进入 keepAlive
            for (let i = 0; i < 10 && (await isPortOpen(PORTS.redis)); i++) {
              await new Promise((resolve) => setTimeout(resolve, 300));
            }
            if (foreignApp) {
              // 定义属于另一部署目录：删除重注册，否则 PM2 拉起的还是别家脚本
              runPm2(['delete', appName], { silent: true });
            }
            toStart.push('redis');
          }
        } else {
          conflicts.push(`${appName}(${PORTS[portKey]})`);
        }
      } else {
        // 外部进程占用（如系统自带 PG）：不误杀，跳过并告警
        conflicts.push(`${appName}(${PORTS[portKey]})`);
      }
      continue;
    }

    // 端口未开：若 PM2 已注册但停止 → restart；否则 start。
    // 定义属于另一部署目录时必须删除重注册——对已注册的 app 发 restart 跑的是
    // 先注册的别家脚本（别家 .env 密钥 / 别家数据目录），本目录配置完全不生效。
    // 此处端口空闲，删除只影响注册表条目，不涉及任何运行中的进程，也不碰对方的库。
    if (getPm2AppStatus(appName) === 'unknown') {
      toStart.push(appName);
    } else if (appName === 'redis' && redisRelocated) {
      // 前置门禁已换端口并改写 .env：旧注册条目的 env.REDIS_PORT 是上次
      // pm2 start 时固化的旧值，restart 会按旧 env 把 redis-manager 拉回旧端口
      // （旧端口仍被外部实例占用 → 冲突复现）。删除后重新 start，ecosystem
      // 重新加载 .env 拿到新端口。
      log(
        'yellow',
        `  [接管] redis 已自动换到新端口，用本目录配置重新注册 PM2 redis 定义（旧注册的 env 仍是旧端口）...`
      );
      runPm2(['delete', appName], { silent: true });
      toStart.push(appName);
    } else if (appName === 'postgresql' && postgresRelocated) {
      // 前置 PG 门禁已换端口并成对改写 .env（DB_PORT + DATABASE_URL）：旧注册
      // 条目的 env.DB_PORT 是上次 pm2 start 时固化的旧值，restart 会按旧 env 把
      // pg-manager 拉回旧端口（旧端口仍被外部实例占用 → 冲突复现）。删除后重新
      // start，ecosystem 重新加载 .env 拿到新端口。
      log(
        'yellow',
        `  [接管] PostgreSQL 已自动换到新端口，用本目录配置重新注册 PM2 postgresql 定义（旧注册的 env 仍是旧端口）...`
      );
      runPm2(['delete', appName], { silent: true });
      toStart.push(appName);
    } else if (foreignApp) {
      log(
        'yellow',
        `  [接管] PM2 中的 ${appName} 定义属于另一部署目录（端口空闲），删除并用本目录配置重新注册...`
      );
      runPm2(['delete', appName], { silent: true });
      toStart.push(appName);
    } else {
      toRestart.push(appName);
    }
  }

  if (conflicts.length > 0) {
    log(
      'yellow',
      `  [跳过] 以下基础服务端口被外部进程占用，未接管：${conflicts.join(', ')}`
    );
  }

  if (toStart.length > 0) {
    if (!runPm2(['start', ecosystemPath, '--only', toStart.join(',')])) {
      log('red', '[错误] 基础服务启动失败');
      return false;
    }
    log('green', `[✓] 基础服务已启动（PM2）: ${toStart.join(', ')}`);
  }

  if (toRestart.length > 0) {
    if (!runPm2(['restart', ...toRestart])) {
      log('red', '[错误] 基础服务重启失败');
      return false;
    }
    log('green', `[✓] 基础服务已重启（PM2）: ${toRestart.join(', ')}`);
  }

  // 保存 PM2 进程列表（持久化，供 pm2 resurrect / 开机自启恢复）
  runPm2(['save'], { silent: true });

  return true;
}

/**
 * 配置 PM2 开机自启（pm2 save + 平台原生的登录自启）。
 *
 * 平台能力（已核实，PM2 5.4.3）：
 * - Linux：`pm2 startup systemd` 原生支持，直接生成并注册 systemd 服务（需 root / sudo）。
 *   注意必须用内嵌 PM2（node PM2_JS startup ...），不能用系统 PATH 的 `pm2`——
 *   离线部署包的系统 PATH 没有 pm2，用 execSync('pm2') 必然失败导致误报"需安装"。
 * - Windows：PM2 原生 `pm2 startup` **不支持**（detectInitSystem 只识别 Unix 的
 *   systemctl/launchctl 等，Windows 上直接抛 "Init system not found"）。
 *   但 Windows 自启本质是"登录时执行 pm2 resurrect"。用 Windows **自带的任务计划程序
 *   （schtasks）**即可实现，**无需任何第三方包**（pm2-windows-startup 底层就是封装计划任务）。
 *
 * 静默语义：开机自启是**尽力而为**的附加能力，即使未配置成功也不影响部署本身，
 * 因此本函数全程不输出任何提示（成功/失败均静默），失败时静默返回 false，不抛错。
 *
 * @returns {Promise<boolean>} 是否已配置（结果仅供调用方内部参考，不面向用户展示）
 */
async function setupPm2Startup() {
  const { IS_WINDOWS: isWin } = require('../lib/context');

  // 先保存当前进程列表（pm2 resurrect 恢复的基础）
  runPm2(['save'], { silent: true });

  if (!isWin) {
    // 用内嵌 PM2 而非系统 PATH 的 pm2：离线部署机 PATH 无 pm2，execSync('pm2') 会 ENOENT。
    const user = process.env.USER || process.env.LOGNAME || 'root';
    const home = process.env.HOME || `/home/${user}`;
    return runPm2(['startup', 'systemd', '-u', user, '--hp', home]);
  }

  // Windows：用注册表 HKCU Run 键实现"登录时 pm2 resurrect"（Windows 原生，无需第三方包）。
  // 注册表 Run 键由 Windows 登录后自动执行，无需管理员权限，适合 PM2 这种用户级服务。
  try {
    // 1) 生成登录自启脚本：设置 PM2_HOME 后执行 pm2 resurrect（恢复所有已 save 的进程）
    const dataDir = path.join(PROJECT_ROOT, 'data');
    const batPath = path.join(dataDir, 'pm2-startup.bat');
    const batContent = [
      '@echo off',
      `set PM2_HOME=${PM2_HOME}`,
      `start "" /min "${NODE_EXE}" "${PM2_JS}" resurrect`,
      'exit',
    ].join('\r\n');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(batPath, batContent, { encoding: 'utf8' });

    // 2) 注册 HKCU Run 键，值指向该 bat（路径含空格用 \" 转义，REG_SZ 原样存储）
    const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    const escapedBat = batPath.replace(/\\/g, '\\\\');
    const runValue = `cmd /c "${escapedBat}"`;
    return runCommand(
      'reg',
      [
        'add',
        runKey,
        '/v',
        'CloudCAD-PM2',
        '/t',
        'REG_SZ',
        '/d',
        runValue,
        '/f',
      ],
      { silent: true }
    );
  } catch {
    return false;
  }
}

/**
 * 前台 spawn 启动基础服务（仅 PM2 不可用时的兜底）。
 * 前台模式依赖 CLI 父进程存活，通常不应作为正式部署方式。
 */
async function startInfrastructureForeground({
  pgOpen,
  redisOpen,
  cooperateOpen,
  configOpen,
}) {
  const pgManagerScript = path.join(RUNTIME_DIR, 'scripts', 'pg-manager.js');
  const redisManagerScript = path.join(
    RUNTIME_DIR,
    'scripts',
    'redis-manager.js'
  );
  const cooperateScript = path.join(
    RUNTIME_DIR,
    'scripts',
    'cooperate-manager.js'
  );
  const configServiceScript = path.join(
    PROJECT_ROOT,
    'packages',
    'config-service',
    'server.js'
  );

  if (!pgOpen) {
    const pgProcess = spawn(NODE_EXE, [pgManagerScript, 'daemon'], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false,
      windowsHide: true,
      detached: IS_LINUX,
    });
    state.childProcesses.add(pgProcess);
    log('cyan', '  PostgreSQL 已启动（前台兜底）');
  }

  if (!redisOpen) {
    const redisProcess = spawn(NODE_EXE, [redisManagerScript, 'daemon'], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false,
      windowsHide: true,
      detached: IS_LINUX,
    });
    state.childProcesses.add(redisProcess);
    log('cyan', '  Redis 已启动（前台兜底）');
  }

  if (!cooperateOpen && fs.existsSync(cooperateScript)) {
    const cooperateProcess = spawn(NODE_EXE, [cooperateScript], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false,
      windowsHide: true,
      detached: IS_LINUX,
    });
    state.childProcesses.add(cooperateProcess);
    log('cyan', '  协同服务已启动（前台兜底）');
  }

  if (!configOpen && fs.existsSync(configServiceScript)) {
    const configProcess = spawn(NODE_EXE, [configServiceScript], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false,
      windowsHide: true,
      detached: IS_LINUX,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        CONFIG_SERVICE_PORT: String(PORTS.configService),
      },
    });
    state.childProcesses.add(configProcess);
    log('cyan', '  配置中心已启动（前台兜底）');
  }

  log('green', '[✓] 基础服务已启动（前台兜底模式）');
  return true;
}

// 检查服务是否运行
function isServiceRunning(serviceName) {
  const result = spawnSync(NODE_EXE, [PM2_JS, 'show', serviceName], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...process.env, PM2_HOME },
    shell: IS_WINDOWS,
  });
  return result.status === 0 && !result.stdout.includes('not found');
}

module.exports = {
  startInfrastructure,
  isServiceRunning,
  setupPm2Startup,
  areAllInfraOnline,
  reconcileInfrastructureWithPm2,
  isPm2AppFromThisProject,
  ensureRedisPasswordManaged,
  ensurePostgresPortManaged,
  repairDatabaseUrlConsistency,
  relocatePostgresPort,
  stopForeignPostgres,
  relocateRedisPort,
};
