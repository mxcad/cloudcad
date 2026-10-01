/**
 * @fileoverview 状态 / 日志命令
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - viewStatus：cli.js:2662-2673
 * - viewLogs：cli.js:2675-2686
 *
 * 日志中心（菜单 [3] / logs:locations / logs:bundle）：清单与打包的唯一实现
 * 在 lib/log-center.js，本文件只做终端呈现与交互。
 *
 * 依赖方向：commands → lib。本模块为独立命令，仅依赖 lib，不依赖其他命令。
 */

const fs = require('fs');
const readline = require('readline');

const { PM2_JS } = require('../lib/context');
const { colors, log, clearScreen, printHeader } = require('../lib/logger');
const { runPm2 } = require('../lib/proc');
const { promptChoice } = require('../lib/prompt');
const {
  listLogLocations,
  bundleLogs,
  formatSize,
} = require('../lib/log-center');

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

/** 打印日志位置一览（菜单与 logs:locations 命令共用） */
async function showLogLocations() {
  clearScreen();
  printHeader();
  log('bright', '>>> 日志位置一览');
  console.log('');

  const groups = listLogLocations();
  let missing = 0;
  for (const group of groups) {
    log('cyan', `■ ${group.service}`);
    console.log(`  目录: ${group.dir}`);
    if (!group.exists) {
      missing++;
      log('dim', '  （目录尚未生成——对应服务未运行过）');
      console.log('');
      continue;
    }
    if (!group.files.length) {
      console.log('  （无 .log 文件）');
      console.log('');
      continue;
    }
    for (const file of group.files) {
      console.log(`  ${file.name}  ${file.sizeText}  ${file.mtimeText}`);
    }
    console.log('');
  }
  log(
    'dim',
    `提示: 打包全部日志用 logs:bundle 命令或菜单 [日志中心]；${missing} 个目录尚未生成。`
  );
}

/**
 * 打包全部日志为 zip（菜单与 logs:bundle 命令共用）。
 * @param {number} [days] 仅打包最近 N 天（0/缺省 = 全部）
 */
async function bundleLogsCommand(days = 0) {
  clearScreen();
  printHeader();
  log('bright', days > 0 ? `>>> 打包最近 ${days} 天日志` : '>>> 打包全部日志');
  console.log('');
  log('cyan', '正在打包，请稍候...');

  const result = bundleLogs({ days: days > 0 ? days : undefined });
  console.log('');
  if (!result.ok) {
    log('red', '未找到任何日志文件，没有可打包的内容。');
    if (result.skipped.length) {
      log('dim', `以下日志目录不存在: ${result.skipped.join('、')}`);
    }
    return;
  }
  log('green', `打包完成: ${result.fileCount} 个日志文件`);
  console.log(`  原始总量: ${formatSize(result.totalBytes)} → zip: ${formatSize(result.zipSize)}`);
  console.log(`  文件位置: ${result.outPath}`);
  console.log('');
  log(
    'cyan',
    '把上面这个 zip 文件发给技术支持即可；路径已同时打印在服务器终端。'
  );
  if (result.skipped.length) {
    log('dim', `以下日志目录不存在（已跳过）: ${result.skipped.join('、')}`);
  }
}

/** 按回车继续（与 db-backup 菜单同款交互） */
function pressEnterToContinue() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`${colors.bright}按回车键继续...${colors.reset}`, () => {
      rl.close();
      resolve();
    });
  });
}

/** 日志中心子菜单（菜单 [3] 入口） */
async function logCenterMenu() {
  for (;;) {
    clearScreen();
    printHeader();
    log('bright', '>>> 日志中心');
    console.log('');
    console.log(`${colors.cyan}请选择操作：${colors.reset}`);
    console.log('');
    console.log(`  ${colors.cyan}[1]${colors.reset} 实时日志（PM2 各服务）`);
    console.log(`  ${colors.cyan}[2]${colors.reset} 日志位置一览（全部日志在哪）`);
    console.log(`  ${colors.cyan}[3]${colors.reset} 打包全部日志（生成 zip，可发给技术支持）`);
    console.log(`  ${colors.cyan}[q]${colors.reset} 返回主菜单`);
    console.log('');

    const choice = await promptChoice('请选择操作: ', ['1', '2', '3', 'q'], 'q');

    if (choice === 'q') return;
    if (choice === '1') await viewLogs();
    if (choice === '2') {
      await showLogLocations();
      await pressEnterToContinue();
    }
    if (choice === '3') {
      await bundleLogsCommand(0);
      await pressEnterToContinue();
    }
  }
}

module.exports = {
  viewStatus,
  viewLogs,
  logCenterMenu,
  showLogLocations,
  bundleLogsCommand,
};
