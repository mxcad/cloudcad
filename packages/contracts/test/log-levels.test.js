'use strict';

/**
 * 日志级别分裂解析（ADR-0076）的纯函数契约测试。
 *
 * resolveLogLevels 是四个服务（backend / config-service / storage-service /
 * conversion-service）共享的两条流级别解析唯一出口。钉死两件事：
 * - 策略默认值与优先级（落盘全量 / 实时生产 error / LOG_LEVEL 旧别名 / 非法值回落）；
 * - 级别刻度的超集语义（trace 全放行、silent 全静默），避免设了一个 logger
 *   发不出的级别名就静默丢掉全部日志。
 *
 * CommonJS + node --test，跑在 pnpm build 产出的 dist/ 上，零外部依赖。
 * 本模块不引用 process，故 env 快照必须显式传入。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveLogLevels, isAtLeast } = require('../dist/index.js');

test('resolveLogLevels：生产默认 落盘=debug（全量）/ 实时=error', () => {
  assert.deepEqual(resolveLogLevels({ NODE_ENV: 'production' }), {
    file: 'debug',
    console: 'error',
  });
});

test('resolveLogLevels：开发默认 实时=debug（保留全量输出便于本地排障）', () => {
  assert.deepEqual(resolveLogLevels({}), { file: 'debug', console: 'debug' });
});

test('resolveLogLevels：isProduction 显式覆盖优先于 NODE_ENV', () => {
  assert.equal(resolveLogLevels({ NODE_ENV: 'production' }, false).console, 'debug');
  assert.equal(resolveLogLevels({}, true).console, 'error');
});

test('resolveLogLevels：LOG_FILE_LEVEL / LOG_CONSOLE_LEVEL 各自覆盖，互不影响', () => {
  const plan = resolveLogLevels({
    NODE_ENV: 'production',
    LOG_FILE_LEVEL: 'info',
    LOG_CONSOLE_LEVEL: 'debug',
  });
  assert.equal(plan.file, 'info');
  assert.equal(plan.console, 'debug');
});

test('resolveLogLevels：LOG_LEVEL 作为旧别名生效，显式 LOG_FILE_LEVEL 优先', () => {
  const env = { NODE_ENV: 'production' };
  assert.equal(resolveLogLevels({ ...env, LOG_LEVEL: 'warn' }).file, 'warn');
  assert.equal(
    resolveLogLevels({ ...env, LOG_FILE_LEVEL: 'info', LOG_LEVEL: 'warn' }).file,
    'info',
  );
});

test('resolveLogLevels：非法值静默回落，不让服务起不来', () => {
  assert.equal(resolveLogLevels({ NODE_ENV: 'production', LOG_FILE_LEVEL: 'verbose' }).file, 'debug');
  assert.equal(
    resolveLogLevels({ NODE_ENV: 'production', LOG_CONSOLE_LEVEL: 'all' }).console,
    'error',
  );
  assert.equal(resolveLogLevels({ LOG_CONSOLE_LEVEL: 'all' }).console, 'debug');
});

test('resolveLogLevels：空串与纯空白不算合法值；合法值大小写与首尾空白归一化', () => {
  assert.equal(resolveLogLevels({ NODE_ENV: 'production', LOG_CONSOLE_LEVEL: '   ' }).console, 'error');
  assert.equal(resolveLogLevels({ LOG_FILE_LEVEL: '  Warn ' }).file, 'warn');
});

test('resolveLogLevels：pino 全量刻度全部被接受（backend 侧依赖 silent/trace/fatal）', () => {
  for (const level of ['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']) {
    assert.equal(resolveLogLevels({ LOG_FILE_LEVEL: level }).file, level);
  }
});

test('isAtLeast：交集四个级别的索引与 4 级手写 logger 完全一致（收敛零行为变化）', () => {
  for (const level of ['debug', 'info', 'warn', 'error']) {
    for (const threshold of ['debug', 'info', 'warn', 'error']) {
      const idx = ['debug', 'info', 'warn', 'error'];
      assert.equal(isAtLeast(level, threshold), idx.indexOf(level) >= idx.indexOf(threshold));
    }
  }
});

test('isAtLeast：trace 阈值放行一切，silent 阈值静默一切（超集级别的正确语义）', () => {
  for (const level of ['debug', 'info', 'warn', 'error']) {
    assert.equal(isAtLeast(level, 'trace'), true);
    assert.equal(isAtLeast(level, 'silent'), false);
  }
});

test('isAtLeast：fatal 阈值对手写 logger 的任何级别都不达标', () => {
  for (const level of ['debug', 'info', 'warn', 'error']) {
    assert.equal(isAtLeast(level, 'fatal'), false);
  }
});

test('isAtLeast：未知级别返回 false（宁丢一条，不放进更严的流）', () => {
  assert.equal(isAtLeast('verbose', 'debug'), false);
  assert.equal(isAtLeast('debug', 'verbose'), false);
  assert.equal(isAtLeast('', 'debug'), false);
});

test('isAtLeast：大小写归一化（level 由 normalizeArgs 产出、threshold 由 resolveLogLevels 产出，均已是干净值，故只归一大小写不 trim）', () => {
  assert.equal(isAtLeast('INFO', 'warn'), false);
  assert.equal(isAtLeast('WARN', 'warn'), true);
});
