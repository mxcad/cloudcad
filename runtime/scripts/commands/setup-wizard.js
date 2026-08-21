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
const { getAdminLoginPath } = require('../lib/admin-login');
const {
  promptPassword,
  promptPasswordWithConfirm,
} = require('../lib/prompt');
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
  const defaultAdminPassword = envConfig.INITIAL_ADMIN_PASSWORD || 'Admin123!';

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

    // 3. 管理员密码 - 不填写时自动生成
    console.log('');
    console.log(`${colors.cyan}[安全配置]${colors.reset}`);
    console.log(`${colors.yellow}提示: 直接回车将自动生成密码${colors.reset}`);
    const adminPassword = await promptPasswordWithConfirm(
      rl,
      '管理员密码',
      '[回车自动生成]'
    );

    let finalAdminPassword;
    if (adminPassword) {
      finalAdminPassword = adminPassword;
      updates.INITIAL_ADMIN_PASSWORD = adminPassword;
    } else {
      // 自动生成
      finalAdminPassword = generateRandomPassword();
      updates.INITIAL_ADMIN_PASSWORD = finalAdminPassword;
      console.log(`  → 已自动生成管理员密码`);
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
      `  ${colors.bright}管理员密码:${colors.reset} ${finalAdminPassword}`
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
      `管理员密码: ${updates.INITIAL_ADMIN_PASSWORD || '******'} (已在上方显示)`
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
      // 删除 .env 文件，以便下次运行时重新进入引导配置
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
      const dbHost = updates.DB_HOST || envConfig.DB_HOST || 'localhost';
      const dbPort = updates.DB_PORT || envConfig.DB_PORT || '5432';
      const dbName = updates.DB_DATABASE || envConfig.DB_DATABASE || 'cloudcad';
      const dbUser = updates.DB_USERNAME || envConfig.DB_USERNAME || 'postgres';
      const dbPassword =
        updates.DB_PASSWORD || envConfig.DB_PASSWORD || 'password';
      const encodedPassword = encodeURIComponent(dbPassword);
      updates.DATABASE_URL = `postgresql://${dbUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbName}`;
    }

    updateEnvFile(BACKEND_ENV_PATH, updates);
    log('green', '[✓] 配置完成！');
  } finally {
    rl.close();
  }
}

/**
 * 编辑单个密码项：展示当前（默认自动生成）的值，回车保留，输入则替换并二次确认。
 * @param {readline.Interface} rl
 * @param {string} label 配置项名称
 * @param {string} currentValue 当前值（自动生成的默认值）
 * @returns {Promise<string>} 最终采用的值
 */
async function editPassword(rl, label, currentValue) {
  // 提示信息单独输出（隐藏输入需要），说明当前值和操作方式
  process.stdout.write(
    `${colors.cyan}${label}${colors.reset} [当前: ${colors.bright}${currentValue}${colors.reset}，回车保留 / 输入修改]: `
  );

  const first = await promptPassword(rl, '');

  // 回车 → 保留自动生成的值
  if (!first.trim()) {
    console.log(`  → 保留自动生成值`);
    return currentValue;
  }

  // 输入新值 → 二次确认
  const second = await promptPassword(rl, `再次输入确认: `);
  if (first !== second) {
    console.log(`  ✗ 两次输入不一致，请重新输入`);
    return editPassword(rl, label, currentValue);
  }
  console.log(`  ✓ 已修改`);
  return first.trim();
}

/**
 * 首次部署自动配置（整体确认 → 逐项编辑）
 *
 * 流程：
 * 1. 自动生成所有密码作为默认值，一次性展示
 * 2. 询问用户是否确认使用这些自动生成的密码：
 *    - 确认 → 全部直接写入 .env（一步到位）
 *    - 不确认 → 进入逐项编辑：每项回车保留该项自动生成值，或输入新值替换（二次确认）
 * 3. 最终写入 .env 并展示生效配置，确保用户看到密码后才继续启动后端
 *
 * @param {Object} [options]
 * @param {boolean} [options.interactive] 是否交互（默认 true）。
 *        false 时静默自动生成并写入，不等待用户输入（用于非交互场景）。
 */
