/**
 * @fileoverview psql 执行 + 运维审计写入（纯能力层，供运维恢复通道复用）
 *
 * 收敛 mfa.js 里唯一的 psql 拼装与 audit_logs 插入逻辑，供 mfa:totp-unbind /
 * admin:reset-password / db:reset-password / redis:reset-password 四条恢复
 * 通道共用——同一能力散落多份即缺陷，这里做成唯一出口。
 *
 * 依赖方向铁律：lib 只允许 require 其他 lib 或独立模块，禁止 require commands。
 * 因此本模块不直接依赖 commands/db-backup，而是由调用方把 DB 连接访问器
 * （getPsqlPath/getDbEnv）注入进来——接受依赖、不自己创建，也让测试可注入假访问器。
 * spawn 亦可注入（默认 child_process.spawnSync）。
 */

const { spawnSync: defaultSpawn } = require('child_process');
const { randomUUID } = require('crypto');

/** SQL 单引号转义（防注入）。bcrypt 哈希字符集为 ./A-Za-z0-9，天然不含单引号 */
function sqlQuote(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * 构造 psql 执行器。DB 连接配置访问器由调用方注入（来自 commands/db-backup），
 * 返回绑定好的 { run, writeAudit, auditorId }。
 * @param {{getPsqlPath: Function, getDbEnv: Function, spawn?: Function}} accessors
 * @returns {{run: Function, writeAudit: Function, auditorId: Function}}
 */
function makePsql({ getPsqlPath, getDbEnv, spawn: spawnSync = defaultSpawn }) {
  /**
   * 执行 psql 单条 SQL。-tAc：tuples-only + 非对齐（多列以 | 分隔）+ 命令串。
   * @param {string} sql
   * @param {{database?: string, password?: string}} [override] 覆盖连接目标：
   *   database 缺省为 .env 的应用库，password 缺省为 .env 的 DB_PASSWORD。
   *   基础设施密码重置需要「用维护库 ALTER USER」与「用新口令回连验证」两种
   *   非默认连接，故在此开口而非各处另写一份 psql 拼装。
   * @returns {{ok: boolean, stdout: string, stderr: string}}
   */
  function run(sql, override = {}) {
    const psqlPath = getPsqlPath();
    const { env, config } = getDbEnv();
    const dbHost = config.DB_HOST || 'localhost';
    const dbPort = config.DB_PORT || '5432';
    const dbUser = config.DB_USERNAME || 'postgres';
    const dbName = override.database || config.DB_DATABASE || 'cloudcad';
    const dbPassword =
      override.password === undefined ? env.PGPASSWORD : override.password;

    // 必须走参数数组、不能拼命令串 + shell:true：SQL 里全是双引号包裹的
    // 驼峰标识符（"resourceType" / "roleId" …），经 shell 传递时引号被吃掉、
    // 标识符被 PostgreSQL 折叠成小写 → 「column resourcetype does not exist」，
    // 语句静默失败。曾导致运维审计一条都写不进去（35b2e59 起）。
    const result = spawnSync(psqlPath, [
      '-h',
      dbHost,
      '-p',
      dbPort,
      '-U',
      dbUser,
      '-d',
      dbName,
      '-tAc',
      sql,
    ], {
      env: { ...env, PGPASSWORD: dbPassword },
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    if (result.error) {
      throw new Error(`psql 执行失败: ${result.error.message}`);
    }
    return {
      ok: result.status === 0,
      stdout: (result.stdout || '').trim(),
      stderr: (result.stderr || '').trim(),
    };
  }

  /**
   * 写入一条运维通道审计（audit_logs）。固定语义：success=true、
   * ipAddress=127.0.0.1（本机 CLI）、createdAt=now()。
   *
   * resourceType / userId 可覆盖，默认适配「账号自归属」的两条恢复通道
   * （TOTP 解绑 / 管理员密码重置）：resourceType=USER、userId=resourceId。
   * 基础设施密码重置没有操作者账号（审计表 userId 非空且有外键），故由调用方
   * 传 resourceType='SYSTEM' 并指定一个真实存在的 ADMIN id 承担归属。
   * @param {{
   *   action: string,
   *   resourceId: string,
   *   resourceName: string,
   *   params: object,
   *   userAgent: string,
   *   resourceType?: string,
   *   userId?: string,
   * }} opts
   * @returns {{ok: boolean, stdout: string, stderr: string}}
   */
  function writeAudit({
    action,
    resourceId,
    resourceName,
    params,
    userAgent,
    resourceType = 'USER',
    userId,
  }) {
    const auditId = randomUUID();
    const paramsJson = JSON.stringify(params);
    return run(
      `INSERT INTO "audit_logs" (` +
        `"id", "action", "resourceType", "resourceId", "userId", ` +
        `"resourceName", "params", "success", "ipAddress", "userAgent", "createdAt" ` +
        `) VALUES (` +
        `'${auditId}', '${sqlQuote(action)}', '${sqlQuote(resourceType)}', ` +
        `'${sqlQuote(resourceId)}', '${sqlQuote(userId || resourceId)}', ` +
        `'${sqlQuote(resourceName)}', ` +
        `'${sqlQuote(paramsJson)}'::jsonb, true, ` +
        `'127.0.0.1', '${sqlQuote(userAgent)}', now()` +
        `)`
    );
  }

  /**
   * 取一个真实存在的 ADMIN id 作为审计归属。audit_logs.userId 非空且有外键，
   * 而基础设施密码重置没有操作者账号，须挂到一个真实存在的用户上。
   * @returns {string} 未找到返回空串（调用方据此跳过审计并告警）
   */
  function auditorId() {
    const r = run(
      `SELECT u."id" FROM "users" u LEFT JOIN "roles" r ON u."roleId" = r."id" ` +
        `WHERE r."name" = 'ADMIN' ORDER BY u."username" LIMIT 1`
    );
    return r.ok && r.stdout ? r.stdout : '';
  }

  return { run, writeAudit, auditorId };
}

module.exports = { sqlQuote, makePsql };
