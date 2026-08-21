/**
 * @fileoverview 终端 UI / 日志工具
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - colors：cli.js:179-187
 * - log：cli.js:189-191
 * - clearScreen：cli.js:193-195
 * - printHeader：cli.js:361-373
 *
 * 依赖方向铁律：lib 只允许 require 其他 lib 或独立模块，禁止 require commands。
 */

const { PLATFORM, USE_RUNTIME, PM2_JS } = require('./context');
const { PRODUCT_NAME } = require('./branding');

const fs = require('fs');

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

/**
 * 显示宽度（中文等宽字符按 2 列计算）
 * @param {string} str
 * @returns {number}
 */
function displayWidth(str) {
  let w = 0;
  for (const ch of str) w += ch.charCodeAt(0) > 255 ? 2 : 1;
  return w;
}

/**
 * 生成居中的单行横幅内容：`║ text ║`（宽度按 displayWidth 计算补齐）
 * @param {string} text 横幅文本
 * @param {number} [width] 框内显示宽度（不含左右边框）
 * @returns {string}
 */
function brandBox(text, width = 38) {
  const w = displayWidth(text);
  const pad = Math.max(0, width - w);
  const left = Math.floor(pad / 2);
  return `║${' '.repeat(left)}${text}${' '.repeat(pad - left)}║`;
}

function printHeader() {
  console.log('');
  console.log(
    `${colors.bright}${colors.cyan}╔══════════════════════════════════════════╗`
  );
  console.log(`${colors.cyan}${brandBox(`  ${PRODUCT_NAME} 运维管理中心  `)}${colors.reset}`);
  console.log(`${colors.cyan}╚══════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  console.log(`  平台: ${PLATFORM}`);
  console.log(`  模式: ${USE_RUNTIME ? '内嵌 runtime' : '系统环境'}`);
  console.log(`  PM2:  ${PM2_JS && fs.existsSync(PM2_JS) ? '可用' : '不可用'}`);
  console.log('');
}

module.exports = {
  colors,
  log,
  clearScreen,
  displayWidth,
  brandBox,
  printHeader,
};
