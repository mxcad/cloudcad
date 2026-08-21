/**
 * 覆盖层 fixture：模拟 impl-mx 私有包的 dist 入口。
 * 仅供 auth.module.spec.ts 验证「OSS 始终注册 + IMPL 叠加覆盖层」的加载翻转逻辑，
 * 不依赖 gitignore 的 packages/impl-mx/dist。
 * 注意：纯 CJS + 无装饰器（Node 直载 .js 不支持 decorator）。
 */
const AUTHENTICATION_HANDLER = 'IAuthenticationHandler';

class FixtureCoverageHandler {
  async login() {
    return { coverage: 'fixture' };
  }
  async register() {
    return { coverage: 'fixture' };
  }
  async getUserInfo() {
    return { coverage: 'fixture' };
  }
}

function createAuthProviders() {
  return [
    FixtureCoverageHandler,
    { provide: AUTHENTICATION_HANDLER, useExisting: FixtureCoverageHandler },
    // 覆盖层绝不允许碰其他 handler token —— 测试断言其未被注册
  ];
}

module.exports = { createAuthProviders };
