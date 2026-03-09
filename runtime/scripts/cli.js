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

// 首先设置离线环境（必须在其他模块加载前执行）
const { setup: setupOffline } = require('./setup-offline');
setupOffline(true); // 静默模式

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
  if (!PM2_JS || !fs.existsSync(PM2_JS)) {
    log('red', '[错误] PM2 不可用');
    return false;
  }
  return runCommand(NODE_EXE, [PM2_JS, ...args], {
    ...options,
    env: {
      ...options.env,
      PM2_HOME,
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
  
  const ecosystemPath = path.join(RUNTIME_DIR, 'ecosystem.config.js');
  
  if (PM2_JS && fs.existsSync(PM2_JS) && USE_RUNTIME) {
    // 先停止旧进程
    runPm2(['delete', 'all'], { silent: true });
    // 启动基础服务
    if (!runPm2(['start', ecosystemPath, '--only', 'postgresql,redis,cooperate'])) {
      log('red', '[错误] 基础服务启动失败');
      return false;
    }
  } else {
    // 传统模式
    const startScript = path.join(RUNTIME_DIR, 'scripts', 'start.js');
    if (!runCommand(NODE_EXE, [startScript])) {
      log('red', '[错误] 基础服务启动失败');
      return false;
    }
  }
  
  log('green', '[✓] 基础服务已启动');
  return true;
}

async function stopInfrastructure() {
  log('blue', '停止所有服务...');
  
  if (PM2_JS && fs.existsSync(PM2_JS)) {
    runPm2(['stop', 'all']);
    runPm2(['delete', 'all'], { silent: true });
  }
  
  // 传统模式停止
  const stopScript = path.join(RUNTIME_DIR, 'scripts', 'stop.js');
  runCommand(NODE_EXE, [stopScript], { silent: true });
  
  log('green', '[✓] 服务已停止');
}

async function runDatabaseMigration() {
  log('blue', '[2/3] 执行数据库迁移...');
  
  // 生成 Prisma Client
  if (!runPnpm(['--filter', 'backend', 'db:generate'])) {
    log('red', '[错误] Prisma Client 生成失败');
    return false;
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

async function deployMode() {
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
  
  // 2. 数据库迁移
  if (!await runDatabaseMigration()) {
    return;
  }
  
  // 3. 构建前后端
  log('blue', '[3/5] 清理旧构建文件...');
  
  // 清理 dist 目录，避免 ENOTEMPTY 错误
  const backendDist = path.join(PROJECT_ROOT, 'packages', 'backend', 'dist');
  const frontendDist = path.join(PROJECT_ROOT, 'packages', 'frontend', 'dist');
  
  rimdir(backendDist);
  rimdir(frontendDist);
  log('green', '[✓] 清理完成');
  
  log('blue', '[4/5] 构建前后端...');
  
  if (!runPnpm(['build'])) {
    log('red', '[错误] 构建失败');
    return;
  }
  
  log('green', '[✓] 构建完成');
  
  // 4. 启动/更新生产服务
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

// 命令行参数支持
const args = process.argv.slice(2);
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
    cmd();
  } else {
    log('red', `未知命令: ${args[0]}`);
    log('cyan', '可用命令: dev, deploy, start, stop, migrate, seed, init, status, logs');
    process.exit(1);
  }
} else {
  main();
}