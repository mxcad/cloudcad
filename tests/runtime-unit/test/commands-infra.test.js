/**
 * L1 特征测试 —— commands/infra.js 基础服务托管理顺逻辑
 *
 * 目的：锁定 Step A-2 理顺（Q0 统一 PM2 托管 + Q1 重复实例检测）引入的判定逻辑。
 * - areAllInfraOnline：所有基础服务是否都在 PM2 online
 * - INFRA_SERVICE_APPS / INFRA_APP_TO_PORT_KEY：单一事实源完整性
 */

// infra.js 顶层 require 无副作用（仅定义函数与常量），直接加载。
// 它依赖 lib/context（基于文件系统，require 不触发副作用）与 lib/proc。
let infra;

beforeAll(() => {
  // 移除 context 的 fs-exists 干扰：areAllInfraOnline 是纯函数，不触碰文件系统
  infra = require('../../../runtime/scripts/commands/infra');
});

afterAll(() => {
  jest.resetModules();
});

describe('INFRA_SERVICE_APPS / INFRA_APP_TO_PORT_KEY 单一事实源', () => {
  test('基础服务 app 名清单完整（config-service/cooperate/postgresql/redis）', () => {
    const { INFRA_SERVICE_APPS } = require('../../../runtime/scripts/lib/context');
    expect(INFRA_SERVICE_APPS).toEqual([
      'config-service',
      'cooperate',
      'postgresql',
      'redis',
    ]);
  });

  test('每个 app 名都有对应端口 key', () => {
    const { INFRA_SERVICE_APPS, INFRA_APP_TO_PORT_KEY } = require('../../../runtime/scripts/lib/context');
    for (const app of INFRA_SERVICE_APPS) {
      expect(INFRA_APP_TO_PORT_KEY[app]).toBeTruthy();
    }
  });
});

describe('areAllInfraOnline', () => {
  test('全部 online 返回 true', () => {
    expect(
      infra.areAllInfraOnline({
        'config-service': 'online',
        cooperate: 'online',
        postgresql: 'online',
        redis: 'online',
      })
    ).toBe(true);
  });

  test('任一 stopped 返回 false', () => {
    expect(
      infra.areAllInfraOnline({
        'config-service': 'online',
        cooperate: 'stopped',
        postgresql: 'online',
        redis: 'online',
      })
    ).toBe(false);
  });

  test('任一 unknown（未注册）返回 false', () => {
    expect(
      infra.areAllInfraOnline({
        'config-service': 'online',
        cooperate: 'online',
        postgresql: 'unknown',
        redis: 'online',
      })
    ).toBe(false);
  });
});
