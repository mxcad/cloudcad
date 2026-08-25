import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MetricsAccessGuard } from './metrics-access.guard';
import {
  IPERMISSION_SERVICE,
  type IPermissionService,
} from '../permission/interfaces/permission-service.interface';
import { SystemPermission } from '../common/enums/permissions.enum';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';

describe('MetricsAccessGuard', () => {
  const reflectorMock = {
    getAllAndOverride: jest.fn(),
  };

  const permissionServiceMock = {
    checkSystemPermission: jest.fn(),
  };

  let guard: MetricsAccessGuard;

  const createContext = (request: Record<string, any>): ExecutionContext =>
    ({
      getHandler: () => 'handler',
      getClass: () => 'class',
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    // jest 配置含 resetMocks，外部定义的 mock 实现会被清空，需在 beforeEach 重设
    reflectorMock.getAllAndOverride.mockImplementation((key: string) =>
      key === PERMISSIONS_KEY ? [SystemPermission.SYSTEM_MONITOR] : undefined,
    );
    guard = new MetricsAccessGuard(
      reflectorMock as unknown as Reflector,
      permissionServiceMock as unknown as IPermissionService,
    );
  });

  it('抓取令牌认证通过（isScrapeAuth）时直接放行，不做权限检查', async () => {
    const request = { isScrapeAuth: true };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(permissionServiceMock.checkSystemPermission).not.toHaveBeenCalled();
  });

  it('无标记且无用户身份时抛 ForbiddenException（回退权限检查）', async () => {
    await expect(
      guard.canActivate(createContext({})),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('无标记但有用户且有 SYSTEM_MONITOR 权限时放行', async () => {
    permissionServiceMock.checkSystemPermission.mockResolvedValue(true);

    await expect(
      guard.canActivate(createContext({ user: { id: 'user-1' } })),
    ).resolves.toBe(true);
    expect(permissionServiceMock.checkSystemPermission).toHaveBeenCalledWith(
      'user-1',
      SystemPermission.SYSTEM_MONITOR,
    );
  });

  it('无标记但用户无权限时抛 ForbiddenException', async () => {
    permissionServiceMock.checkSystemPermission.mockResolvedValue(false);

    await expect(
      guard.canActivate(createContext({ user: { id: 'user-2' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
