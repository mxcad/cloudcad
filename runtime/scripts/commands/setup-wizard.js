/**
 * @fileoverview 首次部署引导配置 / 密码生成与展示
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - isPasswordWeak：cli.js:2329-2346
 * - generateRandomPassword：cli.js:2353-2355
 * - generateNumericPassword：cli.js:2362-2368
 * - generateJwtSecret：cli.js:2375-2377
 * - runSetupWizard：cli.js:2382-2552
 * - autoSetupAndShowPasswords：cli.js:2558-2613
 * - showCurrentPasswords：cli.js:1696-1724
 *
 * 管理员口令三分支（回车=默认简单口令 DEFAULT_ADMIN_PASSWORD / y=复杂随机 / n=自定义）。
 * 默认走简单口令是有意放松 #416 等保 8.1.4.1 复杂度要求，代价由产品内横幅承接
 * （ADMIN 且 passwordChangedAt===null 时提示改密）。
 * 数据库 / Redis 密码丢失不必重装数据目录——走 cli.js db:reset-password /
 * redis:reset-password（ADR-0073 带外恢复通道，不索取旧口令）。
 *
 * 依赖方向：commands → lib。共享可变状态 isFirstDeploy 经 lib/state（A-2 收口）。
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const { PORTS, BACKEND_ENV_PATH } = require('../lib/context');
const { PRODUCT_NAME } = require('../lib/branding');
const { colors, log, brandBox } = require('../lib/logger');
const { parseEnvFile, updateEnvFile } = require('../lib/env');
const { parseDatabaseUrl, composeDatabaseUrl } = require('../lib/database-url');
const { getAdminLoginPath } = require('../lib/admin-login');
// 强随机口令生成 + 默认简单口令：单一事实源 lib/secret-generator.js（ADR-0074，与 setup-offline 共用）
const {
  generateStrongPassword,
  DEFAULT_ADMIN_PASSWORD,
} = require('../lib/secret-generator');
const { promptPasswordWithConfirm } = require('../lib/prompt');
const {
  getDbEnv,
  checkDatabaseExists,
  countUsers,
} = require('./db-backup');
const state = require('../lib/state');

/**
 * 检查密码强度
 * @param {string} password 密码
 * @returns {boolean} true 表示密码简单，需要警告
 */
function isPasswordWeak(password) {
  if (!password || password.length < 8) return true;

  // 检查是否只有数字或只有字母
  const hasDigit = /\d/.test(password);
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  // 如果只有数字或只有字母，认为简单
  if (
    (hasDigit && !hasLetter && !hasSpecial) ||
    (hasLetter && !hasDigit && !hasSpecial)
  ) {
    return true;
  }

  return false;
}

/**
 * 生成随机密码
 * @param {number} length 密码长度，默认 12
 * @returns {string} 随机密码
 */
function generateRandomPassword(length = 12) {
  return generateNumericPassword(length);
}

/**
 * 生成纯数字随机密码
 * @param {number} length 密码长度，默认 10
 * @returns {string} 纯数字随机密码
 */
function generateNumericPassword(length = 10) {
  let password = '';
  for (let i = 0; i < length; i++) {
    password += crypto.randomInt(0, 10).toString();
  }
  return password;
}

/**
 * 生成随机 JWT 密钥
 * @param {number} length 密钥长度，默认 32
 * @returns {string} 随机密钥
 */
function generateJwtSecret(length = 32) {
  return generateNumericPassword(length);
}

/**
 * 查询当前数据库的用户数（无法判定时返回 null）。
 *
 * 用于决定是否跳过初始管理员密码配置：后端仅在 userCount===0 时创建初始管理员
 * （env 预置或 Web 首启）。若库中已有账号（此前源码启动经 Web 首启页创建、
 * 或上次部署已建），本向导写入的 INITIAL_ADMIN_PASSWORD 永不生效——此时再向用户
 * 收集/展示一个永不生效的密码只会造成「抄了密码却登不进去」的困惑。
 * PG 未启动 / 库未创建 / 认证失败 → null（无法判定），调用方回落原流程
 * （全新部署的库此时本就不存在，按全新处理是正确的）。
 * @returns {Promise<number|null>}
 */
