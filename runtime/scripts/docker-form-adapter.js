/**
 * Docker 形态 CLI 薄 adapter（ADR-0075 C4）
 *
 * cli.js 前置分派检测到 form=docker 后把命令面委托给本模块：
 *   deploy / start        → docker-runtime cmdStart（12 步编排，ADR-0074）
 *   stop / kill-all       → docker-runtime cmdStop
 *   status                → docker-runtime cmdStatus（容器 + 宿主进程，#434）
 *   --help / -h           → 本形态帮助
 *   无参数                → 交互菜单（启动/停止/状态 + 长尾运维）
 *   长尾运维（#442）：db:backup / db:restore / db:list / db:cleanup /
 *   mfa:totp-unbind / admin:reset-password / db:reset-password /
 *   redis:reset-password → commands/*（形态感知：psql 走 docker exec
 *   cloudcad-pg，重启走 docker restart / 宿主进程重启）
 *   其余命令（logs / migrate / seed / init / dev / start:infra / version:*）
 *   → unsupported（migrate 由 app 容器 entrypoint 启动时自动执行）
 *
 * 本模块只做命令映射与交互，不实现任何编排逻辑——12 步编排与状态查询的唯一出口是
 * runtime/docker-runtime/index.js（与 start.sh 直调路径共用同一份）。
 * 两 facade（start / cloudcad）经本 adapter 成对同步（ADR-0056 C4）。
 */
const readline = require('readline');
const { PRODUCT_NAME } = require('./lib/branding');

const dockerRuntime = require('../docker-runtime/index');

// 长尾运维命令（#442）：commands/* 已形态感知（docker exec / docker restart）
const {
  backupDatabase,
  listBackups,
  restoreDatabase,
  cleanupOldBackups,
  databaseBackupMenu,
} = require('./commands/db-backup');
const { mfaTotpUnbind } = require('./commands/mfa');
const { adminResetPassword } = require('./commands/admin-reset-password');
const { dbResetPassword } = require('./commands/db-reset-password');
const { redisResetPassword } = require('./commands/redis-reset-password');

/**
 * 命令面映射（纯函数，单测覆盖）
 * @param {string[]} args cli.js 的 process.argv.slice(2)
 * @returns {string} 'start'|'stop'|'status'|'help'|'menu'|'db-backup'|
 *   'db-restore'|'db-list'|'db-cleanup'|'mfa-unbind'|'admin-reset'|
 *   'db-reset'|'redis-reset'|'unsupported'
 */
function resolveCommand(args) {
  const cmd = args[0];
  if (cmd === 'deploy' || cmd === 'start') return 'start';
  if (cmd === 'stop' || cmd === 'kill-all') return 'stop';
  if (cmd === 'status') return 'status';
  if (cmd === '--help' || cmd === '-h') return 'help';
  if (args.length === 0) return 'menu';
  // 长尾运维（#442）
  if (cmd === 'db:backup') return 'db-backup';
  if (cmd === 'db:restore') return 'db-restore';
  if (cmd === 'db:list') return 'db-list';
  if (cmd === 'db:cleanup') return 'db-cleanup';
  if (cmd === 'mfa:totp-unbind') return 'mfa-unbind';
  if (cmd === 'admin:reset-password') return 'admin-reset';
  if (cmd === 'db:reset-password') return 'db-reset';
  if (cmd === 'redis:reset-password') return 'redis-reset';
  return 'unsupported';
}

function showHelp() {
  console.log(`${PRODUCT_NAME} Docker 部署包 运维 CLI`);
  console.log('');
  console.log('使用方式:');
  console.log('  ./start.sh                 启动（12 步编排）');
  console.log('  ./stop.sh                  停止（数据保留）');
  console.log('  ./runtime/cloudcad.sh      交互菜单（无参数）或执行命令:');
  console.log('    deploy | start           启动全部');
  console.log('    stop | kill-all          停止全部');
  console.log('    status                   查看服务状态（容器 + 宿主进程）');
  console.log('    db:backup                手动备份数据库');
  console.log('    db:restore [文件]        恢复数据库（可选指定备份文件）');
  console.log('    db:list                  查看备份列表');
  console.log('    db:cleanup --keep N      清理旧备份，保留 N 个（默认 10）');
  console.log('    mfa:totp-unbind [用户名] 解绑管理员 TOTP');
  console.log(
    '    admin:reset-password [用户名] [--interactive] [--also-unbind-totp]'
  );
  console.log('    db:reset-password [--interactive] [--no-restart]');
  console.log('    redis:reset-password [--interactive] [--no-restart]');
  console.log('    --help                   本帮助');
  console.log('');
  console.log(
    '长尾运维在 docker 形态经 docker exec / docker restart 执行（#442）；' +
      '数据库迁移由 app 容器启动时自动执行。'
  );
}

