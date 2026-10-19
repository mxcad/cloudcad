/**
 * Docker 形态 CLI 薄 adapter（ADR-0075 C4）
 *
 * cli.js 前置分派检测到 form=docker 后把命令面委托给本模块：
 *   deploy / start        → docker-runtime cmdStart（12 步编排，ADR-0074）
 *   stop / kill-all       → docker-runtime cmdStop
 *   status                → docker-runtime cmdStatus（容器 + 宿主进程，#434）
 *   --help / -h           → 本形态帮助
 *   无参数                → 交互菜单（启动/停止/状态；长尾可见性见 C5，v2）
 *   其余命令              → v1 docker 形态未接线（长尾运维见 v2）
 *
 * 本模块只做命令映射与交互，不实现任何编排逻辑——12 步编排与状态查询的唯一出口是
 * runtime/docker-runtime/index.js（与 start.sh 直调路径共用同一份）。
 * 两 facade（start / cloudcad）经本 adapter 成对同步（ADR-0056 C4）。
 */
const readline = require('readline');
const { PRODUCT_NAME } = require('./lib/branding');

const dockerRuntime = require('../docker-runtime/index');

/**
 * 命令面映射（纯函数，单测覆盖）
 * @param {string[]} args cli.js 的 process.argv.slice(2)
 * @returns {'start'|'stop'|'status'|'help'|'menu'|'unsupported'}
 */
function resolveCommand(args) {
  const cmd = args[0];
  if (cmd === 'deploy' || cmd === 'start') return 'start';
  if (cmd === 'stop' || cmd === 'kill-all') return 'stop';
  if (cmd === 'status') return 'status';
  if (cmd === '--help' || cmd === '-h') return 'help';
  if (args.length === 0) return 'menu';
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
  console.log('    --help                   本帮助');
  console.log('');
  console.log('长尾命令（db:* / 密码重置 / 日志等）v1 未接线，见打包统一规划 v2。');
}

async function runMenu() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));
  while (true) {
    console.log('');
    console.log(`  [1] 启动全部服务（deploy）`);
    console.log(`  [2] 停止全部服务（stop）`);
    console.log(`  [3] 查看服务状态（status）`);
    console.log(`  [q] 退出`);
    const choice = await ask('请选择: ');
    if (choice === 'q' || choice === 'Q') {
      rl.close();
      process.exit(0);
    }
    if (choice === '1') {
      await dockerRuntime.cmdStart();
    } else if (choice === '2') {
      await dockerRuntime.cmdStop();
    } else if (choice === '3') {
      await dockerRuntime.cmdStatus();
    } else {
      console.log('无效选项，请重新选择');
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
    default:
      console.error(`[${PRODUCT_NAME}][错误] Docker 形态暂不支持该命令: ${args[0]}`);
      console.error('Docker 形态 v1 支持: deploy/start、stop、--help（长尾运维见 v2）');
      process.exit(1);
  }
}

module.exports = { resolveCommand, run };
