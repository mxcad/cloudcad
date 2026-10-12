import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MxCadRequestAuthService } from './mxcad-request-auth.service';

// 服务只做「凭据 → 授权 userId / 节点角色判定」，无 IO。直接 new 注入 mock，
// 不走 TestingModule（避免拉起 JwtModule 的 ConfigModule 依赖）。
describe('MxCadRequestAuthService', () => {
  const mockJwtService: { verify: jest.Mock } = { verify: jest.fn() };

  const mockNodeService = {
    findUserById: jest.fn(),
  };

  const mockPermissionService = {
    getNodeAccessRole: jest.fn(),
  };

  const activeUser = {
    id: 'user-1',
    roleId: 'USER',
    status: 'ACTIVE',
  };

  function createService() {
    return new MxCadRequestAuthService(
      mockJwtService as unknown as JwtService,
      mockNodeService as any,
      mockPermissionService as any,
    );
  }

  function bearerRequest(extra: Record<string, unknown> = {}): any {
    return { headers: { authorization: 'Bearer valid-token' }, ...extra };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
    mockNodeService.findUserById.mockResolvedValue(activeUser);
  });

  describe('resolveUserId（严格）', () => {
    it('session 用户优先于 Bearer——不再解析 token', async () => {
      mockNodeService.findUserById.mockResolvedValue({ id: 'user-2', roleId: 'USER', status: 'ACTIVE' });
      const service = createService();
      const userId = await service.resolveUserId({ user: { id: 'user-2' } } as any);

      expect(userId).toBe('user-2');
      expect(mockJwtService.verify).not.toHaveBeenCalled();
      expect(mockNodeService.findUserById).toHaveBeenCalledWith('user-2', {
        id: true,
        roleId: true,
        status: true,
      });
    });

    it('Bearer token → userId', async () => {
      const service = createService();

      await expect(service.resolveUserId(bearerRequest())).resolves.toBe('user-1');
      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-token');
    });

    it('缺少 Authorization header 抛 UnauthorizedException', async () => {
      const service = createService();

      await expect(service.resolveUserId({ headers: {} } as any)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('token 无效时抛 UnauthorizedException 且不查用户', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      const service = createService();

      await expect(service.resolveUserId(bearerRequest())).rejects.toBeInstanceOf(UnauthorizedException);
      expect(mockNodeService.findUserById).not.toHaveBeenCalled();
    });

    it('用户不存在抛 UnauthorizedException（文案区分：用户不存在）', async () => {
      mockNodeService.findUserById.mockResolvedValue(null);
      const service = createService();

      await expect(service.resolveUserId(bearerRequest())).rejects.toMatchObject({
        status: 401,
        response: { message: '用户不存在' },
      });
    });

    it('用户被禁用抛 UnauthorizedException（文案区分：账号已禁用）', async () => {
      mockNodeService.findUserById.mockResolvedValue({ ...activeUser, status: 'DISABLED' });
      const service = createService();

      await expect(service.resolveUserId(bearerRequest())).rejects.toMatchObject({
        status: 401,
        response: { message: '用户账号已被禁用' },
      });
    });

    it('用户无 roleId 时 userRole 归一为 null（仅宽松模式可见）', async () => {
      mockNodeService.findUserById.mockResolvedValue({ id: 'user-1', status: 'ACTIVE' });
      const service = createService();

      const user = await service.resolveUserOrGuest(bearerRequest());

      expect(user).toEqual({ userId: 'user-1', userRole: null });
    });
  });

  describe('resolveUserOrGuest（宽松，失败降级匿名）', () => {
    it('无 Authorization header 返回 null', async () => {
      const service = createService();

      const user = await service.resolveUserOrGuest({ headers: {} } as any);

      expect(user).toBeNull();
      expect(mockJwtService.verify).not.toHaveBeenCalled();
    });

    it('token 无效返回 null（降级匿名，不抛）', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      const service = createService();

      expect(await service.resolveUserOrGuest(bearerRequest())).toBeNull();
    });

    it('BadRequestException（如 TokenExpiredError）向上抛——不静默降级', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new BadRequestException('jwt expired');
      });
      const service = createService();

      await expect(service.resolveUserOrGuest(bearerRequest())).rejects.toBeInstanceOf(BadRequestException);
    });

    it('用户不存在返回 null', async () => {
      mockNodeService.findUserById.mockResolvedValue(null);
      const service = createService();

      expect(await service.resolveUserOrGuest(bearerRequest())).toBeNull();
    });

    it('用户被禁用返回 null', async () => {
      mockNodeService.findUserById.mockResolvedValue({ ...activeUser, status: 'DISABLED' });
      const service = createService();

      expect(await service.resolveUserOrGuest(bearerRequest())).toBeNull();
    });

    it('用户查询抛错返回 null（降级匿名）', async () => {
      mockNodeService.findUserById.mockRejectedValue(new Error('db down'));
      const service = createService();

      expect(await service.resolveUserOrGuest(bearerRequest())).toBeNull();
    });

    it('有效 token → { userId, userRole }', async () => {
      const service = createService();

      expect(await service.resolveUserOrGuest(bearerRequest())).toEqual({
        userId: 'user-1',
        userRole: 'USER',
      });
    });
  });

  describe('canAccessNode', () => {
    it('有访问角色返回 true', async () => {
      mockPermissionService.getNodeAccessRole.mockResolvedValue('EDITOR');
      const service = createService();

      expect(await service.canAccessNode('user-1', 'node-1')).toBe(true);
      expect(mockPermissionService.getNodeAccessRole).toHaveBeenCalledWith('user-1', 'node-1');
    });

    it('无访问角色（null）返回 false', async () => {
      mockPermissionService.getNodeAccessRole.mockResolvedValue(null);
      const service = createService();

      expect(await service.canAccessNode('user-1', 'node-1')).toBe(false);
    });

    it('查询抛错时 fail-closed 返回 false', async () => {
      mockPermissionService.getNodeAccessRole.mockRejectedValue(new Error('db down'));
      const service = createService();

      expect(await service.canAccessNode('user-1', 'node-1')).toBe(false);
    });
  });
});