async function existingUserCount() {
  try {
    const { config } = getDbEnv();
    const host = config.DB_HOST || 'localhost';
    const port = Number(config.DB_PORT || 5432);
    const user = config.DB_USERNAME || 'postgres';
    const db = config.DB_DATABASE || 'cloudcad';
    const exists = await checkDatabaseExists(host, port, user, db);
    if (exists !== true) return null; // 库未创建或无法判定 → 按全新部署处理
    return await countUsers(host, port, user, db);
  } catch {
    return null;
  }
}

/**
 * 管理员口令三分支选择（首次部署 autoSetupAndShowPasswords 与重配置 runSetupWizard 共用）：
 *   直接回车 = 使用默认简单口令 DEFAULT_ADMIN_PASSWORD
 *   输入 y   = 生成生产级复杂随机口令（符合 #416 等保 8.1.4.1 口令策略）
 *   输入 n   = 用户自己输入自定义口令（掩码 + 二次确认）
 *
 * 默认走简单口令是有意放松 #416 等保 8.1.4.1 复杂度要求（非技术用户抄不下 16 位四类
 * 随机口令会被锁死），代价由产品内横幅承接：ADMIN 且 passwordChangedAt===null 时
 * 提示「仍在首次部署初始密码」并给改密入口。
 *
 * 自定义口令做最小前置校验：长度下限 8 + 至少两类字符（复用本文件 isPasswordWeak，
 * 纯数字/纯字母即判弱，故「字母+数字」或含特殊字符的两类组合即通过）。这比后端
 * assertPasswordPolicy（10 位 + 四类取三）宽松——部署期只挡最明显的短/单类口令，
 * 写入后由弱口令横幅持续提示，改密时后端策略再拦一次。不校验弱口令黑名单：
 * 黑名单是 backend 的 TS 模块，runtime 脚本无法解析（同 admin-reset-password.js 的取舍），
 * 而长度下限已挡住 12345678 这类短口令。
 *
 * 沿用本文件既有的 rl.question 循环模式：promptChoice 自建 readline 接口，与调用方已
 * 持有的 rl 抢 stdin 会在管道输入下丢行。
 * @param {readline.Interface} rl
 * @returns {Promise<string>} 最终采用的管理员口令
 */
async function promptAdminPassword(rl) {
  for (;;) {
    const ans = await new Promise((resolve) => {
      rl.question(
        `${colors.cyan}管理员密码${colors.reset}` +
          ` [默认简单口令 ${colors.bright}${DEFAULT_ADMIN_PASSWORD}${colors.reset}` +
          `${colors.cyan}；回车=使用默认 / y=生成复杂随机口令 / n=自定义]: ${colors.reset}`,
        (a) => resolve(a.trim().toLowerCase())
      );
    });

    if (ans === '') {
      console.log(`  → 使用默认简单口令 ${DEFAULT_ADMIN_PASSWORD}`);
      return DEFAULT_ADMIN_PASSWORD;
    }

    if (ans === 'y' || ans === 'yes') {
      const generated = generateStrongPassword();
      console.log(`  → 已生成复杂随机口令：${generated}`);
      return generated;
    }

    if (ans === 'n' || ans === 'no') {
      const custom = await promptPasswordWithConfirm(rl, '管理员密码（自定义）');
      if (custom && !isPasswordWeak(custom)) {
        return custom;
      }
      console.log(
        `${colors.yellow}  ✗ 自定义口令不合格（需 ≥8 位且含字母/数字/特殊字符中至少两类），请重新选择。${colors.reset}`
      );
      continue;
    }

    console.log(
      `${colors.yellow}  请直接回车使用默认简单口令，或输入 y 生成复杂随机口令、输入 n 自定义。${colors.reset}`
    );
  }
}

/**
 * 运行部署引导配置
 */