async function autoSetupAndShowPasswords({ interactive = true } = {}) {
  const envConfig = parseEnvFile(BACKEND_ENV_PATH);
  const updates = {};

  // JWT 密钥自动生成（无需用户编辑）
  updates.JWT_SECRET = generateJwtSecret(32);

  // 自动生成默认密码（10位纯数字）
  const dbPassword = generateNumericPassword(10);
  const redisPassword = generateNumericPassword(10);
  const adminPassword = generateNumericPassword(10);

  if (!interactive) {
    updates.DB_PASSWORD = dbPassword;
    updates.REDIS_PASSWORD = redisPassword;
    updates.INITIAL_ADMIN_PASSWORD = adminPassword;
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
  console.log(`${colors.yellow}  已自动生成以下安全密码：${colors.reset}`);
  console.log('');
  console.log(`  ${colors.bright}数据库密码:${colors.reset}     ${dbPassword}`);
  console.log(`  ${colors.bright}Redis 密码:${colors.reset}    ${redisPassword}`);
  console.log(`  ${colors.bright}管理员密码:${colors.reset}    ${adminPassword}`);
  console.log('');

  // 第一步：整体确认是否使用自动生成的密码
  // 语义：直接回车或 y/Y = 全部使用自动生成密码；输入 n/N（不区分大小写）= 逐项修改
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let confirmed = false;
  let confirmedFlag = false;
  while (!confirmedFlag) {
    const ans = await new Promise((resolve) => {
      rl.question(
        `${colors.yellow}是否确认使用以上自动生成的密码？(直接回车=全部使用 / 输入 n=逐项修改): ${colors.reset}`,
        (a) => resolve(a.trim().toLowerCase())
      );
    });
    if (ans === '' || ans === 'y' || ans === 'yes') {
      confirmed = true;
      confirmedFlag = true;
    } else if (ans === 'n' || ans === 'no') {
      confirmed = false;
      confirmedFlag = true;
    } else {
      console.log(`${colors.yellow}  请直接回车使用全部自动生成密码，或输入 n 进入逐项修改。${colors.reset}`);
    }
  }

  if (confirmed) {
    updates.DB_PASSWORD = dbPassword;
    updates.REDIS_PASSWORD = redisPassword;
    updates.INITIAL_ADMIN_PASSWORD = adminPassword;
  } else {
    // 第二步：用户不确认 → 逐项编辑（每项回车保留自动生成值，或输入修改）
    console.log('');
    console.log(`${colors.cyan}请逐项确认密码（回车保留自动生成值，输入可修改）：${colors.reset}`);
    console.log('');
    updates.DB_PASSWORD = await editPassword(rl, '数据库密码', dbPassword);
    updates.REDIS_PASSWORD = await editPassword(rl, 'Redis 密码', redisPassword);
    updates.INITIAL_ADMIN_PASSWORD = await editPassword(
      rl,
      '管理员密码',
      adminPassword
    );
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
  console.log(`  ${colors.bright}管理员密码:${colors.reset}    ${updates.INITIAL_ADMIN_PASSWORD}`);
  console.log(`  ${colors.bright}配置中心:${colors.reset}   http://localhost:${envConfig.CONFIG_SERVICE_PORT || '3002'}`);
  console.log(`  ${colors.bright}管理员登录:${colors.reset} http://localhost:${envConfig.FRONTEND_PORT || PORTS.frontend}${getAdminLoginPath()}`);
  console.log('');
  console.log(`${colors.red}  ─────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.red}  ⚠ 安全提醒：登录后请立即修改管理员密码！${colors.reset}`);
  console.log(`${colors.red}  ─────────────────────────────────────────${colors.reset}`);
  console.log('');

  // 展示最终密码后暂停等待，避免后续服务启动日志刷屏覆盖密码
  // 确保用户记录下确认后的密码，再继续启动部署
  await new Promise((resolve) => {
    const confirmRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    confirmRl.question(
      `${colors.yellow}请记录以上确认后的密码，按回车键继续部署...${colors.reset}`,
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
  // 同步更新 DATABASE_URL
  const dbHost = envConfig.DB_HOST || 'localhost';
  const dbPort = envConfig.DB_PORT || '5432';
  const dbName = envConfig.DB_DATABASE || 'cloudcad';
  const dbUser = envConfig.DB_USERNAME || 'postgres';
  const encodedPassword = encodeURIComponent(updates.DB_PASSWORD);
  updates.DATABASE_URL = `postgresql://${dbUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbName}`;
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
  runSetupWizard,
  autoSetupAndShowPasswords,
  showCurrentPasswords,
};
