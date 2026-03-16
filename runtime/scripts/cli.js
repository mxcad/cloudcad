/**
 * CloudCAD 运维 CLI（交互式）
 * 
 * 使用方式：
 *   node runtime/scripts/cli.js
 * 
 * 功能：
 *   - 开发模式：启动基础服务 + 数据库迁移 + 前后端开发服务器
 *   - 部署模式：启动基础服务 + 数据库迁移 + 构建部署
 *   - 基础服务：仅启动 PostgreSQL/Redis/Cooperate
 *   - 数据库操作：迁移、种子数据
 */

const readline = require('readline');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 导入离线环境设置函数（异步）
const { setup: setupOffline, checkPrismaClientExists } = require('./setup-offline');

// 判断是否是部署模式
const args = process.argv.slice(2);
const isDeployMode = args[0] === 'deploy';

// ==================== 配置 ====================

const PLATFORM = os.platform();
const IS_WINDOWS = PLATFORM === 'win32';
const IS_LINUX = PLATFORM === 'linux';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_DIR = path.resolve(__dirname, '..');
const PLATFORM_DIR = IS_WINDOWS 
  ? path.join(RUNTIME_DIR, 'windows')
  : path.join(RUNTIME_DIR, 'linux');

const USE_RUNTIME = fs.existsSync(PLATFORM_DIR);
const DATA_DIR = path.join(PROJECT_ROOT, 'offline-data');
const PM2_HOME = path.join(DATA_DIR, 'pm2');

// 可执行文件路径
const NODE_EXE = USE_RUNTIME
  ? (IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'node', 'node.exe')
      : path.join(PLATFORM_DIR, 'node', 'bin', 'node'))
  : 'node';

const PM2_JS = USE_RUNTIME
  ? (IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'node', 'node_modules', 'pm2', 'bin', 'pm2')
      : path.join(PLATFORM_DIR, 'node', 'bin', 'node_modules', 'pm2', 'bin', 'pm2'))
  : null;

// PM2 包装脚本路径（确保 PM2 daemon 能找到 node）
const PM2_CMD = USE_RUNTIME
  ? (IS_WINDOWS
      ? path.join(PROJECT_ROOT, 'pm2.cmd')
      : path.join(PROJECT_ROOT, 'pm2'))
  : 'pm2';

const PNPM_JS = USE_RUNTIME
  ? path.join(PLATFORM_DIR, 'node', 'node_modules', 'corepack', 'dist', 'pnpm.js')
  : null;

// ==================== 工具函数 ====================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(color, message) {
  console.log(`${colors[color] || ''}${message}${colors.reset}`);
}

function clearScreen() {
  console.clear();
}