async function runSetupWizard() {
  console.log('');
  console.log(`${colors.cyan}╔════════════════════════════════════════╗`);
  console.log(`${colors.cyan}${brandBox(`${PRODUCT_NAME} 首次部署配置`, 36)}${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════╝${colors.reset}`);
  console.log('');

  // 读取当前 .env 配置
  const envConfig = parseEnvFile(BACKEND_ENV_PATH);

  // 获取默认值
  const defaultDbPassword = envConfig.DB_PASSWORD || 'password';
  const defaultAdminPassword =
    envConfig.INITIAL_ADMIN_PASSWORD || generateStrongPassword();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // 需要更新的配置
  const updates = {};

  // JWT 密钥自动生成
  const jwtSecret = generateJwtSecret(32);
  updates.JWT_SECRET = jwtSecret;

  try {
    // 1. 数据库密码 - 不填写时自动生成
    console.log(`${colors.cyan}[核心配置]${colors.reset}`);
    console.log(`${colors.yellow}提示: 直接回车将自动生成密码${colors.reset}`);
    const dbPassword = await promptPasswordWithConfirm(
      rl,
      '数据库密码',
      '[回车自动生成]'
    );

    if (dbPassword) {
      updates.DB_PASSWORD = dbPassword;
    } else {
      // 自动生成数据库密码
      const generatedDbPassword = generateRandomPassword();
      updates.DB_PASSWORD = generatedDbPassword;
      console.log(`  → 已自动生成数据库密码`);
    }

    // 2. Redis 密码 - 不填写时无密码（合理）
    const redisPassword = await promptPasswordWithConfirm(
      rl,
      'Redis 密码',
      '[回车无密码]'
    );

    if (redisPassword) {
      updates.REDIS_PASSWORD = redisPassword;
    } else {
      console.log(`  → 无密码`);
    }

    // 3. 管理员密码 - 三分支（回车=默认简单口令 / y=复杂随机 / n=自定义）
    console.log('');
    console.log(`${colors.cyan}[安全配置]${colors.reset}`);
    const existingUsers = await existingUserCount();
    if (existingUsers > 0) {
      // 库已有账号：INITIAL_ADMIN_PASSWORD 永不生效（后端仅 userCount===0 时建初始管理员），
      // 跳过配置并说明，避免向用户展示一个永不生效的密码
      console.log(
        `  → 数据库已有 ${existingUsers} 个账号，跳过初始管理员密码配置（已有账号密码保持不变）`
      );
    } else {
      updates.INITIAL_ADMIN_PASSWORD = await promptAdminPassword(rl);
    }

    // 显示所有密码
    console.log('');
    console.log(
      `${colors.yellow}╔════════════════════════════════════════╗${colors.reset}`
    );
    console.log(
      `${colors.yellow}║     以下密码请务必记录保存！         ║${colors.reset}`
    );
    console.log(
      `${colors.yellow}╚════════════════════════════════════════╝${colors.reset}`
    );
    console.log(
      `  ${colors.bright}数据库密码:${colors.reset} ${updates.DB_PASSWORD}`
    );
    console.log(
      `  ${colors.bright}Redis密码:${colors.reset} ${updates.REDIS_PASSWORD || '无密码'}`
    );
    console.log(
      `  ${colors.bright}管理员密码:${colors.reset} ${
        updates.INITIAL_ADMIN_PASSWORD || '（已有账号，保持不变）'
      }`
    );
    console.log('');

    // 4. 配置摘要
    console.log('');
    console.log(
      `${colors.cyan}════════════════════════════════════════${colors.reset}`
    );
    console.log(`${colors.bright}配置摘要${colors.reset}`);
    console.log(
      `${colors.cyan}════════════════════════════════════════${colors.reset}`
    );
    console.log(
      `数据库: localhost:${PORTS.postgresql}/cloudcad (用户: postgres)`
    );
    console.log(
      `Redis:  localhost:${PORTS.redis} (密码: ${updates.REDIS_PASSWORD ? '******' : '无密码'})`
    );
    console.log(
      `管理员密码: ${
        updates.INITIAL_ADMIN_PASSWORD
          ? `${updates.INITIAL_ADMIN_PASSWORD} (已在上方显示)`
          : '（已有账号，保持不变）'
      }`
    );
    console.log(`JWT密钥: 已自动生成`);
    console.log('');

    // 5. 确认配置
    const confirm = await new Promise((resolve) => {
      rl.question(`确认配置? [Y/n]: `, (ans) => {
        resolve(ans.trim().toLowerCase());
      });
    });

    if (confirm === 'n' || confirm === 'no') {
      rl.close();
      // 删除 .env，以便下次运行时重新进入引导配置
      if (fs.existsSync(BACKEND_ENV_PATH)) {
        fs.unlinkSync(BACKEND_ENV_PATH);
      }
      console.log('');
      log('yellow', '已取消配置，请重新运行');
      process.exit(0);
    }

    // 6. 写入配置
    console.log('');
    log('cyan', '正在写入配置文件...');

    // 如果任一数据库配置变更，同步更新 DATABASE_URL
    const dbConfigKeys = [
      'DB_HOST',
      'DB_PORT',
      'DB_USERNAME',
      'DB_PASSWORD',
      'DB_DATABASE',
    ];
    const hasDbConfigChange = dbConfigKeys.some((key) => updates[key]);

    if (hasDbConfigChange) {
      // DATABASE_URL 权威（ADR-0073）：未显式变更的部件优先取现有 URL 的部件，
      // 再回落 DB_* 环境变量，最后内置默认；查询参数逐字保留（勿用 DB_* 重组）。
      const cur = parseDatabaseUrl(envConfig.DATABASE_URL);
      updates.DATABASE_URL = composeDatabaseUrl({
        host: updates.DB_HOST || cur.host || envConfig.DB_HOST || 'localhost',
        port: updates.DB_PORT || cur.port || envConfig.DB_PORT || '5432',
        user: updates.DB_USERNAME || cur.user || envConfig.DB_USERNAME || 'postgres',
        password: updates.DB_PASSWORD || cur.password || envConfig.DB_PASSWORD || 'password',
        dbName: updates.DB_DATABASE || cur.dbName || envConfig.DB_DATABASE || 'cloudcad',
        query: cur.query,
      });
    }

    updateEnvFile(BACKEND_ENV_PATH, updates);
    log('green', '[✓] 配置完成！');
  } finally {
    rl.close();
  }
}

