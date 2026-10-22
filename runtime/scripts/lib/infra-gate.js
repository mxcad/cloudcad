/**
 * @fileoverview 基础设施门禁的纯判定层（redis 密码门禁 / PG 端口门禁共用）
 *
 * 从 commands/infra.js 下沉（ADR-0056 lib/commands 分层）：两套门禁是同一协议
 * 的两次参数化（探测 → 归属判定 → 纯决策 → 处置），本模块只收"纯决策 + 形状
 * 解析"——无 .env 读写、无进程信号、无日志，可 0 依赖 node:test（见
 * commands/infra-redis-gate.test.js / infra-pg-gate.test.js）。
 * 处置动作（换端口改写 .env / 停进程 / 运行期设密）留在 commands/infra.js。
 *
 * 历史误命名修正：本机主机判定原名 isLocalRedisHost（redis 门禁先建），
 * 后被 PG 门禁分支调用（注释自认"命名沿用 redis 门禁"）——现为 isLocalHost，
 * 两套门禁共用。
 */

const fs = require('fs');
const path = require('path');

const { DATA_DIR } = require('./context');
const {
  getProcessExecutablePath,
  isOurRuntimeProcess,
  isForeignCloudCadRuntimeProcess,
} = require('./proc');
const { isPortOpen } = require('./health');

/**
 * 判断主机名是否指向本机（只有本机实例才能被定位/停止/换端口处置）。
 * redis 门禁（REDIS_HOST）与 PG 门禁（DB_HOST / DATABASE_URL 主机）共用。
 * @param {string} host
 * @returns {boolean}
 */
function isLocalHost(host) {
  const h = String(host || '127.0.0.1').trim().toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1';
}

/**
 * redis 密码门禁的纯决策：给定探测状态、占用者归属与探测置信度，决定处置动作。
 *
 * 处置原则（2026-10 修订）：
 * - 本部署实例（ours）：可复用/运行中设密/停止重拉——是自己的进程，怎么处置都不
 *   影响外部；
 * - **外部实例**（系统装的 redis / 其他用户 / 另一部署目录），任何认证状态：
 *   一律不碰（不停、不改密、不采纳）——停系统服务/改其配置属于对用户机器的
 *   越权操作；改为让本部署自带 redis 换到空闲端口（relocate）；
 * - PID 无法定位但全量扫描已执行（fullScanDone）：本部署进程与当前用户同属，
 *   全量扫描必然可见，故定位不到 ⇒ 占用者必属其他用户 ⇒ 按外部实例换端口；
 * - PID 无法定位且全量扫描未执行：无法排除是本部署实例（换端口会让新旧两个
 *   实例共写同一 --dir，有数据损坏风险）⇒ 中止，须人工介入。
 *
 * @param {{probeState: 'ok'|'noauth'|'wrongpass'|'unknown', ownership: 'ours'|'foreign'|'unknown'|null, fullScanDone: boolean, isLocal: boolean}} p
 *   probeState   probeRedisAuth 的认证探测结果
 *   ownership    detectRedisOwnership 结果（pid 未定位时为 null）
 *   fullScanDone detectPortOwner 的置信度（全量可见性扫描是否执行过）
 *   isLocal      REDIS_HOST 是否指向本机
 * @returns {'ok'|'fix-ours'|'takeover-ours'|'relocate'|'blocked'}
 */
function decideRedisGateAction({
  probeState,
  ownership,
  fullScanDone,
  isLocal,
}) {
  if (!isLocal) {
    // 远程实例：无法定位进程/停止/运行中设密，只有"密码正确 → 原样复用"是安全的
    return probeState === 'ok' ? 'ok' : 'blocked';
  }
  if (ownership === 'ours') {
    if (probeState === 'ok') return 'ok';
    if (probeState === 'noauth') return 'fix-ours';
    return 'takeover-ours'; // wrongpass / unknown：本部署实例，停止重拉
  }
  if (ownership === 'foreign') return 'relocate';
  // ownership 为 null（PID 未定位）或 'unknown'（PID 在但 cmdline 不可读）：
  if (ownership === null && fullScanDone) return 'relocate';
  return 'blocked';
}

/**
 * 从 startPort 起向上扫描第一个空闲 TCP 端口。
 * @param {number} startPort 起始端口（含）
 * @param {{maxTries?: number, isPortOpen?: (port: number) => Promise<boolean>, exclude?: Set<number>}} [opts]
 *   maxTries   最多尝试的端口数（默认 100）
 *   isPortOpen 端口占用探测（默认 isPortOpen(port, '127.0.0.1')，可注入便于单测）
 *   exclude    需跳过的端口集合（如本部署其他服务端口）
 * @returns {Promise<number|null>} 第一个空闲端口；范围内无空闲端口返回 null
 */
