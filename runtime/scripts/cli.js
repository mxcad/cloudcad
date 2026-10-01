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
  PNPM_JS,
  OPS_ENTRY,
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
const { hasNonAscii } = require('./lib/deploy-path');

// ==================== 运维操作留痕（#418） ====================
// 每次 CLI 调用记 start 行；进程退出记 exit 行（含退出码）。
const { recordStart, installExitHook } = require('./lib/ops-log');
recordStart(args);
installExitHook();

// ==================== 命令模块（拆分至 commands/*） ====================

const {
  viewStatus,
  viewLogs,
  logCenterMenu,
  showLogLocations,
  bundleLogsCommand,
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
const { startMode, startOnly } = require('./commands/start');
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
  // 先完成离线环境设置（部署包解包后首次运行会装依赖、建 .env、跑 ConfigUpdater）。
  //
  // stop / kill-all 不做：它们是清理动作，不该有"重新配置前端"的副作用。实测
  // `cli.js stop` 会重写前端 dist 下 49 个配置文件并各留一份 .bak（内容虽相同，
  // 但把"停止服务"变成"改用户配置"），也让日志被无关输出淹没。
  // stop 不受运行时完整性约束：stopInfrastructure 对 PM2 缺失已做降级（跳过
  // pm2 stop all，直接跑 pg-manager/redis-manager 与目录归属残留清理），且
  // NODE_EXE 只取决于 USE_RUNTIME（runtime/<platform> 是否存在）而与 PM2 无关。
  // 清理动作必须最大限度可用——它正是"停不掉"时的最后出口。
  const isStopOnlyCommand = args[0] === 'stop' || args[0] === 'kill-all';

  // 部署目录含中文会导致 PostgreSQL / Redis / CAD 转换引擎无法工作，须在启动
  // 任何服务前拦下。PROJECT_ROOT 来自 lib/context（= 各入口脚本的 %~dp0 与
  // dirname "$0"），一处检查即覆盖 start / deploy / 交互菜单双平台入口。
  // 检测按 Unicode 码点判定，不用 cmd findstr 正则（CP936 下不匹配 GBK 高位字节）。
  //
  // stop / kill-all 放行：中文路径下若已把服务起起来了（例如本检查上线前的旧包），
  // stop 就是唯一的停止出口——拦下等于把用户锁在坏状态里。
  if (!isStopOnlyCommand && hasNonAscii(PROJECT_ROOT)) {
    log('red', '部署目录包含中文，无法启动');
    log('cyan', `当前目录: ${PROJECT_ROOT}`);
    log('cyan', '');
    log('cyan', '中文路径会导致数据库、缓存与 CAD 转换引擎无法正常工作。');
    log('cyan', '请将本程序重新解压到纯英文路径（例如 D:\\CloudCAD），');
    log('cyan', '或将当前目录整体移动到纯英文路径后再启动。');
    process.exit(1);
  }

  if (!isStopOnlyCommand) {
    const success = await setupOffline({
      silent: true,
      deployBackendOnly: isDeployMode, // 部署模式只装后端依赖
    });

    if (!success) {
      process.exit(1);
    }
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

  // 只有启动类命令才可能触发密码交互。stop/kill-all 是纯清理动作，必须跳过：
  // 它们不该有"合并 .env.example / 跑 ConfigUpdater"的副作用——否则"停止服务"
  // 会顺手改用户配置（后端 .env 与前端 dist 下的配置文件），日志也会被数百行
  // 无关输出淹没，排查"stop 到底停没停干净"时看不清关键行。
  if (!isStopOnlyCommand && isStartupCommand && !passwordInitialized) {
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
      'logs:locations': showLogLocations,
      'logs:bundle': bundleLogsCommand,
      'start:infra': startOnly,
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
      }
      // 支持 logs:bundle --days N（仅打包最近 N 天；缺省=全部）
      else if (args[0] === 'logs:bundle') {
        const daysIndex = args.indexOf('--days');
        const days =
          daysIndex !== -1 && args[daysIndex + 1]
            ? parseInt(args[daysIndex + 1], 10)
            : 0;
        await bundleLogsCommand(Number.isFinite(days) && days > 0 ? days : 0);
      } else {
        const result = await cmd();
        // `stop` 返回 false 表示仍有进程占用本目录（数据目录未释放、部署包不可删除）。
        // 必须给非 0 退出码，否则批处理/卸载脚本会把"停不掉"当成功继续删除目录。
        if (args[0] === 'stop' && result === false) {
          process.exit(1);
        }
      }
    } else {
      log('red', `未知命令: ${args[0]}`);
      log(
        'cyan',
        '可用命令: dev, deploy, start, start:infra, stop, kill-all, migrate, seed, db:backup, db:restore, db:list, db:cleanup, init, status, logs, logs:locations, logs:bundle, version:check, version:verify, mfa:totp-unbind'
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
      log('cyan', '  logs:locations     : 列出全部日志文件位置');
      log('cyan', '  logs:bundle [--days N]: 打包全部日志为 zip（可选最近 N 天）');
      log('cyan', '  start:infra        : 仅启动基础服务（排障用）');
      log('cyan', '  version:check      : 图纸版本部署前检查');
      log('cyan', '  version:verify     : 图纸版本部署后验证');
      log('cyan', '');
      log('cyan', `查看帮助: ${OPS_ENTRY} --help`);
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
