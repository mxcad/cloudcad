/**
 * @fileoverview 状态 / 日志命令
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - viewStatus：cli.js:2662-2673
 * - viewLogs：cli.js:2675-2686
 *
 * 依赖方向：commands → lib。本模块为独立命令，仅依赖 lib，不依赖其他命令。
 */

const fs = require('fs');

const { PM2_JS } = require('../lib/context');
const { log, clearScreen, printHeader } = require('../lib/logger');
const { runPm2 } = require('../lib/proc');

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

module.exports = {
  viewStatus,
  viewLogs,
};