async function runMenu() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));
  const pause = () =>
    new Promise((resolve) => {
      const inner = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      inner.question('按回车键继续...', () => {
        inner.close();
        resolve();
      });
    });
  while (true) {
    console.log('');
    console.log(`  [1] 启动全部服务（deploy）`);
    console.log(`  [2] 停止全部服务（stop）`);
    console.log(`  [3] 查看服务状态（status）`);
    console.log(`  [4] 数据库备份与恢复`);
    console.log(`  [5] 重置管理员密码`);
    console.log(`  [6] 重置数据库密码`);
    console.log(`  [7] 重置 Redis 密码`);
    console.log(`  [8] 解绑管理员 TOTP`);
    console.log(`  [q] 退出`);
    const choice = await ask('请选择: ');
    if (choice === 'q' || choice === 'Q') {
      rl.close();
      process.exit(0);
    }
    let action = null;
    if (choice === '1') {
      action = () => dockerRuntime.cmdStart();
    } else if (choice === '2') {
      action = () => dockerRuntime.cmdStop();
    } else if (choice === '3') {
      action = () => dockerRuntime.cmdStatus();
    } else if (choice === '4') {
      action = () => databaseBackupMenu();
    } else if (choice === '5') {
      action = () => adminResetPassword();
    } else if (choice === '6') {
      action = () => dbResetPassword();
    } else if (choice === '7') {
      action = () => redisResetPassword();
    } else if (choice === '8') {
      action = () => mfaTotpUnbind();
    }
    if (!action) {
      console.log('无效选项，请重新选择');
      continue;
    }
    await action();
    // 长尾运维执行完回主菜单；start/stop/status 是主路径动作，保持原行为不暂停
    if (choice >= '4' && choice <= '8') {
      console.log('');
      await pause();
    }
  }
}

/**
 * 执行 docker 形态命令（cli.js 前置分派调用）
 * @param {string[]} args
 */
async function run(args) {
  switch (resolveCommand(args)) {
    case 'start':
      await dockerRuntime.cmdStart();
      break;
    case 'stop':
      await dockerRuntime.cmdStop();
      break;
    case 'status':
      await dockerRuntime.cmdStatus();
      break;
    case 'help':
      showHelp();
      break;
    case 'menu':
      await runMenu();
      break;
    case 'db-backup':
      await backupDatabase();
      break;
    case 'db-restore':
      await restoreDatabase(args[1]);
      break;
    case 'db-list':
      await listBackups();
      break;
    case 'db-cleanup': {
      const keepIndex = args.indexOf('--keep');
      const maxBackups =
        keepIndex !== -1 && args[keepIndex + 1]
          ? parseInt(args[keepIndex + 1], 10)
          : 10;
      await cleanupOldBackups(maxBackups);
      break;
    }
    case 'mfa-unbind':
      await mfaTotpUnbind(args[1]);
      break;
    case 'admin-reset': {
      const interactive = args.includes('--interactive');
      const alsoUnbindTotp = args.includes('--also-unbind-totp');
      const positional = args
        .slice(1)
        .find((arg) => !arg.startsWith('--'));
      await adminResetPassword(positional || undefined, {
        interactive,
        alsoUnbindTotp,
      });
      break;
    }
    case 'db-reset':
      await dbResetPassword({
        interactive: args.includes('--interactive'),
        restart: !args.includes('--no-restart'),
      });
      break;
    case 'redis-reset':
      await redisResetPassword({
        interactive: args.includes('--interactive'),
        restart: !args.includes('--no-restart'),
      });
      break;
    default:
      console.error(`[${PRODUCT_NAME}][错误] Docker 形态暂不支持该命令: ${args[0]}`);
      console.error(
        'Docker 形态支持的长尾运维（#442）: db:backup / db:restore / db:list / ' +
          'db:cleanup / mfa:totp-unbind / admin:reset-password / db:reset-password / ' +
          'redis:reset-password（数据库迁移由 app 容器启动时自动执行）'
      );
      process.exit(1);
  }
}

module.exports = { resolveCommand, run };
