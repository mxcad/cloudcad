import { Test, TestingModule } from '@nestjs/testing';
import { StorePermissionStrategy } from './store-permission.strategy';
import { IPERMISSION_STORE } from '../../common/interfaces/permission-store.interface';
import { SystemPermission } from '../../common/enums/permissions.enum';

describe('StorePermissionStrategy', () => {
  let strategy: StorePermissionStrategy;

  const mockPermissionStore = {
    checkSystemPermission: jest.fn(),
    getUserSystemPermissions: jest.fn(),
    clearUserCache: jest.fn(),
  };

  describe('with store configured', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StorePermissionStrategy,
          { provide: IPERMISSION_STORE, useValue: mockPermissionStore },
        ],
      }).compile();
      strategy = module.get<StorePermissionStrategy>(StorePermissionStrategy);
    });

    it('should delegate checkSystemPermission', async () => {
      mockPermissionStore.checkSystemPermission.mockResolvedValue(true);
      const result = await strategy.checkSystemPermission('user-1', SystemPermission.SYSTEM_ADMIN);
      expect(result).toBe(true);
      expect(mockPermissionStore.checkSystemPermission).toHaveBeenCalledWith('user-1', SystemPermission.SYSTEM_ADMIN);
    });

    it('should delegate checkSystemPermissionsBatch', async () => {
      mockPermissionStore.getUserSystemPermissions.mockResolvedValue([
        SystemPermission.SYSTEM_USER_READ,
        SystemPermission.SYSTEM_ADMIN,
      ]);
      const result = await strategy.checkSystemPermissionsBatch('user-1', [
        SystemPermission.SYSTEM_USER_READ,
        SystemPermission.SYSTEM_USER_CREATE,
      ]);
      expect(result!.get(SystemPermission.SYSTEM_USER_READ)).toBe(true);
      expect(result!.get(SystemPermission.SYSTEM_USER_CREATE)).toBe(false);
    });

    it('should delegate clearUserCache', async () => {
      const result = await strategy.clearUserCache('user-1');
      expect(result).toBe(true);
      expect(mockPermissionStore.clearUserCache).toHaveBeenCalledWith('user-1');
    });

  });

  describe('without store configured', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      const module: TestingModule = await Test.createTestingModule({
        providers: [StorePermissionStrategy],
      }).compile();
      strategy = module.get<StorePermissionStrategy>(StorePermissionStrategy);
    });

    it('should return null from checkSystemPermission', async () => {
      const result = await strategy.checkSystemPermission('user-1', SystemPermission.SYSTEM_ADMIN);
      expect(result).toBeNull();
    });

    it('should return null from checkSystemPermissionsBatch', async () => {
      const result = await strategy.checkSystemPermissionsBatch('user-1', [SystemPermission.SYSTEM_ADMIN]);
      expect(result).toBeNull();
    });

    it('should return false from clearUserCache', async () => {
      const result = await strategy.clearUserCache('user-1');
      expect(result).toBe(false);
    });

  });
});
