/**
 * promptChoice 回归测试（node:test，0 外部依赖）
 *
 * 用户报障：start.bat 部署菜单只有 [1]/[2] 两项，输 3 却照样按默认项 1 继续。
 * 根因是旧内联判据 `choice !== '2'`——任何非 '2' 输入（3、abc、q…）都被静默
 * 当成默认项，程序照跑不误且用户看不出自己输错了。
 *
 * 本文件锁定新判据：
 * - 非法输入当场报错并重新提问，返回值一定是合法选项（不再静默落到默认项）
 * - 空输入 = 默认项（保持原有「直接回车选 1」的便捷路径）
 * - stdin 已结束（管道/非交互输入）时无法重问，退回默认项而不是永久挂起
 *
 * 运行：node --test runtime/scripts/lib/prompt.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough, Writable } = require('node:stream');

const { promptChoice } = require('./prompt');

const PROMPT = '请输入选项 [1]: ';
const CHOICES = ['1', '2'];
const DEF = '1';

const tick = () => new Promise((resolve) => setImmediate(resolve));

/**
 * 轮询直到 pred 成立
 */
async function until(pred, timeoutMs, label) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error(`${label} 超时`);
    await tick();
  }
}

/**
 * 跑一次 promptChoice：用假 stdin 喂输入，收集控制台输出与 readline 写入
 * @param {(string|{data: string, end?: boolean})[]} steps
 * @returns {Promise<{choice: string, out: string, promptText: string}>}
 */
async function run(steps) {
  const input = new PassThrough();
  const promptText = [];
  const output = new Writable({
    write(chunk, enc, cb) {
      promptText.push(chunk.toString());
      cb();
    },
  });

  const out = [];
  const origLog = console.log;
  const oldStdin = process.stdin;
  const oldStdout = process.stdout;
  console.log = (...args) => {
    out.push(args.join(' '));
  };
  Object.defineProperty(process, 'stdin', { value: input, configurable: true });
  Object.defineProperty(process, 'stdout', {
    value: output,
    configurable: true,
  });

  try {
    const pending = promptChoice(PROMPT, CHOICES, DEF);
    await until(() => promptText.join('').includes(PROMPT), 3000, '首个提问');

    for (const step of steps) {
      const data = typeof step === 'string' ? step : step.data;
      input.write(data);
      if (step && step.end) input.end();
      await tick();
    }

    // 超时守卫防止挂起用例变成 node --test 的 30s 全局超时；
    // 用完必须 clearTimeout，否则 9 个用例各留 5s 定时器，测试套件整体拖到 5s+
    let guard;
    const choice = await Promise.race([
      pending,
      new Promise((_, reject) => {
        guard = setTimeout(
          () => reject(new Error('promptChoice 超时未返回（挂起）')),
          5000
        );
      }),
    ]);
    clearTimeout(guard);

    return { choice, out: out.join('\n'), promptText: promptText.join('') };
  } finally {
    console.log = origLog;
    Object.defineProperty(process, 'stdin', {
      value: oldStdin,
      configurable: true,
    });
    Object.defineProperty(process, 'stdout', {
      value: oldStdout,
      configurable: true,
    });
  }
}

test('输入 3（用户报障场景）：报错重问，不静默落默认项', async () => {
  const { choice, out } = await run(['3\n', '2\n']);

  assert.equal(choice, '2', '重问后应取到用户真正选择的 2');
  assert.match(out, /无效选项「3」/, '必须当场点明 3 不是合法选项');
  assert.match(out, /1 \/ 2/, '必须提示合法取值范围');
});

test('连续非法输入：每次都报错，直到拿到合法值', async () => {
  const { choice, out } = await run(['abc\n', 'q\n', '1\n']);

  assert.equal(choice, '1');
  assert.equal((out.match(/无效选项/g) || []).length, 2, '2 次非法各报一次');
});

test('非法输入后直接回车：落到默认项', async () => {
  const { choice } = await run(['3\n', '\n']);

  assert.equal(choice, DEF, '空输入 = 默认项，保持原有的回车即选 1');
});

test('输入合法值 2：一次通过，不报错', async () => {
  const { choice, out } = await run(['2\n']);

  assert.equal(choice, '2');
  assert.doesNotMatch(out, /无效选项/);
});

test('直接回车：走默认项', async () => {
  const { choice } = await run(['\n']);

  assert.equal(choice, DEF);
});

test('前后空格按 trim 比较', async () => {
  const { choice } = await run(['  2  \n']);

  assert.equal(choice, '2');
});

test('非选项前缀不算合法（1abc 报无效）', async () => {
  const { choice, out } = await run(['1abc\n', '2\n']);

  assert.equal(choice, '2');
  assert.match(out, /无效选项「1abc」/);
});

test('stdin 已结束（管道单行无换行）：退回默认项而非挂起', async () => {
  const { choice } = await run([{ data: '3', end: true }]);

  assert.equal(choice, DEF, 'stdin 结束后无法重问，必须落默认项');
});

test('重问时提示文本原样再出现一次', async () => {
  const { promptText } = await run(['3\n', '2\n']);

  // 用 indexOf 计数而非 new RegExp：PROMPT 里的 [1] 在正则中是字符类
  let count = 0;
  let idx = promptText.indexOf(PROMPT);
  while (idx !== -1) {
    count += 1;
    idx = promptText.indexOf(PROMPT, idx + 1);
  }

  assert.equal(count, 2, '第一次提问 + 重问，提示须出现两次');
});
