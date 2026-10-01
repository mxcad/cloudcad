/**
 * @fileoverview 交互式输入工具（纯能力层）
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - prompt：cli.js:3279-3291
 * - promptConfirm：cli.js:1027-1041
 * - promptPassword：cli.js:2892-2920
 * - promptPasswordWithConfirm：cli.js:2930-2953
 * - promptChoice：deploy.js / start.js 启动模式菜单收敛（原内联 readline，
 *   判据 `choice !== '2'` 把 3、abc 等任意输入静默当成默认项）
 *
 * 依赖方向铁律：lib 只允许 require 其他 lib 或独立模块，禁止 require commands。
 */

const readline = require('readline');

const { colors, log } = require('./logger');

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
 * 选项菜单输入：只接受给定选项，非法输入当场报错并重问
 *
 * 旧写法 `choice !== '2'` 把任何非 '2' 输入（3、abc、q…）静默当成默认项，
 * 用户输错选项时程序照跑不误且看不出自己输错了。这里改成显式白名单：
 * 非法输入立即回显错误并重新提问，空输入才落到默认项。
 *
 * @param {string} message 提示文本，如 `请输入选项 [1]: `
 * @param {string[]} choices 合法输入列表（trim 后全等比较）
 * @param {string} def 默认值：空输入或 stdin 结束时返回
 * @returns {Promise<string>} 一定属于 choices 的输入
 */
async function promptChoice(message, choices, def) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    // 提示走 options：createInterface 的初始化在微任务里才跑完，
    // 构造后立即调 rl.prompt(message) 传参会被静默忽略（显示成默认 '> '）
    prompt: message,
  });

  // 用常驻 'line' 监听排队，而不是每次 await rl.question：管道输入会把多行一次性
  // 交给 readline，第二行会在重问的 question 回调注册之前就被丢弃——那正是
  // 「输错选项还被当成默认项」的同型故障。
  const queued = [];
  const waiters = [];
  let ended = false;
  rl.on('line', (line) => {
    const wait = waiters.shift();
    if (wait) wait(line.trim());
    else queued.push(line.trim());
  });
  rl.on('close', () => {
    ended = true;
    while (waiters.length) waiters.shift()('');
  });

  const take = () => {
    if (queued.length > 0) return Promise.resolve(queued.shift());
    // stdin 已结束且末尾没有换行时 readline 不会再吐行，返回空串（=默认项）
    if (ended) return Promise.resolve('');
    return new Promise((resolve) => waiters.push(resolve));
  };

  let choice = def;
  for (;;) {
    rl.prompt();
    const raw = await take();
    if (raw === '') {
      choice = def;
      break;
    }
    if (choices.includes(raw)) {
      choice = raw;
      break;
    }
    log(
      'red',
      `[错误] 无效选项「${raw}」，请输入 ${choices.join(' / ')}（直接回车=${def}）`
    );
    // stdin 已结束就重问不到，退回默认项
    if (ended) break;
  }

  if (!ended) rl.close();
  return choice;
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
  promptChoice,
  promptConfirm,
  promptPassword,
  promptPasswordWithConfirm,
};