async function findFreePortUpFrom(
  startPort,
  { maxTries = 100, isPortOpen: probe, exclude } = {}
) {
  const check = probe || ((p) => isPortOpen(p, '127.0.0.1'));
  for (let i = 0; i < maxTries; i++) {
    const candidate = startPort + i;
    if (candidate < 1 || candidate > 65535) return null;
    if (exclude && exclude.has(candidate)) continue;
    if (!(await check(candidate))) return candidate;
  }
  return null;
}

// PostgreSQL 数据目录（与 pg-manager.js 同约定；CLOUDCAD_PG_DATA_DIR 仅供单测重定向）
const PG_DATA_DIR = process.env.CLOUDCAD_PG_DATA_DIR
  ? path.resolve(process.env.CLOUDCAD_PG_DATA_DIR)
  : path.join(DATA_DIR, 'postgres');

/**
 * PG 端口门禁的纯决策：给定 .env 数据库端口占用者的归属，决定处置动作。
 *
 * 处置原则（2026-10，与 redis 门禁对齐 + 用户明确要求的"始终用本地的"）：
 * - 自带 PG 必须恒由本部署包提供，**永不采纳外部实例**（即使密码恰好一致）；
 * - 本部署实例（ours）：原样复用（后续端口扫描 / reconcile 按既有语义处理）；
 * - 另一部署目录的实例（foreign-deploy，同包多解压）：直接停掉、启动本目录的
 *   （同包同数据布局，不存在跨项目数据错位风险，无需询问用户）；
 * - 外部实例（系统装的 PG / 其他用户）：一律不碰（不停、不改密、不采纳）——
 *   本部署自带 PG 换到空闲端口并改写 .env（relocate）；
 * - PID 无法定位但全量扫描已执行（fullScanDone）：本部署进程与当前用户同属
 *   （root 下全量可见），定位不到 ⇒ 必属其他用户 ⇒ 按外部实例换端口；
 * - PID 无法定位且全量扫描未执行：无法排除是本部署实例（换端口会让新旧两个
 *   实例共写同一数据目录，有数据损坏风险）⇒ 中止，须人工介入；
 * - 远程 DB_HOST：自带 PG 无法服务远程库，不属门禁范围（ok；连不上由迁移步骤
 *   以 prisma 原错误上报）。
 *
 * @param {{ownership: 'ours'|'foreign-deploy'|'foreign'|'unknown'|null, fullScanDone: boolean, isLocal: boolean}} p
 *   ownership    detectPostgresOwnership 结果（pid 未定位时为 null）
 *   fullScanDone detectPortOwner 的置信度（全量可见性扫描是否执行过）
 *   isLocal      DB_HOST 是否指向本机
 * @returns {'ok'|'stop-foreign'|'relocate'|'blocked'}
 */
function decidePostgresGateAction({ ownership, fullScanDone, isLocal }) {
  if (!isLocal) return 'ok';
  if (ownership === 'ours') return 'ok';
  if (ownership === 'foreign-deploy') return 'stop-foreign';
  if (ownership === 'foreign') return 'relocate';
  if (ownership === null && fullScanDone) return 'relocate';
  return 'blocked';
}

/**
 * 转换服务端口门禁的纯决策（应用层端口，与 PG/Redis 基础服务门禁同一套归属口径）。
 *
 * 此前该端口是全仓唯一「不看占用者、只搬家」的端口处理：被占就顺延 +1 并回写 .env。
 * 后果（2026-10-21 实例）：反复 start 时每轮都撞上自己上一轮的 PM2 托管实例
 * （stopAppServices 只停 backend/frontend），端口从 3100 一路被推到 3103，而
 * conversion-service 自己那份 .env 没同步 → 后端连 3103、服务监听 3100，上传全失败。
 * 更严重的是：同机另一部署目录的前台实例占着端口时，也会被静默绕开——两个部署
 * 并存对外服务，没有任何入口提示「旧部署还在跑」。
 *
 * 处置原则（与 decidePostgresGateAction 对齐）：
 * - ours-pm2：本部署 PM2 托管 → 复用端口，交给 PM2 重启重新绑定（不搬、不杀）；
 * - ours-residual：本部署上一轮残留进程 → 清掉再用同一端口（自己的，安全）；
 * - foreign-deploy：可执行文件证明属于另一部署目录 → 交由用户决定谁让位，
 *   **不得静默顺延**（这正是「两个部署包并存、谁也关不掉谁」的来源）；
 * - unknown：plain node 进程，归属无法判定（可能是另一部署的前台实例，也可能是
 *   本仓库 pnpm dev 起的同名服务）→ 询问，不做任何静默处置；
 * - external：非 node 的系统服务 → 不碰别人的进程，自己换端口避让。
 *
 * @param {{ownership: 'ours-pm2'|'ours-residual'|'foreign-deploy'|'unknown'|'external'}} p
 * @returns {'reuse'|'clean'|'ask-foreign'|'ask-unknown'|'relocate'}
 */
function decideConversionPortAction({ ownership }) {
  if (ownership === 'ours-pm2') return 'reuse';
  if (ownership === 'ours-residual') return 'clean';
  if (ownership === 'foreign-deploy') return 'ask-foreign';
  if (ownership === 'external') return 'relocate';
  return 'ask-unknown';
}