function printHeader() {
  console.log('');
  console.log(`${colors.bright}${colors.cyan}╔══════════════════════════════════════════╗`);
  console.log(`║        CloudCAD 运维管理中心             ║`);
  console.log(`╚══════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  console.log(`  平台: ${PLATFORM}`);
  console.log(`  模式: ${USE_RUNTIME ? '内嵌 runtime' : '系统环境'}`);
  console.log(`  PM2:  ${PM2_JS && fs.existsSync(PM2_JS) ? '可用' : '不可用'}`);
  console.log('');
}

// ==================== 执行函数 ====================

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    stdio: options.silent ? 'pipe' : 'inherit',
    shell: IS_WINDOWS,
    env: {
      ...process.env,
      ...options.env,
    },
  });
  return result.status === 0;
}

function runPnpm(args, options = {}) {
  if (PNPM_JS && fs.existsSync(PNPM_JS)) {
    return runCommand(NODE_EXE, [PNPM_JS, ...args], options);
  }
  return runCommand('pnpm', args, options);
}

function runPm2(args, options = {}) {
  // 优先使用 pm2.cmd/pm2 包装脚本，确保 PM2 daemon 能找到 node
  // 包装脚本会设置 PATH，daemon 继承后能正确 spawn('node', ...)
  if (PM2_CMD && fs.existsSync(PM2_CMD)) {
    return runCommand(PM2_CMD, args, {
      ...options,
      env: {
        ...options.env,
        PM2_HOME,
      },
    });
  }

  // 回退：直接使用 node 运行 pm2.js（需要手动设置 PATH）
  if (!PM2_JS || !fs.existsSync(PM2_JS)) {
    log('red', '[错误] PM2 不可用');
    return false;
  }

  const nodeDir = path.dirname(NODE_EXE);
  const existingPath = process.env.PATH || '';
  const newPath = USE_RUNTIME
    ? (IS_WINDOWS ? `${nodeDir};${existingPath}` : `${nodeDir}:${existingPath}`)
    : existingPath;

  return runCommand(NODE_EXE, [PM2_JS, ...args], {
    ...options,
    env: {
      ...options.env,
      PM2_HOME,
      PATH: newPath,
    },
  });
}

function runInNewWindow(title, command, args) {
  if (IS_WINDOWS) {
    const cmd = args.length > 0 
      ? `start "${title}" cmd /k "${command} ${args.join(' ')}"`
      : `start "${title}" cmd /k "${command}"`;
    spawn('cmd', ['/c', cmd], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
      shell: true,
    }).unref();
  } else {
    // Linux: 使用 gnome-terminal 或 xterm
    const terminal = process.env.TERM_PROGRAM || 'xterm';
    spawn(terminal, ['-e', `${command} ${args.join(' ')}`], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
    }).unref();
  }
}

// ==================== 业务逻辑 ====================

async function startInfrastructure() {
  log('blue', '[1/3] 启动基础服务...');
  
  if (!PM2_JS || !fs.existsSync(PM2_JS) || !USE_RUNTIME) {
    log('red', '[错误] PM2 不可用，请确保 runtime 环境已正确安装');
    return false;
  }
  
  const ecosystemPath = path.join(RUNTIME_DIR, 'ecosystem.config.js');
  
  // 先停止旧进程
  runPm2(['delete', 'all'], { silent: true });
  // 启动基础服务（包含部署配置中心）
  if (!runPm2(['start', ecosystemPath, '--only', 'postgresql,redis,cooperate,config-service'])) {
    log('red', '[错误] 基础服务启动失败');
    return false;
  }
  
  log('green', '[✓] 基础服务已启动');
  return true;
}

async function stopInfrastructure() {
  log('blue', '停止所有服务...');
  
  // 1. 调用各管理脚本的 stop 命令
  const pgManagerScript = path.join(RUNTIME_DIR, 'scripts', 'pg-manager.js');
  const redisManagerScript = path.join(RUNTIME_DIR, 'scripts', 'redis-manager.js');
  
  if (fs.existsSync(pgManagerScript)) {
    log('cyan', '停止 PostgreSQL...');
    runCommand(NODE_EXE, [pgManagerScript, 'stop'], { silent: true });
  }
  
  // Redis 没有独立的 stop 命令，后面通过进程名处理
  
  // 2. 停止 PM2 管理的进程
  if (PM2_JS && fs.existsSync(PM2_JS)) {
    runPm2(['stop', 'all'], { silent: true });
    runPm2(['delete', 'all'], { silent: true });
    // 停止 PM2 daemon
    runPm2(['kill'], { silent: true });
  }
  
  // 3. 通过进程名杀死残留进程（兜底）
  if (IS_WINDOWS) {
    const processNames = [
      { exe: 'postgres.exe', name: 'PostgreSQL' },
      { exe: 'redis-server.exe', name: 'Redis' },
      { exe: 'mxcadassembly.exe', name: 'Cooperate' },
      { exe: 'node.exe', name: 'Node.js' },
    ];
    
    for (const proc of processNames) {
      const result = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${proc.exe}`, '/FO', 'CSV', '/NH'], {
        encoding: 'utf8',
        shell: true,
      });
      
      const lines = result.stdout.split('\n').filter(line => line.includes(proc.exe));
      for (const line of lines) {
        const match = line.match(/"([^"]+)"/g);
        if (match && match.length >= 2) {
          const pid = match[1].replace(/"/g, '');
          if (pid && pid !== 'PID') {
            log('cyan', `停止 ${proc.name} (PID: ${pid})...`);
            spawnSync('taskkill', ['/F', '/PID', pid], { shell: true, stdio: 'pipe' });
          }
        }
      }
    }
  } else {
    // Linux: 通过进程名杀死
    const processNames = ['postgres', 'redis-server', 'mxcadassembly', 'node'];
    for (const name of processNames) {
      spawnSync('pkill', ['-f', name], { stdio: 'pipe' });
    }
  }
  
  log('green', '[✓] 服务已停止');
}

