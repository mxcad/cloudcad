/**
 * redis-args 回归测试（node:test，0 外部依赖）
 *
 * 锁定两件事：
 * - ADR-0076「Redis 实时零输出」的唯一依据是 --logfile 非空，argv 里必须始终带着
 * - 密码经配置文件传入时不出现在命令行（进程列表对机器上所有本机会话可见）
 *
 * 运行：node --test runtime/scripts/lib/redis-args.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRedisArgs, REDIS_LOG_LEVEL } = require('./redis-args');

const base = {
  port: 6379,
  dataDir: '/opt/cloudcad/data/redis',
  logFile: '/opt/cloudcad/data/logs/redis.log',
};

test('始终带 --logfile 与 --loglevel notice（ADR-0076 实时零输出的唯一依据）', () => {
  const args = buildRedisArgs(base);
  assert.equal(args[args.indexOf('--logfile') + 1], base.logFile);
  assert.equal(args[args.indexOf('--loglevel') + 1], 'notice');
});

test('REDIS_LOG_LEVEL 常量与 argv 里的值同源', () => {
  assert.equal(REDIS_LOG_LEVEL, 'notice');
  assert.equal(buildRedisArgs(base)[buildRedisArgs(base).indexOf('--loglevel') + 1], REDIS_LOG_LEVEL);
});

test('无密码模式：argv 不含任何认证参数', () => {
  const args = buildRedisArgs(base);
  assert.equal(args.includes('--requirepass'), false);
  assert.equal(args[0], '--port');
});

test('密码经配置文件时它位于 argv 首位，命令行不出现 requirepass', () => {
  const conf = '/opt/cloudcad/data/redis/cloudcad-redis-auth.conf';
  const args = buildRedisArgs({ ...base, authConfPath: conf });
  assert.equal(args[0], conf);
  assert.equal(args.includes('--requirepass'), false);
});

test('--port/--dir/--appendonly 留在命令行（实例归属探测依赖 cmdline 数据目录）', () => {
  const args = buildRedisArgs(base);
  assert.deepEqual(
    args.slice(0, 6),
    ['--port', '6379', '--dir', base.dataDir, '--appendonly', 'yes'],
  );
});

test('port 走 String 转换，避免非整型拼进 argv', () => {
  const args = buildRedisArgs({ ...base, port: 6380 });
  assert.equal(typeof args[args.indexOf('--port') + 1], 'string');
  assert.equal(args[args.indexOf('--port') + 1], '6380');
});
