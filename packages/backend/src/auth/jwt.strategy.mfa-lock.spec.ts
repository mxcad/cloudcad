import { ForbiddenException } from '@nestjs/common';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * JwtStrategy.validate 的 TOTP 强制引导锁定（#415 等保 8.1.4.1(d)）：
 * 未绑定 TOTP 的管理员仅 MFA 绑定页 + profile/登出可用，后台其余端点 403 拒绝。
 * 绕过 PassportStrategy 构造器（super 依赖 passport 实例），直接挂实例字段测 validate。
 */
describe('JwtStrategy.validate - TOTP 强制引导锁定（#415）', () => {
  let strategy: JwtStrategy;
  const userFindUnique = jest.fn();
  const getValue = jest.fn();
  const getRolePermissions = jest.fn();

  const basePayload = {
    sub: 'user-1',
    email: 'admin@example.com',
    username: 'admin',
    role: 'ADMIN',
    roleId: 'role-1',
    type: 'access',
  };

  /** 构造绕过构造器的策略实例（仅挂 validate 依赖字段） */
  const buildStrategy = (
    user: Record<string, unknown> | null,
    mfaEnforceEnabled: boolean
  ) => {
    userFindUnique.mockResolvedValue(user);
    getValue.mockResolvedValue(mfaEnforceEnabled);
    getRolePermissions.mockResolvedValue([]);

    const s = Object.create(JwtStrategy.prototype) as JwtStrategy;
    (s as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    (s as any).isDevelopment = false;
    (s as any).prisma = { user: { findUnique: userFindUnique } };
    (s as any).tokenBlacklistService = {
      isBlacklisted: jest.fn().mockResolvedValue(false),
      isUserBlacklisted: jest.fn().mockResolvedValue(false),
    };
    (s as any).roleInheritanceService = {
      getRolePermissions,
    };
    (s as any).runtimeConfigService = { getValue };
    // #416 口令到期强制引导：默认新鲜口令（不触发口令锁定）
    (s as any).passwordPolicyService = {
      getPasswordChangeStatus: jest
        .fn()
        .mockReturnValue({ required: undefined, expiringSoon: false }),
    };
    return s;
  };

  const request = (path: string) => ({ path });

  const ADMIN_USER = {
    id: 'user-1',
    status: 'ACTIVE',
    totpEnabled: false,
    role: { name: 'ADMIN', id: 'role-1' },
  };

  describe('总闸 mfaEnforceEnabled 开启', () => {
    it('未绑定 TOTP 的管理员访问非白名单路径 → 403 MFA_SETUP_REQUIRED', async () => {
      const s = buildStrategy(ADMIN_USER, true);
      const err = await (s as any)
        .validate(request('/api/v1/files'), basePayload)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      // 全局异常过滤器将 response 对象平铺进响应体（code 供前端识别）
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        statusCode: 403,
        code: 'MFA_SETUP_REQUIRED',
      });
    });

    it('锁定异常为 ForbiddenException（全局异常过滤器按 403 处理）', async () => {
      const s = buildStrategy(ADMIN_USER, true);
      await expect(
        (s as any).validate(request('/api/v1/users'), basePayload)
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('白名单路径 /admin/auth/mfa/setup 放行', async () => {
      const s = buildStrategy(ADMIN_USER, true);
      const result = await (s as any).validate(
        request('/api/v1/admin/auth/mfa/setup'),
        basePayload
      );
      expect(result.id).toBe('user-1');
      expect(result.role.name).toBe('ADMIN');
    });

    it('白名单路径 /admin/auth/mfa/bind 放行', async () => {
      const s = buildStrategy(ADMIN_USER, true);
      const result = await (s as any).validate(
        request('/api/v1/admin/auth/mfa/bind'),
        basePayload
      );
      expect(result.id).toBe('user-1');
    });

    it('白名单路径 /auth/profile 与 /auth/logout 放行', async () => {
      const s = buildStrategy(ADMIN_USER, true);
      for (const path of ['/api/v1/auth/profile', '/api/v1/auth/logout']) {
        const result = await (s as any).validate(request(path), basePayload);
        expect(result.id).toBe('user-1');
      }
    });

    it('已绑定 TOTP 的管理员：任意路径不锁定', async () => {
      const s = buildStrategy(
        { ...ADMIN_USER, totpEnabled: true },
        true
      );
      const result = await (s as any).validate(
        request('/api/v1/files'),
        basePayload
      );
      expect(result.id).toBe('user-1');
      expect(getValue).not.toHaveBeenCalled();
    });

    it('非 ADMIN 用户未绑定 TOTP：不锁定（锁定仅针对管理员）', async () => {
      const s = buildStrategy(
        { ...ADMIN_USER, role: { name: 'USER', id: 'role-2' } },
        true
      );
      const result = await (s as any).validate(
        request('/api/v1/files'),
        { ...basePayload, role: 'USER' }
      );
      expect(result.role.name).toBe('USER');
    });
  });

  describe('总闸 mfaEnforceEnabled 关闭（默认）', () => {
    it('未绑定 TOTP 的管理员不被锁定，正常放行', async () => {
      const s = buildStrategy(ADMIN_USER, false);
      const result = await (s as any).validate(
        request('/api/v1/files'),
        basePayload
      );
      expect(result.id).toBe('user-1');
    });
  });
});
