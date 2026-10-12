/**
 * DATABASE_URL 解析与组装的唯一事实源（runtime 侧副本）。
 *
 * 背景（ADR-0073 补完）：DATABASE_URL 是 Prisma 的权威连接来源，其部件优先于
 * DB_* 环境变量。写侧历史上被逐字节抄了三份（setup-wizard ×2 / db-reset-password /
 * config-service system-config），回落链各自漂移，且 config-service 运维台写入器
 * 用 DB_* 部件重组 URL——静默丢弃查询参数（?sslmode=disable 等）与 URL 内密码，
 * 与本包 infra.js「不得重组 URL」的既有决策直接矛盾。
 *
 * 本模块提供两个纯函数：
 *   parseDatabaseUrl(url)  → { host, port, user, password, dbName[, query] }
 *     缺失部件为 undefined；query 仅在 URL 带非空查询串时出现（保持既有返回形状）。
 *   composeDatabaseUrl({ host, port, user, password, dbName, query }) → 'postgresql://…'
 *     对 password 做 encodeURIComponent，并逐字保留 query 段。
 *
 * config-service 是 0 依赖独立包，无法 require 本文件，故在其 lib/ 保留一份逐字
 * 相同的副本；两份由 runtime/scripts/database-url.test.js 的漂移守卫锁定行为一致
 * （与 .env escape 字符类的三副本守卫同构）。
 */

function parseDatabaseUrl(url) {
  if (!url) return {};
  try {
    const u = new URL(url);
    const parts = {
      host: u.hostname || undefined,
      port: u.port || undefined,
      user: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      dbName: u.pathname ? u.pathname.replace(/^\//, '') : undefined,
    };
    if (u.search) parts.query = u.search.replace(/^\?/, '');
    return parts;
  } catch {
    return {};
  }
}

function composeDatabaseUrl({ host, port, user, password, dbName, query }) {
  const encodedPassword = encodeURIComponent(password == null ? '' : password);
  const userinfo = user ? `${user}:${encodedPassword}@` : '';
  let url = `postgresql://${userinfo}${host}:${port}/${dbName}`;
  if (query) url += `?${query}`;
  return url;
}

module.exports = {
  parseDatabaseUrl,
  composeDatabaseUrl,
};
