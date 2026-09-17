import { ForbiddenException } from '@nestjs/common';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * JwtStrategy.validate 的口令到期/首登未改密强制引导锁定（#416 等保 8.1.4.1 b)）：
 * passwordChangedAt=null（首登未改密）或距今超过 maxAgeDays 的管理员仅
 * change-password + profile 刷新/登出可用，后台其余端点 403 拒绝。
 * 判定基于 DB 实时 passwordChangedAt，改密成功（写 passwordChangedAt=now）后锁定自动解除。
 * 仅 ADMIN 角色生效；普通用户不做 180 天判定（体验优先）。
 *
 * 绕过 PassportStrategy 构造器（super 依赖 passport 实例），直接挂实例字段测 validate。
 * 与 jwt.strategy.mfa-lock.spec.ts 同构；totpEnabled=true 使 TOTP 锁定分支跳过，
 * 单独验证口令锁定，两个锁的白名单互不干扰。
 */
describe('JwtStrategy.validate - 口令到期强制引导锁定（#416）', () => {
  let strategy: JwtStrategy;
  const userFindUnique = jest.fn();
  const getValue = jest.fn();
  const getRolePermissions = jest.fn();
  const getPasswordChangeStatus = jest.fn();

  const basePayload = {
    sub: 'user-1',
    email: 'admin@example.com',
    username: 'admin',
    role: 'ADMIN',
    roleId: 'role-1',
    type: 'access',
  };

  /** 构造绕过构造器的策略实例（仅挂 validate 依赖字段） */
  const buildStrategy = (required?: 'first_login' | 'expired') => {
    userFindUnique.mockResolvedValue(ADMIN_USER);
    getValue.mockResolvedValue(false);
    getRolePermissions.mockResolvedValue([]);
    getPasswordChangeStatus.mockReturnValue({
      required,
      expiringSoon: false,
    });

    const s = Object.create(JwtStrategy.prototype) as JwtStrategy;
    (s as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    (s as any).isDevelopment = false;
    (s as any).prisma = { user: { findUnique: userFindUnique } };
    (s as any).tokenBlacklistService = {
      isBlacklisted: jest.fn().mockResolvedValue(false),
      isUserBlacklisted: jest.fn().mockResolvedValue(false),
    };
    (s as any).roleInheritanceService = { getRolePermissions };
    (s as any).runtimeConfigService = { getValue };
    (s as any).passwordPolicyService = { getPasswordChangeStatus };
    return s;
  };

  const request = (path: string) => ({ path });

  // totpEnabled=true：跳过 #415 TOTP 锁定分支，单独验证 #416 口令锁定
  const ADMIN_USER = {
    id: 'user-1',
    status: 'ACTIVE',
    totpEnabled: true,
    passwordChangedAt: null,
    role: { name: 'ADMIN', id: 'role-1' },
  };

  describe('口令锁定生效', () => {
    it('首登未改密的管理员访问非白名单路径 → 403 PASSWORD_CHANGE_REQUIRED', async () => {
      const s = buildStrategy('first_login');
      const err = await (s as any)
        .validate(request('/api/v1/files'), basePayload)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    });

    it('口令到期（expired）的管理员访问非白名单路径 → 403', async () => {
      const s = buildStrategy('expired');
      const err = await (s as any)
        .validate(request('/api/v1/admin/ip-whitelist'), basePayload)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    });

    it('白名单路径 /users/change-password 放行（改密是唯一出口）', async () => {
      const s = buildStrategy('first_login');
      const result = await (s as any).validate(
        request('/api/v1/users/change-password'),
        basePayload
      );
      expect(result.id).toBe('user-1');
      expect(result.role.name).toBe('ADMIN');
    });

    it('白名单路径 /auth/profile 与 /auth/logout 放行', async () => {
      const s = buildStrategy('expired');
      for (const path of ['/api/v1/auth/profile', '/api/v1/auth/logout']) {
        const result = await (s as any).validate(request(path), basePayload);
        expect(result.id).toBe('user-1');
      }
    });

    it('不覆盖 TOTP 绑定路径：口令锁定期访问 mfa/setup 仍被拒', async () => {
      const s = buildStrategy('first_login');
      const err = await (s as any)
        .validate(request('/api/v1/admin/auth/mfa/setup'), basePayload)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
    });

    it('锁定判定基于 DB 实时 passwordChangedAt（改密后自动解除）', async () => {
      const s = buildStrategy('first_login');
      // 首次判定：锁定
      await expect(
        (s as any).validate(request('/api/v1/files'), basePayload)
      ).rejects.toBeInstanceOf(ForbiddenException);
      // 改密成功后 getPasswordChangeStatus 返回无强改 → 同一 token 直接放行
      getPasswordChangeStatus.mockReturnValue({
        required: undefined,
        expiringSoon: false,
      });
      const result = await (s as any).validate(
        request('/api/v1/files'),
        basePayload
      );
      expect(result.id).toBe('user-1');
    });
  });

  describe('锁定边界', () => {
    it('口令新鲜的管理员：任意路径不锁定', async () => {
      const s = buildStrategy(undefined);
      const result = await (s as any).validate(
        request('/api/v1/files'),
        basePayload
      );
      expect(result.id).toBe('user-1');
      expect(getPasswordChangeStatus).toHaveBeenCalled();
    });

    it('非 ADMIN 用户口令过期：不锁定（180 天判定仅针对管理员）', async () => {
      const s = buildStrategy('expired');
      // buildStrategy 内部先设 ADMIN，此处改为普通用户（effectiveRole 取 DB 实时角色）
      userFindUnique.mockResolvedValue({
        ...ADMIN_USER,
        role: { name: 'USER', id: 'role-2' },
      });
      const result = await (s as any).validate(
        request('/api/v1/files'),
        { ...basePayload, role: 'USER' }
      );
      expect(result.role.name).toBe('USER');
      expect(getPasswordChangeStatus).not.toHaveBeenCalled();
    });

    it('即将到期（expiringSoon=true，未到期）不拦截，仅下发软提示', async () => {
      userFindUnique.mockResolvedValue(ADMIN_USER);
      getPasswordChangeStatus.mockReturnValue({
        required: undefined,
        expiringSoon: true,
      });
      const s = Object.create(JwtStrategy.prototype) as JwtStrategy;
      (s as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
      (s as any).isDevelopment = false;
      (s as any).prisma = { user: { findUnique: userFindUnique } };
      (s as any).tokenBlacklistService = {
        isBlacklisted: jest.fn().mockResolvedValue(false),
        isUserBlacklisted: jest.fn().mockResolvedValue(false),
      };
      (s as any).roleInheritanceService = { getRolePermissions };
      (s as any).runtimeConfigService = { getValue };
      (s as any).passwordPolicyService = { getPasswordChangeStatus };
      const result = await (s as any).validate(
        request('/api/v1/files'),
        basePayload
      );
      expect(result.id).toBe('user-1');
    });
  });
});
