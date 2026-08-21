import { resolve } from 'path';
import { AuthModule } from './auth.module';
import { OssAuthProvider } from './impl/providers/local-auth.provider';
import {
  AUTH_PROVIDER,
  AUTHENTICATION_HANDLER,
  OAUTH_HANDLER,
  SMS_AUTH_HANDLER,
  PASSWORD_RESET_HANDLER,
  ACCOUNT_BINDING_HANDLER,
  TOKEN_HANDLER,
} from '@cloudcad/contracts';

const FIXTURE_IMPL = resolve(__dirname, '../../test/fixtures/impl-coverage-fixture.js');

function resetRootModule() {
  (AuthModule as unknown as { rootModule: unknown }).rootModule = undefined;
}

describe('AuthModule.forRoot (OSS 始终注册 + IMPL 叠加覆盖层)', () => {
  const originalImpl = process.env.IMPL;

  afterEach(() => {
    resetRootModule();
    if (originalImpl === undefined) {
      delete process.env.IMPL;
    } else {
      process.env.IMPL = originalImpl;
    }
  });

  it('无 IMPL 时：只注册 OSS 默认 providers，AUTHENTICATION_HANDLER 指向 OssAuthProvider', () => {
    delete process.env.IMPL;
    const mod = AuthModule.forRoot();
    const providers = mod.providers ?? [];

    const authHandler = providers.find((p) => (p as { provide?: unknown }).provide === AUTHENTICATION_HANDLER);
    expect(authHandler).toBeDefined();
    expect((authHandler as { useExisting?: unknown }).useExisting).toBe(OssAuthProvider);
    expect((authHandler as { useClass?: unknown }).useClass).toBeUndefined();
  });

  it('有 IMPL 时：OSS 默认 providers 仍全部注册，且覆盖层叠加在最后（后注册者胜出）', () => {
    process.env.IMPL = FIXTURE_IMPL;
    const mod = AuthModule.forRoot();
    const providers = mod.providers ?? [];

    // OSS 的 AUTH_PROVIDER 仍存在（未被覆盖层替换/删除）
    const authProvider = providers.find((p) => (p as { provide?: unknown }).provide === AUTH_PROVIDER);
    expect(authProvider).toBeDefined();
    expect((authProvider as { useExisting?: unknown }).useExisting).toBe(OssAuthProvider);

    // 覆盖层只碰 AUTHENTICATION_HANDLER：它被叠加在数组最后，因此胜出
    const authHandlerIndexes = providers
      .map((p, i) => ((p as { provide?: unknown }).provide === AUTHENTICATION_HANDLER ? i : -1))
      .filter((i) => i >= 0);
    expect(authHandlerIndexes.length).toBeGreaterThanOrEqual(2);
    const lastAuthHandler = providers[authHandlerIndexes[authHandlerIndexes.length - 1]] as {
      useExisting?: { name?: string };
    };
    expect(lastAuthHandler.useExisting?.name).toBe('FixtureCoverageHandler');

    // 其余 handler token 一律未被覆盖层触碰（仍指向 OSS OssAuthProvider）
    for (const token of [
      OAUTH_HANDLER,
      SMS_AUTH_HANDLER,
      PASSWORD_RESET_HANDLER,
      ACCOUNT_BINDING_HANDLER,
      TOKEN_HANDLER,
    ]) {
      const matches = providers.filter((p) => (p as { provide?: unknown }).provide === token);
      expect(matches.length).toBe(1);
      expect((matches[0] as { useExisting?: unknown }).useExisting).toBe(OssAuthProvider);
    }
  });
});