/**
 * 首次部署自动配置（数据库/Redis 随机生成 + 管理员口令三分支）
 *
 * 流程：
 * 1. 数据库 / Redis 密码随机生成并一次性展示（基础设施口令，部署后可用
 *    cli.js db:reset-password / redis:reset-password 轮换，不在本向导内编辑）
 * 2. 管理员口令三分支（回车=默认简单口令 / y=复杂随机 / n=自定义）
 * 3. 写入 .env 并展示最终生效配置，暂停等待用户记录后再启动服务
 *
 * @param {Object} [options]
 * @param {boolean} [options.interactive] 是否交互（默认 true）。
 *        false 时静默写入默认值，不等待用户输入（用于非交互场景）。
 */
async function autoSetupAndShowPasswords({ interactive = true } = {}) {
  const envConfig = parseEnvFile(BACKEND_ENV_PATH);
  const updates = {};

  // JWT 密钥自动生成（无需用户编辑）
  updates.JWT_SECRET = generateJwtSecret(32);

  // 数据库 / Redis 用 10 位纯数字；管理员口令走三分支（默认简单口令）
  const dbPassword = generateNumericPassword(10);
  const redisPassword = generateNumericPassword(10);

  if (!interactive) {
    updates.DB_PASSWORD = dbPassword;
    updates.REDIS_PASSWORD = redisPassword;
    // 库已有账号 → 不写 INITIAL_ADMIN_PASSWORD（永不生效，见 existingUserCount 注释）
    if (!((await existingUserCount()) > 0)) {
      updates.INITIAL_ADMIN_PASSWORD = DEFAULT_ADMIN_PASSWORD;
    }
    writeFinalEnv(updates, envConfig);
    return true;
  }

  console.log('');
  console.log(`${colors.cyan}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}${brandBox(`${PRODUCT_NAME} 首次部署配置`, 36)}${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  console.log(`${colors.bright}默认配置：${colors.reset}`);
  console.log(`  ${colors.bright}数据库:${colors.reset}     ${envConfig.DB_HOST || 'localhost'}:${envConfig.DB_PORT || '5432'}/${envConfig.DB_DATABASE || 'cloudcad'} (用户: ${envConfig.DB_USERNAME || 'postgres'})`);
  console.log(`  ${colors.bright}Redis:${colors.reset}      ${envConfig.REDIS_HOST || 'localhost'}:${envConfig.REDIS_PORT || '6379'}`);
  console.log(`  ${colors.bright}管理员:${colors.reset}     ${envConfig.INITIAL_ADMIN_USERNAME || 'admin'}`);
  console.log(`  ${colors.bright}配置中心:${colors.reset}   http://localhost:${envConfig.CONFIG_SERVICE_PORT || '3002'}`);
  console.log(`  ${colors.bright}管理员登录:${colors.reset} http://localhost:${envConfig.FRONTEND_PORT || PORTS.frontend}${getAdminLoginPath()}`);
  console.log('');
  console.log(`${colors.yellow}  已自动生成以下密码：${colors.reset}`);
  console.log('');
  console.log(`  ${colors.bright}数据库密码:${colors.reset}     ${dbPassword}`);
  console.log(`  ${colors.bright}Redis 密码:${colors.reset}    ${redisPassword}`);
  console.log('');
  console.log(`${colors.cyan}数据库 / Redis 密码如需更换，部署后可执行：${colors.reset}`);
  console.log(
    `${colors.cyan}  cli.js db:reset-password / redis:reset-password${colors.reset}`
  );
  console.log('');

  // 管理员口令三分支（回车=默认简单口令 / y=复杂随机 / n=自定义）
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  updates.DB_PASSWORD = dbPassword;
  updates.REDIS_PASSWORD = redisPassword;
  const existingUsers = await existingUserCount();
  if (existingUsers > 0) {
    // 库已有账号：INITIAL_ADMIN_PASSWORD 永不生效，跳过配置并说明
    console.log(
      `  → 数据库已有 ${existingUsers} 个账号，跳过初始管理员密码配置（已有账号密码保持不变）`
    );
  } else {
    updates.INITIAL_ADMIN_PASSWORD = await promptAdminPassword(rl);
  }
  rl.close();

  // 写入 .env
  writeFinalEnv(updates, envConfig);

  // 展示最终生效的密码
  console.log('');
  console.log(`${colors.green}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.green}║     最终生效的部署配置（请妥善保管）   ║${colors.reset}`);
  console.log(`${colors.green}╚════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  console.log(`  ${colors.bright}数据库密码:${colors.reset}     ${updates.DB_PASSWORD}`);
  console.log(`  ${colors.bright}Redis 密码:${colors.reset}    ${updates.REDIS_PASSWORD}`);
  console.log(`  ${colors.bright}管理员账号:${colors.reset} ${envConfig.INITIAL_ADMIN_USERNAME || 'admin'}`);
  console.log(
    `  ${colors.bright}管理员密码:${colors.reset}    ${
      updates.INITIAL_ADMIN_PASSWORD || '（已有账号，保持不变）'
    }`
  );
  console.log(`  ${colors.bright}配置中心:${colors.reset}   http://localhost:${envConfig.CONFIG_SERVICE_PORT || 3002}`);
  console.log(`  ${colors.bright}管理员登录:${colors.reset} http://localhost:${envConfig.FRONTEND_PORT || PORTS.frontend}${getAdminLoginPath()}`);
  console.log('');
  if (updates.INITIAL_ADMIN_PASSWORD) {
    console.log(`${colors.red}  ─────────────────────────────────────────${colors.reset}`);
    console.log(
      updates.INITIAL_ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD
        ? `${colors.red}  ⚠ 管理员使用的是默认简单密码，请立即登录修改！${colors.reset}`
        : `${colors.red}  ⚠ 安全提醒：登录后请及时修改管理员密码！${colors.reset}`
    );
    console.log(`${colors.red}  ─────────────────────────────────────────${colors.reset}`);
  }
  console.log('');

  // 展示最终密码后暂停等待，避免后续服务启动日志刷屏覆盖密码
  // 确保用户记录下确认后的密码，再继续启动部署
  await new Promise((resolve) => {
    const confirmRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    confirmRl.question(
      `${colors.yellow}请记录以上密码，按回车键继续部署...${colors.reset}`,
      () => {
        confirmRl.close();
        resolve();
      }
    );
  });
  console.log('');
  return true;
}

/**
 * 根据最终密码同步 DATABASE_URL 并写入 .env
 * @param {Record<string,string>} updates 待写入的配置（需含 DB_PASSWORD）
 * @param {Record<string,string>} envConfig 现有 .env 配置
 */
async function writeFinalEnv(updates, envConfig) {
  // 同步更新 DATABASE_URL：已确认的新密码（updates.DB_PASSWORD）为权威，其余部件
  // 回落链与写入器 1 一致；查询参数逐字保留（勿用 DB_* 重组）。
  const cur = parseDatabaseUrl(envConfig.DATABASE_URL);
  updates.DATABASE_URL = composeDatabaseUrl({
    host: envConfig.DB_HOST || cur.host || 'localhost',
    port: envConfig.DB_PORT || cur.port || '5432',
    user: envConfig.DB_USERNAME || cur.user || 'postgres',
    password: updates.DB_PASSWORD || cur.password || envConfig.DB_PASSWORD || 'password',
    dbName: envConfig.DB_DATABASE || cur.dbName || 'cloudcad',
    query: cur.query,
  });
  // 标记密码已确认（供 CLI 判断后续启动命令是否仍需首次密码确认）
  updates.PASSWORD_INITIALIZED = '1';
  updateEnvFile(BACKEND_ENV_PATH, updates);
}

/**
 * 展示当前部署配置与密码（首次部署后展示）
 */
function showCurrentPasswords() {
  if (!state.isFirstDeploy) return;
  if (!fs.existsSync(BACKEND_ENV_PATH)) return;
  const envConfig = parseEnvFile(BACKEND_ENV_PATH);
  const dbPassword = envConfig.DB_PASSWORD;
  const redisPassword = envConfig.REDIS_PASSWORD;
  const adminPassword = envConfig.INITIAL_ADMIN_PASSWORD;
  const adminUsername = envConfig.INITIAL_ADMIN_USERNAME || 'admin';
  // 管理员登录入口路径 + 前端端口（拼出完整登录 URL，供用户直接访问）
  const adminLoginPath = getAdminLoginPath();
  const frontendPort = envConfig.FRONTEND_PORT || PORTS.frontend;

  if (dbPassword || adminPassword) {
    console.log('');
    console.log(`${colors.yellow}╔════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.yellow}║     当前部署配置（请妥善保管）        ║${colors.reset}`);
    console.log(`${colors.yellow}╚════════════════════════════════════════╝${colors.reset}`);
    console.log('');
    console.log(`  ${colors.bright}数据库:${colors.reset}     ${envConfig.DB_HOST || 'localhost'}:${envConfig.DB_PORT || '5432'}/${envConfig.DB_DATABASE || 'cloudcad'}`);
    console.log(`  ${colors.bright}数据库密码:${colors.reset} ${dbPassword || '(未设置)'}`);
    console.log(`  ${colors.bright}Redis:${colors.reset}      ${envConfig.REDIS_HOST || 'localhost'}:${envConfig.REDIS_PORT || '6379'}`);
    console.log(`  ${colors.bright}Redis 密码:${colors.reset} ${redisPassword || '(无密码)'}`);
    console.log(`  ${colors.bright}管理员账号:${colors.reset} ${adminUsername}`);
    console.log(`  ${colors.bright}管理员密码:${colors.reset} ${adminPassword || '(未设置)'}`);
    console.log(`  ${colors.bright}配置中心:${colors.reset}   http://localhost:${envConfig.CONFIG_SERVICE_PORT || '3002'}`);
    console.log(`  ${colors.bright}管理员登录:${colors.reset} http://localhost:${frontendPort}${adminLoginPath}`);
    console.log('');
    console.log(`${colors.red}  ─────────────────────────────────────────${colors.reset}`);
    console.log(`${colors.red}  ⚠ 安全提醒：登录后请立即修改管理员密码！${colors.reset}`);
    console.log(`${colors.red}  ─────────────────────────────────────────${colors.reset}`);
    console.log('');
  }
}

module.exports = {
  isPasswordWeak,
  generateRandomPassword,
  generateNumericPassword,
  generateJwtSecret,
  generateStrongPassword,
  promptAdminPassword,
  runSetupWizard,
  autoSetupAndShowPasswords,
  showCurrentPasswords,
};
