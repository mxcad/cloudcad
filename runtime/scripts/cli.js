/**
 * 梦想网页CAD实时协同平台 运维 CLI（交互式）
 *
 * 使用方式：
 *   node runtime/scripts/cli.js
 *
 * 功能：
 *   - 交互式菜单：按 常用 / 部署与数据库 / 高级 / 开发环境 分组
 *     （数据在 commands/menu-sections.js，过滤与渲染在 lib/menu.js）；
 *     按平台与部署形态过滤——Windows 不显示 Linux 初始化，
 *     部署包（.deploy 标记）不显示开发模式/种子等仅开发机项
 *   - 命令行参数：dev / deploy / start / stop / migrate / seed / db:* /
 *     status / logs / init / version:check / version:verify / mfa:totp-unbind
 */

const readline = require('readline');
const { spawn, spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// 导入离线环境设置函数（异步）
const {
  setup: setupOffline,
  checkPrismaClientExists,
  fillEmptySecrets,
} = require('./setup-offline');

// 导入配置更新器
const { mergeExampleIntoEnv } = require('./config-updater');

// 导入图纸版本部署辅助
const versionHelper = require('./drawing-version-helper');

// 判断是否是部署模式
const args = process.argv.slice(2);
const isDeployMode = args[0] === 'deploy';
// isFirstDeploy 状态已迁移至 lib/state（A-1 机械拆分；A-2 收口改为显式传参）



// ==================== 配置（拆分至 lib/context，单一事实源） ====================

const {
  PLATFORM,
  IS_WINDOWS,
  IS_LINUX,
  PROJECT_ROOT,
  RUNTIME_DIR,
  PLATFORM_DIR,
  USE_RUNTIME,
  DATA_DIR,
  PM2_HOME,
  BACKEND_ENV_PATH,
  PORTS,
  getPorts,
  getMobileAccessPath,
  NODE_EXE,
  PM2_JS,
  PNPM_JS,
} = require('./lib/context');

// ==================== 工具函数（拆分至 lib/*） ====================

const { colors, log, clearScreen, printHeader } = require('./lib/logger');
const {
  openBrowser,
  checkHttpHealth,
  waitAndOpenBrowsers,
  waitForPort,
} = require('./lib/health');
const {
  runCommand,
  runCommandWithProgress,
  runPnpm,
  runPm2,
  runInNewWindow,
} = require('./lib/proc');
const { parseEnvFile, updateEnvFile } = require('./lib/env');
const {
  prompt,
  promptConfirm,
  promptPassword,
  promptPasswordWithConfirm,
} = require('./lib/prompt');
const state = require('./lib/state');

// ==================== 运维操作留痕（#418） ====================
// 每次 CLI 调用记 start 行；进程退出记 exit 行（含退出码）。
const { recordStart, installExitHook } = require('./lib/ops-log');
recordStart(args);
installExitHook();

// ==================== 命令模块（拆分至 commands/*） ====================

const {
  viewStatus,
  viewLogs,
} = require('./commands/status');
const { linuxInit } = require('./commands/init');
const { autoSetupAndShowPasswords } = require('./commands/setup-wizard');
const { showHelp } = require('./commands/help');
const {
  backupDatabase,
  listBackups,
  restoreDatabase,
  cleanupOldBackups,
} = require('./commands/db-backup');
const {
  runDatabaseMigration,
  runDatabaseSeed,
} = require('./commands/migrate');
const {
  stopInfrastructure,
  killAllInfrastructure,
} = require('./commands/stop');
const { startMode } = require('./commands/start');
const { devMode } = require('./commands/dev');
const { deployMode } = require('./commands/deploy');
const { mfaTotpUnbind } = require('./commands/mfa');


// ==================== 交互式菜单 ====================
// 数据（分组 + 可见性标记）在 commands/menu-sections.js，
// 过滤/编号/渲染逻辑在 lib/menu.js（纯函数，node --test 覆盖）。

const { menuSections } = require('./commands/menu-sections');
const { buildVisibleMenu, formatMenu } = require('./lib/menu');

// 部署机判据：仓库根存在 .deploy 标记（pack-offline 打部署/升级包时写入，
// 开发仓库无此文件）。部署包只装生产依赖，开发模式/种子对其隐藏。
const IS_DEPLOY_PACKAGE = fs.existsSync(path.join(PROJECT_ROOT, '.deploy'));

async function showMenu() {
  clearScreen();
  printHeader();

  const sections = buildVisibleMenu(menuSections, {
    isLinux: IS_LINUX,
    isWindows: IS_WINDOWS,
    isDeployPackage: IS_DEPLOY_PACKAGE,
  });
  for (const line of formatMenu(sections)) {
    console.log(line);
  }

  return sections.flatMap((s) => s.items);
}

async function main() {
  while (true) {
    const visibleItems = await showMenu();
    const choice = await prompt();

    if (choice === 'q') {
      process.exit(0);
    }

    const item = visibleItems.find((m) => m.key === choice);

    if (item) {
      await item.action();
      console.log('');
      await new Promise((resolve) => {
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
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

// ==================== 程序入口 ====================

/**
 * 异步入口函数
 * 先完成离线环境设置，再执行后续逻辑
 */
async function bootstrap() {
  // 首先设置离线环境（必须在其他操作前完成）
  // 这会复制 .env.example → .env（如果 .env 不存在）
  const success = await setupOffline({
    silent: true,
    deployBackendOnly: isDeployMode, // 部署模式只装后端依赖
  });

  if (!success) {
    process.exit(1);
  }

  // 会启动服务的命令（首次部署时触发密码交互确认）：
  //   无参数交互菜单、deploy、dev、start
  // 查询/维护类命令（status/logs/migrate/db:* 等）不触发，避免被迫输入
  const isStartupCommand =
    args.length === 0 ||
    args[0] === 'deploy' ||
    args[0] === 'dev' ||
    args[0] === 'start';

  // 密码是否已确认（读 .env 标记 PASSWORD_INITIALIZED；.env 不存在时视为未确认）
  let passwordInitialized = false;
  if (fs.existsSync(BACKEND_ENV_PATH)) {
    try {
      const envConfig = parseEnvFile(BACKEND_ENV_PATH);
      passwordInitialized = envConfig.PASSWORD_INITIALIZED === '1';
    } catch {
      passwordInitialized = false;
    }
  }

  if (isStartupCommand && !passwordInitialized) {
    // 首次部署 + 启动类命令：走密码交互确认
    // （确认后写入 PASSWORD_INITIALIZED=1，后续启动命令不再重复触发）
    state.isFirstDeploy = true;
    await autoSetupAndShowPasswords();
  } else {
    // 升级 / 已确认过密码 / 查询维护类命令：合并 .env.example 新增配置项
    const examplePath = BACKEND_ENV_PATH + '.example';
    if (
      fs.existsSync(examplePath) &&
      fs.existsSync(BACKEND_ENV_PATH)
    ) {
      try {
        const envContent = fs.readFileSync(BACKEND_ENV_PATH, 'utf8');
        const exampleContent = fs.readFileSync(examplePath, 'utf8');
        const merged = mergeExampleIntoEnv(envContent, exampleContent);
        if (merged !== envContent) {
          fs.writeFileSync(BACKEND_ENV_PATH, merged, 'utf8');
          log('green', '[✓] 已合并 .env.example 新增配置项');
          // setupOffline 的 fillEmptySecrets 在本合并之前已执行过：合并新带进来的
          // 空白密钥（如 REDIS_PASSWORD=）须当次补全，否则要等下一次运行才生成，
          // 本次部署会因密钥缺失被后端生产配置校验拒绝启动。
          fillEmptySecrets(BACKEND_ENV_PATH);
        }
      } catch (err) {
        log('yellow', `[警告] 合并 .env.example 时出错: ${err.message}`);
      }
    }
  }

  // 命令行参数支持
  // args 已在文件开头定义
  if (args.length > 0) {
    // 处理 --help
    if (args[0] === '--help' || args[0] === '-h') {
      showHelp();
      process.exit(0);
    }

    const commandMap = {
      dev: devMode,
      deploy: deployMode,
      start: startMode,
      stop: stopInfrastructure,
      'kill-all': killAllInfrastructure,
      migrate: runDatabaseMigration,
      seed: runDatabaseSeed,
      'db:backup': backupDatabase,
      'db:restore': restoreDatabase,
      'db:list': listBackups,
      'db:cleanup': cleanupOldBackups,
      init: linuxInit,
      status: viewStatus,
      logs: viewLogs,
      'version:check': () => versionHelper.runHealthCheck({ silent: false }),
      'version:verify': () => versionHelper.runVerification({ silent: false }),
      'mfa:totp-unbind': () => mfaTotpUnbind(),
    };

    const cmd = commandMap[args[0]];
    if (cmd) {
      // 支持 --skip-build 参数
      if (args[0] === 'deploy' && args.includes('--skip-build')) {
        await deployMode(true);
      }
      // 支持 db:cleanup --keep N
      else if (args[0] === 'db:cleanup') {
        const keepIndex = args.indexOf('--keep');
        const maxBackups =
          keepIndex !== -1 && args[keepIndex + 1]
            ? parseInt(args[keepIndex + 1], 10)
            : 10;
        await cleanupOldBackups(maxBackups);
      }
      // 支持 db:restore <文件>
      else if (args[0] === 'db:restore' && args[1]) {
        await restoreDatabase(args[1]);
      }
      // 支持 mfa:totp-unbind <username>（#415 管理员 TOTP 解绑恢复）
      else if (args[0] === 'mfa:totp-unbind') {
        await mfaTotpUnbind(args[1]);
      } else {
        await cmd();
      }
    } else {
      log('red', `未知命令: ${args[0]}`);
      log(
        'cyan',
        '可用命令: dev, deploy, start, stop, kill-all, migrate, seed, db:backup, db:restore, db:list, db:cleanup, init, status, logs, version:check, version:verify, mfa:totp-unbind'
      );
      log('cyan', '  deploy             : 交互式部署，询问是否构建');
      log(
        'cyan',
        '  deploy --skip-build: 跳过构建，使用现有 dist 并安装生产依赖'
      );
      log('cyan', '  db:backup          : 手动备份数据库');
      log('cyan', '  db:restore [文件]  : 恢复数据库（可选指定备份文件）');
      log('cyan', '  db:list            : 查看备份列表');
      log('cyan', '  db:cleanup --keep N: 清理旧备份，保留 N 个（默认 10）');
      log('cyan', '  version:check      : 图纸版本部署前检查');
      log('cyan', '  version:verify     : 图纸版本部署后验证');
      log('cyan', '');
      log('cyan', '查看帮助: ./cloudcad.sh --help');
      process.exit(1);
    }
  } else {
    await main();
  }
}


// 启动程序
bootstrap().catch((err) => {
  console.error('程序启动失败:', err);
  process.exit(1);
});