async function runDatabaseMigration() {
  log('blue', '[2/3] 执行数据库迁移...');
  
  // 检查 .env 文件是否存在
  const envPath = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');
  if (!fs.existsSync(envPath)) {
    log('red', '[错误] packages/backend/.env 文件不存在');
    log('cyan', '请先配置数据库连接信息');
    return false;
  }
  
  // 检查 Prisma Client 是否已存在（部署包预生成）
  const prismaReady = checkPrismaClientExists();
  
  if (prismaReady) {
    log('cyan', '[跳过] Prisma Client 已就绪（来自部署包）');
  } else {
    // 生成 Prisma Client（离线模式，使用预下载的引擎）
    log('cyan', '生成 Prisma Client...');
    if (!runPnpm(['--filter', 'backend', 'db:generate'])) {
      log('red', '[错误] Prisma Client 生成失败');
      return false;
    }
  }
  
  // 执行迁移
  if (!runPnpm(['--filter', 'backend', 'db:push'])) {
    log('red', '[错误] 数据库迁移失败');
    return false;
  }
  
  log('green', '[✓] 数据库迁移完成');
  return true;
}

async function runDatabaseSeed() {
  log('blue', '执行种子数据...');
  
  if (!runPnpm(['--filter', 'backend', 'db:seed'])) {
    log('red', '[错误] 种子数据执行失败');
    return false;
  }
  
  log('green', '[✓] 种子数据完成');
  return true;
}

async function devMode() {
  clearScreen();
  printHeader();
  log('bright', '>>> 开发模式');
  console.log('');
  
  // 1. 启动基础服务
  if (!await startInfrastructure()) {
    return;
  }
  
  // 等待服务就绪
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 2. 数据库迁移
  if (!await runDatabaseMigration()) {
    return;
  }
  
  // 3. 启动开发服务器（新窗口）
  log('blue', '[3/3] 启动开发服务器...');
  
  runInNewWindow('CloudCAD Backend', 'pnpm', ['--filter', 'backend', 'dev']);
  runInNewWindow('CloudCAD Frontend', 'pnpm', ['--filter', 'frontend', 'dev']);
  
  console.log('');
  log('green', '╔════════════════════════════════════════╗');
  log('green', '║        开发环境已就绪                   ║');
  log('green', '╠════════════════════════════════════════╣');
  log('green', '║  后端:  http://localhost:3001           ║');
  log('green', '║  前端:  http://localhost:3000           ║');
  log('green', '║  API:   http://localhost:3001/api       ║');
  log('green', '║  配置:  http://localhost:3002           ║');
  log('green', '╠════════════════════════════════════════╣');
  log('green', '║  停止:  选择菜单 [停止服务]             ║');
  log('green', '╚════════════════════════════════════════╝');
}

