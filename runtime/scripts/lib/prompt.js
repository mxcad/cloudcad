/**
 * @fileoverview 交互式输入工具（纯能力层）
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - prompt：cli.js:3279-3291
 * - promptConfirm：cli.js:1027-1041
 * - promptPassword：cli.js:2892-2920
 * - promptPasswordWithConfirm：cli.js:2930-2953
 *
 * 依赖方向铁律：lib 只允许 require 其他 lib 或独立模块，禁止 require commands。
 */

const readline = require('readline');

const { colors } = require('./logger');

/**
 * 通用交互式输入
 */
function prompt() {
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

/**
 * 提示用户确认
 */
async function promptConfirm(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question(`${colors.yellow}${message}${colors.reset}`, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase());
    });
  });

  return answer === 'yes' || answer === 'y';
}

/**
 * 隐藏输入密码
 * @param {readline.Interface} rl readline 接口
 * @param {string} promptText 提示信息
 * @returns {Promise<string>} 用户输入
 */
function promptPassword(rl, promptText) {
  return new Promise((resolve) => {
    const stdout = process.stdout;

    // 先输出提示文本（在隐藏输入之前）
    process.stdout.write(promptText);

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

    // 使用空字符串作为 question 的提示，因为已经手动输出了
    rl.question('', (answer) => {
      // 恢复原始 write 方法
      stdout.write = originalWrite;
      // 输出换行
      originalWrite('\n');
      resolve(answer);
    });
  });
}

/**
 * 密码二次确认输入
 * 用户输入密码两次，两次一致才返回，否则重新输入
 * @param {readline.Interface} rl readline 接口
 * @param {string} promptText 提示信息（如"数据库密码"）
 * @param {string} defaultAction 默认行为说明（如"[自动生成]"）
 * @returns {Promise<string|null>} 用户输入的密码，或 null 表示使用默认行为
 */
async function promptPasswordWithConfirm(rl, promptText, defaultAction = '') {
  const fullPrompt = `${promptText} ${defaultAction}: `;

  while (true) {
    // 第一次输入
    const first = await promptPassword(rl, fullPrompt);

    // 如果用户直接回车，表示使用默认行为
    if (!first.trim()) {
      return null;
    }

    // 第二次确认
    const second = await promptPassword(rl, `再次输入确认: `);

    if (first === second) {
      console.log(`  ✓ 两次输入一致`);
      return first.trim();
    }

    console.log(`  ✗ 两次输入不一致，请重新输入`);
    console.log('');
  }
}

module.exports = {
  prompt,
  promptConfirm,
  promptPassword,
  promptPasswordWithConfirm,
};
