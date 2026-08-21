/**
 * L1 特征测试 —— commands/start.js 多次 start 后台模式的 start/restart 判定
 *
 * 目的：锁定"多次 start PM2 后台模式"的修复——只要 backend/frontend 任一已注册
 * （非 unknown，含 stopped/errored），就走 restart 而非 start，避免 pm2 start
 * 对已注册 app 报 already launched / 启动重复实例。
 */

let start;

beforeAll(() => {
  start = require('../../../runtime/scripts/commands/start');
});

afterAll(() => {
  jest.resetModules();
});

describe('shouldRestartAppServices', () => {
  test('全部 unknown（未注册）→ 应 start，返回 false', () => {
    expect(start.shouldRestartAppServices('unknown', 'unknown')).toBe(false);
  });

  test('backend online → 应 restart，返回 true', () => {
    expect(start.shouldRestartAppServices('online', 'unknown')).toBe(true);
  });

  test('backend stopped（stop 过后多次 start）→ 应 restart，返回 true', () => {
    expect(start.shouldRestartAppServices('stopped', 'unknown')).toBe(true);
  });

  test('frontend errored → 应 restart，返回 true', () => {
    expect(start.shouldRestartAppServices('unknown', 'errored')).toBe(true);
  });

  test('backend launching → 应 restart，返回 true', () => {
    expect(start.shouldRestartAppServices('launching', 'stopped')).toBe(true);
  });
});
