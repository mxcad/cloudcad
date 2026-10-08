/**
 * @fileoverview psql 执行 + 运维审计写入（纯能力层，供运维恢复通道复用）
 *
 * 收敛 mfa.js 与 admin-reset-password.js 两份逐字节相同的 psql 拼装与
 * audit_logs 插入逻辑——同一能力散落多份即缺陷，这里做成唯一出口。
 *
 * 依赖方向铁律：lib 只允许 require 其他 lib 或独立模块，禁止 require commands。
 * 因此本模块不直接依赖 commands/db-backup，而是由调用方把 DB 连接访问器
 * （getPsqlPath/getDbEnv）注入进来——接受依赖、不自己创建，也让测试可注入假访问器。
 */

const { spawnSync } = require('child_process');
const { randomUUID } = require('crypto');

/** SQL 单引号转义（防注入）。bcrypt 哈希字符集为 ./A-Za-z0-9，天然不含单引号 */
function sqlQuote(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * 构造 psql 执行器。DB 连接配置访问器由调用方注入（来自 commands/db-backup），
 * 返回绑定好的 { run, writeAudit }。
 * @param {{getPsqlPath: Function, getDbEnv: Function}} accessors
 * @returns {{run: Function, writeAudit: Function}}
 */
function makePsql({ getPsqlPath, getDbEnv }) {
  /**
   * 执行 psql 单条 SQL。-tAc：tuples-only + 非对齐（多列以 | 分隔）+ 命令串。
   * @param {string} sql
   * @returns {{ok: boolean, stdout: string, stderr: string}}
   */
  function run(sql) {
    const psqlPath = getPsqlPath();
    const { env, config } = getDbEnv();
    const dbHost = config.DB_HOST || 'localhost';
    const dbPort = config.DB_PORT || '5432';
    const dbUser = config.DB_USERNAME || 'postgres';
    const dbName = config.DB_DATABASE || 'cloudcad';

    const cmd = `"${psqlPath}" -h "${dbHost}" -p "${dbPort}" -U "${dbUser}" -d "${dbName}" -tAc "${sql}"`;
    const result = spawnSync(cmd, [], {
      env,
      shell: true,
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
   * 写入一条运维通道审计（audit_logs）。固定语义：resourceType=USER、
   * success=true、ipAddress=127.0.0.1（本机 CLI）、createdAt=now()——两条恢复
   * 通道（TOTP 解绑 / 密码重置）审计的都是「某用户账号」的运维操作，语义一致。
   * @param {{
   *   action: string,
   *   resourceId: string,
   *   resourceName: string,
   *   params: object,
   *   userAgent: string,
   * }} opts
   * @returns {{ok: boolean, stdout: string, stderr: string}}
   */
  function writeAudit({ action, resourceId, resourceName, params, userAgent }) {
    const auditId = randomUUID();
    const paramsJson = JSON.stringify(params);
    return run(
      `INSERT INTO "audit_logs" (` +
        `"id", "action", "resourceType", "resourceId", "userId", ` +
        `"resourceName", "params", "success", "ipAddress", "userAgent", "createdAt" ` +
        `) VALUES (` +
        `'${auditId}', '${sqlQuote(action)}', 'USER', '${sqlQuote(resourceId)}', ` +
        `'${sqlQuote(resourceId)}', '${sqlQuote(resourceName)}', ` +
        `'${sqlQuote(paramsJson)}'::jsonb, true, ` +
        `'127.0.0.1', '${sqlQuote(userAgent)}', now()` +
        `)`
    );
  }

  return { run, writeAudit };
}

module.exports = { sqlQuote, makePsql };