// 递归删除目录
function rimdir(dir) {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach((file) => {
      const curPath = path.join(dir, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        rimdir(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dir);
  }
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

async function deployMode(skipBuild = false) {
  clearScreen();
  printHeader();
  log('bright', '>>> 部署模式');
  console.log('');
  
  // 1. 启动基础服务
  if (!await startInfrastructure()) {
    return;
  }
  
  // 等待服务就绪
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 2. 数据库迁移（依赖已在 setupOffline 中安装）
  if (!await runDatabaseMigration()) {
    return;
  }
  
  // 3. 检测是否已有构建产物
  const backendDist = path.join(PROJECT_ROOT, 'packages', 'backend', 'dist');
  const frontendDist = path.join(PROJECT_ROOT, 'packages', 'frontend', 'dist');
  
  const hasBackendDist = fs.existsSync(backendDist) && fs.readdirSync(backendDist).length > 0;
  const hasFrontendDist = fs.existsSync(frontendDist) && fs.readdirSync(frontendDist).length > 0;
  const hasDist = hasBackendDist && hasFrontendDist;
  
  let shouldBuild = true;
  
  if (skipBuild) {
    if (!hasBackendDist) {
      log('red', '[错误] 指定了 --skip-build 但构建产物不存在');
      return;
    }
    log('green', '[3/5] 跳过构建，使用现有 dist');
    shouldBuild = false;
  } else if (hasDist) {
    log('yellow', '[3/5] 检测到已有构建产物');
    console.log('');
    log('cyan', '  后端 dist: ' + (hasBackendDist ? '✓ 存在' : '✗ 不存在'));
    log('cyan', '  前端 dist: ' + (hasFrontendDist ? '✓ 存在' : '✗ 不存在'));
    console.log('');
    
    // 询问用户是否重新构建
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    const answer = await new Promise((resolve) => {
      rl.question(`${colors.yellow}是否重新构建？(y/N): ${colors.reset}`, (ans) => {
        rl.close();
        resolve(ans.trim().toLowerCase());
      });
    });
    
    shouldBuild = answer === 'y' || answer === 'yes';
    
    if (!shouldBuild) {
      log('green', '[✓] 跳过构建，使用现有 dist');
    }
  }
  
  // 4. 构建前后端（如果需要）
  if (shouldBuild) {
    log('blue', '[3/5] 清理旧构建文件...');
    rimdir(backendDist);
    rimdir(frontendDist);
    log('green', '[✓] 清理完成');
    
    log('blue', '[4/5] 构建前后端...');
    
    if (!runPnpm(['build'])) {
      log('red', '[错误] 构建失败');
      return;
    }
    
    log('green', '[✓] 构建完成');
  }
  
  // 5. 启动/更新生产服务
  log('blue', '[5/5] 启动生产服务...');
  
  // 检查服务是否已运行
  const backendRunning = isServiceRunning('backend');
  const frontendRunning = isServiceRunning('frontend');
  
  // 使用 PM2 启动后端
  const backendConfig = {
    name: 'backend',
    script: path.join(PROJECT_ROOT, 'packages', 'backend', 'dist', 'src', 'main.js'),
    cwd: path.join(PROJECT_ROOT, 'packages', 'backend'),
    autorestart: true,
    watch: false,
    max_restarts: 10,
    env: {
      NODE_ENV: 'production',
    },
  };
  
  // 前端静态服务配置
  const frontendConfig = {
    name: 'frontend',
    script: path.join(RUNTIME_DIR, 'scripts', 'serve-static.js'),
    cwd: PROJECT_ROOT,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    env: {
      NODE_ENV: 'production',
    },
  };
  
  // 写入临时配置
  const tempConfigPath = path.join(DATA_DIR, 'pm2-deploy.config.js');
  fs.writeFileSync(tempConfigPath, `module.exports = { apps: [${JSON.stringify(backendConfig)}, ${JSON.stringify(frontendConfig)}] };`);
  
  if (backendRunning || frontendRunning) {
    log('yellow', '检测到服务已在运行，正在重启更新...');
    runPm2(['restart', tempConfigPath]);
  } else {
    runPm2(['start', tempConfigPath]);
  }
  
  console.log('');
  log('green', '╔════════════════════════════════════════╗');
  log('green', '║        部署环境已就绪                   ║');
  log('green', '╠════════════════════════════════════════╣');
  log('green', '║  后端:  http://localhost:3001           ║');
  log('green', '║  前端:  http://localhost:3000           ║');
  log('green', '║  API:   http://localhost:3001/api       ║');
  log('green', '║  配置:  http://localhost:3002           ║');
  log('green', '╠════════════════════════════════════════╣');
  log('green', '║  状态:  选择菜单 [查看状态]             ║');
  log('green', '║  日志:  选择菜单 [查看日志]             ║');
  log('green', '║  停止:  选择菜单 [停止服务]             ║');
  log('green', '╚════════════════════════════════════════╝');
}



async function startOnly() {
  clearScreen();
  printHeader();
  log('bright', '>>> 启动基础服务');
  console.log('');
  
  if (!await startInfrastructure()) {
    return;
  }
  
  console.log('');
  log('green', '[✓] 基础服务已启动');
  log('cyan', '  PostgreSQL: localhost:5432');
  log('cyan', '  Redis:      localhost:6379');
  log('cyan', '  协同服务:   localhost:3091');
  log('cyan', '  配置中心:   localhost:3002');
}

async function viewStatus() {
  clearScreen();
  printHeader();
  log('bright', '>>> 服务状态');
  console.log('');
  
  if (PM2_JS && fs.existsSync(PM2_JS)) {
    runPm2(['status']);
  } else {
    log('yellow', 'PM2 不可用，无法查看状态');
  }
}

async function viewLogs() {
  clearScreen();
  printHeader();
  log('bright', '>>> 服务日志');
  console.log('');
  
  if (PM2_JS && fs.existsSync(PM2_JS)) {
    runPm2(['logs']);
  } else {
    log('yellow', 'PM2 不可用，无法查看日志');
  }
}

async function linuxInit() {
  clearScreen();
  printHeader();
  log('bright', '>>> Linux 环境初始化');
  console.log('');
  
  if (!IS_LINUX) {
    log('yellow', '此功能仅适用于 Linux 系统');
    log('cyan', '当前系统: ' + PLATFORM);
    return;
  }
  
  const mxcadDir = path.join(RUNTIME_DIR, '..', 'linux', 'mxcad');
  
  if (!fs.existsSync(mxcadDir)) {
    log('yellow', `mxcad 目录不存在: ${mxcadDir}`);
    log('yellow', 'MxCAD 转换功能将不可用，请手动配置');
    return;
  }
  
  let hasError = false;
  
  // 1. 设置 mxcadassembly 可执行权限
  const mxcadAssemblyPath = path.join(mxcadDir, 'mxcadassembly');
  if (fs.existsSync(mxcadAssemblyPath)) {
    const result = spawnSync('chmod', ['+x', mxcadAssemblyPath], { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    if (result.status === 0) {
      log('green', '[✓] 已设置 mxcadassembly 可执行权限');
    } else {
      log('yellow', '[!] 设置权限失败，请手动执行: sudo chmod +x runtime/linux/mxcad/mxcadassembly');
      hasError = true;
    }
  } else {
    log('yellow', '[!] mxcadassembly 程序不存在，转换功能将不可用');
    hasError = true;
  }
  
  // 2. 设置 mx/so 目录权限
  const mxSoPath = path.join(mxcadDir, 'mx', 'so');
  if (fs.existsSync(mxSoPath)) {
    const result = spawnSync('chmod', ['-R', '755', mxSoPath], {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    if (result.status === 0) {
      log('green', '[✓] 已设置 mx/so 目录权限');
    } else {
      log('yellow', '[!] 设置权限失败，请手动执行: sudo chmod -R 755 runtime/linux/mxcad/mx/so');
      hasError = true;
    }
  }
  
  // 3. 复制 locale 文件到系统目录（需要 sudo）
  const localeSourcePath = path.join(mxcadDir, 'mx', 'locale');
  const localeTargetPath = '/usr/local/share/locale';
  if (fs.existsSync(localeSourcePath)) {
    spawnSync('mkdir', ['-p', localeTargetPath], { stdio: 'pipe' });
    
    const result = spawnSync('cp', ['-r', '-f', localeSourcePath, localeTargetPath], {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    if (result.status === 0) {
      log('green', '[✓] 已复制 locale 文件到系统目录');
    } else {
      log('yellow', '[!] 复制 locale 失败，请手动执行: sudo cp -r -f runtime/linux/mxcad/mx/locale /usr/local/share/locale');
      hasError = true;
    }
  }
  
  console.log('');
  if (hasError) {
    log('yellow', '部分初始化失败，请按上述提示手动修复');
  } else {
    log('green', 'Linux 环境初始化完成！');
  }
}

// ==================== 部署引导配置 ====================

const BACKEND_ENV_PATH = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');

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
  if ((hasDigit && !hasLetter && !hasSpecial) || 
      (hasLetter && !hasDigit && !hasSpecial)) {
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
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * 生成随机 JWT 密钥
 * @param {number} length 密钥长度，默认 32
 * @returns {string} 随机密钥
 */
function generateJwtSecret(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}|;:,.<>?';
  let secret = '';
  for (let i = 0; i < length; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return secret;
}

/**
 * 解析 .env 文件
 * @param {string} filePath .env 文件路径
 * @returns {Object} 键值对
 */
function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};
  
  content.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    
    const eqIndex = line.indexOf('=');
    if (eqIndex > 0) {
      const key = line.substring(0, eqIndex).trim();
      let value = line.substring(eqIndex + 1).trim();
      // 移除引号
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  });
  
  return result;
}

/**
 * 写入 .env 文件（保留注释和格式）
 * @param {string} filePath .env 文件路径
 * @param {Object} updates 要更新的键值对
 */
function updateEnvFile(filePath, updates) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  Object.entries(updates).forEach(([key, value]) => {
    // 匹配 key=value 或 key="value" 或 key='value'
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    }
  });
  
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * 隐藏输入密码
 * @param {readline.Interface} rl readline 接口
 * @param {string} prompt 提示信息
 * @returns {Promise<string>} 用户输入
 */
function promptPassword(rl, promptText) {
  return new Promise((resolve) => {
    const stdout = process.stdout;
    
    // 保存原始 write 方法
    const originalWrite = stdout.write.bind(stdout);
    
    // 替换 write 方法，隐藏输入
    stdout.write = (chunk, encoding, callback) => {
      if (typeof chunk === 'string' && chunk !== '\n' && chunk !== '\r\n') {
        // 不输出任何内容（隐藏输入）
        return true;
      }
      return originalWrite(chunk, encoding, callback);
    };
    
    rl.question(promptText, (answer) => {
      // 恢复原始 write 方法
      stdout.write = originalWrite;
      // 输出换行
      originalWrite('\n');
      resolve(answer);
    });
  });
}

/**
 * 运行部署引导配置
 */
async function runSetupWizard() {
  console.log('');
  console.log(`${colors.cyan}╔════════════════════════════════════════╗`);
  console.log(`║      CloudCAD 首次部署配置             ║`);
  console.log(`╚════════════════════════════════════════╝${colors.reset}`);
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
    // 1. 数据库密码
    console.log(`${colors.cyan}[核心配置]${colors.reset}`);
    const dbPassword = await promptPassword(rl, `数据库密码 [使用默认值]: `);
    
    if (dbPassword.trim()) {
      updates.DB_PASSWORD = dbPassword.trim();
      console.log(`  → 已设置自定义数据库密码`);
    } else {
      console.log(`  → 使用默认值`);
    }
    
    // 2. Redis 密码
    const redisPassword = await promptPassword(rl, `Redis 密码 [无密码]: `);
    
    if (redisPassword.trim()) {
      updates.REDIS_PASSWORD = redisPassword.trim();
      console.log(`  → 已设置 Redis 密码`);
    } else {
      console.log(`  → 无密码`);
    }
    
    // 3. 管理员密码
    console.log('');
    console.log(`${colors.cyan}[安全配置]${colors.reset}`);
    const adminPasswordRaw = await promptPassword(rl, `管理员密码 [自动生成]: `);
    const adminPassword = adminPasswordRaw.trim();
    
    if (adminPassword) {
      // 检查密码强度
      if (isPasswordWeak(adminPassword)) {
        console.log('');
        console.log(`${colors.yellow}⚠️  警告: 密码过于简单，存在安全风险${colors.reset}`);
        console.log(`   建议使用包含大小写字母、数字、特殊字符的密码`);
        console.log('');
        
        const confirmWeak = await new Promise((resolve) => {
          rl.question(`确认使用此密码? [y/N]: `, (ans) => {
            resolve(ans.trim().toLowerCase());
          });
        });
        
        if (confirmWeak !== 'y' && confirmWeak !== 'yes') {
          // 用户取消，自动生成
          const generated = generateRandomPassword();
          updates.INITIAL_ADMIN_PASSWORD = generated;
          console.log(`  → 已自动生成密码: ${generated}`);
        } else {
          updates.INITIAL_ADMIN_PASSWORD = adminPassword;
          console.log(`  → 已设置自定义管理员密码`);
        }
      } else {
        updates.INITIAL_ADMIN_PASSWORD = adminPassword;
        console.log(`  → 已设置自定义管理员密码`);
      }
    } else {
      // 自动生成
      const generated = generateRandomPassword();
      updates.INITIAL_ADMIN_PASSWORD = generated;
      console.log(`  → 已自动生成密码: ${generated}`);
    }
    
    // 4. 配置摘要
    console.log('');
    console.log(`${colors.cyan}════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}配置摘要${colors.reset}`);
    console.log(`${colors.cyan}════════════════════════════════════════${colors.reset}`);
    console.log(`数据库: localhost:5432/cloudcad (用户: postgres)`);
    console.log(`Redis:  localhost:6379 (密码: ${updates.REDIS_PASSWORD ? '******' : '无密码'})`);
    console.log(`管理员密码: ${updates.INITIAL_ADMIN_PASSWORD || defaultAdminPassword} ${adminPassword ? '' : '(自动生成)'}`);
    console.log(`JWT密钥: ${jwtSecret} (自动生成)`);
    console.log('');
    
    // 5. 确认配置
    const confirm = await new Promise((resolve) => {
      rl.question(`确认配置? [Y/n]: `, (ans) => {
        resolve(ans.trim().toLowerCase());
      });
    });
    
    if (confirm === 'n' || confirm === 'no') {
      rl.close();
      console.log('');
      log('yellow', '已取消配置，请重新运行');
      process.exit(0);
    }
    
    // 6. 写入配置
    console.log('');
    log('cyan', '正在写入配置文件...');
    
    // 如果任一数据库配置变更，同步更新 DATABASE_URL
    const dbConfigKeys = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'];
    const hasDbConfigChange = dbConfigKeys.some(key => updates[key]);
    
    if (hasDbConfigChange) {
      const dbHost = updates.DB_HOST || envConfig.DB_HOST || 'localhost';
      const dbPort = updates.DB_PORT || envConfig.DB_PORT || '5432';
      const dbName = updates.DB_DATABASE || envConfig.DB_DATABASE || 'cloudcad';
      const dbUser = updates.DB_USERNAME || envConfig.DB_USERNAME || 'postgres';
      const dbPassword = updates.DB_PASSWORD || envConfig.DB_PASSWORD || 'password';
      const encodedPassword = encodeURIComponent(dbPassword);
      updates.DATABASE_URL = `postgresql://${dbUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbName}`;
    }
    
    updateEnvFile(BACKEND_ENV_PATH, updates);
    log('green', '[✓] 配置完成！');
    
  } finally {
    rl.close();
  }
}

// ==================== 交互式菜单 ====================

const menuItems = [
  { key: '1', label: '开发模式', action: devMode },
  { key: '2', label: '部署模式', action: deployMode },
  { key: '3', label: '启动基础服务', action: startOnly },
  { key: '4', label: '数据库迁移', action: runDatabaseMigration },
  { key: '5', label: '数据库种子', action: runDatabaseSeed },
  { key: '6', label: 'Linux 初始化（首次部署）', action: linuxInit },
  { key: '7', label: '查看状态', action: viewStatus },
  { key: '8', label: '查看日志', action: viewLogs },
  { key: '9', label: '停止服务', action: stopInfrastructure },
  { key: '0', label: '退出', action: () => process.exit(0) },
];

async function showMenu() {
  clearScreen();
  printHeader();
  
  console.log(`${colors.bright}请选择操作：${colors.reset}`);
  console.log('');
  
  for (const item of menuItems) {
    console.log(`  ${colors.cyan}[${item.key}]${colors.reset} ${item.label}`);
  }
  
  console.log('');
}

async function prompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(`${colors.bright}请输入选项: ${colors.reset}`, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  while (true) {
    await showMenu();
    const choice = await prompt();
    
    const item = menuItems.find(m => m.key === choice);
    
    if (item) {
      await item.action();
      console.log('');
      await new Promise(resolve => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.question(`${colors.bright}按回车键继续...${colors.reset}`, () => {
          rl.close();
          resolve();
        });
      });
    } else {
      log('red', '无效选项，请重新选择');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// ==================== 程序入口 ====================

/**
 * 异步入口函数
 * 先完成离线环境设置，再执行后续逻辑
 */
async function bootstrap() {
  // 检测 .env 是否存在（用于判断是否首次部署）
  const envExistedBefore = fs.existsSync(BACKEND_ENV_PATH);
  
  // 首先设置离线环境（必须在其他操作前完成）
  // 这会复制 .env.example → .env（如果 .env 不存在）
  const success = await setupOffline({ 
    silent: true, 
    deployBackendOnly: isDeployMode,  // 部署模式只装后端依赖
  });
  
  if (!success) {
    process.exit(1);
  }

  // 如果 .env 之前不存在，说明是首次部署，运行引导配置
  if (!envExistedBefore) {
    await runSetupWizard();
  }

  // 命令行参数支持
  // args 已在文件开头定义
  if (args.length > 0) {
    const commandMap = {
      'dev': devMode,
      'deploy': deployMode,
      'start': startOnly,
      'stop': stopInfrastructure,
      'migrate': runDatabaseMigration,
      'seed': runDatabaseSeed,
      'init': linuxInit,
      'status': viewStatus,
      'logs': viewLogs,
    };
    
    const cmd = commandMap[args[0]];
    if (cmd) {
      // 支持 --skip-build 参数
      if (args[0] === 'deploy' && args.includes('--skip-build')) {
        await deployMode(true);
      } else {
        await cmd();
      }
    } else {
      log('red', `未知命令: ${args[0]}`);
      log('cyan', '可用命令: dev, deploy, start, stop, migrate, seed, init, status, logs');
      log('cyan', '  deploy             : 交互式部署，询问是否构建');
      log('cyan', '  deploy --skip-build: 跳过构建，使用现有 dist 并安装生产依赖');
      process.exit(1);
    }
  } else {
    await main();
  }
}

// 启动程序
bootstrap().catch(err => {
  console.error('程序启动失败:', err);
  process.exit(1);
});