/**
 * 解析 DATABASE_URL 的 host:port 段（URL 其余部分逐字保留）。
 *
 * URL 形状识别的单一事实源：rewriteDatabaseUrlPort（换端口改写）与
 * repairDatabaseUrlConsistency（URL 与 DB_PORT 对齐）都经此解析，形状口径
 * 只有一份。
 *
 * @param {string} url DATABASE_URL
 * @returns {{host: string, port: number, prefix: string, rest: string}|null}
 *   host   URL 主机段（不含端口）
 *   port   URL 端口段（无端口段时按 PostgreSQL 默认 5432）
 *   prefix `postgresql://[userinfo@]host`（端口段之前的部分）
 *   rest   端口段之后的部分（含 /库名 与查询参数）
 *   形状无法识别（非 postgresql:// 开头 / 空值）返回 null
 */
function parseDatabaseUrlHostPort(url) {
  const text = String(url || '');
  const m = /^(postgresql:\/\/(?:[^@/]+@)?)([^:/?#\s]+)(?::(\d+))?(?:[/?#].*)?$/.exec(
    text
  );
  if (!m) return null;
  const host = m[2];
  const port = m[3] ? Number(m[3]) : 5432;
  const prefix = `${m[1]}${host}`;
  const rest = text.slice(prefix.length + (m[3] ? m[3].length + 1 : 0));
  return { host, port, prefix, rest };
}

/**
 * 只改写 DATABASE_URL 的端口段（userinfo / 查询参数 / 库名逐字保留）。
 *
 * 不用 DB_* 部件重组 URL：DATABASE_URL 可能携带查询参数（sslmode 等），重组会
 * 静默丢弃；且 URL 内密码与 DB_PASSWORD 允许不同（DATABASE_URL 优先于
 * DB_PASSWORD）。门禁只改端口，不得触碰其余任何字节。
 *
 * @param {string} url 当前 DATABASE_URL
 * @param {number|string} oldPort .env 原端口（DB_PORT）
 * @param {number} newPort 新端口
 * @returns {string|null} 改写后的 URL；形状无法识别、或 URL 端口与 oldPort 不一致
 *   （.env 自身不一致，调用方必须中止而非猜测）时返回 null
 */
function rewriteDatabaseUrlPort(url, oldPort, newPort) {
  const parsed = parseDatabaseUrlHostPort(url);
  if (!parsed) return null;
  if (parsed.port !== Number(oldPort)) return null;
  return `${parsed.prefix}:${newPort}${parsed.rest}`;
}

/**
 * 判定 PG 端口占用进程的归属：
 * - 'ours'：本部署自带 PG（postmaster.pid 的 PID 匹配，或可执行文件在本目录 runtime/ 下）；
 * - 'foreign-deploy'：同包另一部署目录的实例（可执行文件含 /runtime/<platform>/ 但不在本目录）；
 * - 'foreign'：外部系统服务（系统装的 PG 等）；
 * - 'unknown'：PID 在但可执行文件不可读（调用方必须中止，不得猜测）；
 * - null：无 PID（调用方结合 fullScanDone 判定）。
 *
 * postmaster.pid 判据最直接：该锁文件由对应数据目录的 postmaster 独占持有并负责
 * 清理，首行 PID 与端口占用者一致即坐实本部署实例（陈旧文件的 PID 已死，不会
 * 与存活的外部 PID 撞号）。
 *
 * @param {number|null} pid
 * @param {{pgDataDir?: string, getExe?: (pid: number) => string|null, isOurs?: (pid: number) => boolean, isForeign?: (pid: number) => boolean}} [deps] 注入用（测试）
 * @returns {'ours'|'foreign-deploy'|'foreign'|'unknown'|null}
 */
function detectPostgresOwnership(
  pid,
  {
    pgDataDir = PG_DATA_DIR,
    getExe = getProcessExecutablePath,
    isOurs = isOurRuntimeProcess,
    isForeign = isForeignCloudCadRuntimeProcess,
  } = {}
) {
  if (!pid) return null;
  try {
    const pidFile = path.join(pgDataDir, 'postmaster.pid');
    if (fs.existsSync(pidFile)) {
      const first = fs.readFileSync(pidFile, 'utf8').split('\n')[0].trim();
      if (first === String(pid)) return 'ours';
    }
  } catch {
    /* 锁文件不可读，落到可执行文件判定 */
  }
  if (isOurs(pid)) return 'ours';
  if (isForeign(pid)) return 'foreign-deploy';
  return getExe(pid) ? 'foreign' : 'unknown';
}

module.exports = {
  isLocalHost,
  decideRedisGateAction,
  findFreePortUpFrom,
  decidePostgresGateAction,
  decideConversionPortAction,
  parseDatabaseUrlHostPort,
  rewriteDatabaseUrlPort,
  detectPostgresOwnership,
};
