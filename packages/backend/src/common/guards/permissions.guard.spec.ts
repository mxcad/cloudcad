// //////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// //////////////////////////////////////////////////////////////////////////////

import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { IPERMISSION_SERVICE } from '../../permission/interfaces/permission-service.interface';
import { SystemPermission } from '../enums/permissions.enum';
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  PermissionCheckMode,
} from '../decorators/require-permissions.decorator';
import { IS_OPTIONAL_AUTH_KEY } from '../../auth/decorators/optional-auth.decorator';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Record<string, jest.Mock>;
  let permissionService: Record<string, jest.Mock>;

  beforeEach(async () => {
    reflector = { getAllAndOverride: jest.fn() };
    permissionService = { checkSystemPermission: jest.fn() };

    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === PERMISSIONS_KEY) {
        return [SystemPermission.LIBRARY_DRAWING_MANAGE];
      }
      if (key === PERMISSIONS_MODE_KEY) {
        return PermissionCheckMode.ALL;
      }
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        { provide: Reflector, useValue: reflector },
        { provide: IPERMISSION_SERVICE, useValue: permissionService },
      ],
    }).compile();

    guard = module.get(PermissionsGuard);
  });

  const buildContext = (user?: { id: string }) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as any;

  it('checks system permission by userId and allows when granted', async () => {
    permissionService.checkSystemPermission.mockResolvedValue(true);

    const result = await guard.canActivate(buildContext({ id: 'user-1' }));

    expect(result).toBe(true);
    expect(permissionService.checkSystemPermission).toHaveBeenCalledWith(
      'user-1',
      SystemPermission.LIBRARY_DRAWING_MANAGE
    );
  });

  it('throws ForbiddenException when permission is missing', async () => {
    permissionService.checkSystemPermission.mockResolvedValue(false);

    await expect(
      guard.canActivate(buildContext({ id: 'user-1' }))
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws ForbiddenException when unauthenticated and not OptionalAuth', async () => {
    await expect(
      guard.canActivate(buildContext(undefined))
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows unauthenticated request when marked OptionalAuth', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === PERMISSIONS_KEY) {
        return [SystemPermission.LIBRARY_DRAWING_MANAGE];
      }
      if (key === IS_OPTIONAL_AUTH_KEY) {
        return true;
      }
      return undefined;
    });

    const result = await guard.canActivate(buildContext(undefined));
    expect(result).toBe(true);
  });
});
