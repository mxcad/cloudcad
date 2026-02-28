import 'reflect-metadata';
import {
  RequirePermissions,
  PermissionCheckMode,
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
} from './require-permissions.decorator';
import { SystemPermission } from '../enums/permissions.enum';

describe('RequirePermissions Decorator', () => {
  describe('方法装饰器', () => {
    it('应该正确设置权限元数据到方法', () => {
      class TestController {
        @RequirePermissions([SystemPermission.SYSTEM_USER_READ])
        testMethod() {}
      }

      const metadata = Reflect.getMetadata(
        PERMISSIONS_KEY,
        TestController.prototype,
        'testMethod'
      );
      expect(metadata).toEqual([SystemPermission.SYSTEM_USER_READ]);
    });

    it('应该正确设置权限检查模式元数据到方法', () => {
      class TestController {
        @RequirePermissions(
          [
            SystemPermission.SYSTEM_USER_READ,
            SystemPermission.SYSTEM_USER_CREATE,
          ],
          PermissionCheckMode.ANY
        )
        testMethod() {}
      }

      const mode = Reflect.getMetadata(
        PERMISSIONS_MODE_KEY,
        TestController.prototype,
        'testMethod'
      );
      expect(mode).toBe(PermissionCheckMode.ANY);
    });

    it('默认模式应该是 ALL', () => {
      class TestController {
        @RequirePermissions([SystemPermission.SYSTEM_USER_READ])
        testMethod() {}
      }

      const mode = Reflect.getMetadata(
        PERMISSIONS_MODE_KEY,
        TestController.prototype,
        'testMethod'
      );
      expect(mode).toBe(PermissionCheckMode.ALL);
    });

    it('应该支持多个权限', () => {
      class TestController {
        @RequirePermissions([
          SystemPermission.SYSTEM_USER_READ,
          SystemPermission.SYSTEM_USER_CREATE,
          SystemPermission.SYSTEM_USER_UPDATE,
        ])
        testMethod() {}
      }

      const metadata = Reflect.getMetadata(
        PERMISSIONS_KEY,
        TestController.prototype,
        'testMethod'
      );
      expect(metadata).toHaveLength(3);
      expect(metadata).toContain(SystemPermission.SYSTEM_USER_READ);
      expect(metadata).toContain(SystemPermission.SYSTEM_USER_CREATE);
      expect(metadata).toContain(SystemPermission.SYSTEM_USER_UPDATE);
    });

    it('应该保持方法描述符不变', () => {
      class TestController {
        @RequirePermissions([SystemPermission.SYSTEM_USER_READ])
        testMethod() {
          return 'test';
        }
      }

      // 方法应该仍然可以被调用
      const instance = new TestController();
      expect(instance.testMethod()).toBe('test');
    });
  });

  describe('类装饰器', () => {
    it('应该正确设置权限元数据到类', () => {
      @RequirePermissions([SystemPermission.SYSTEM_ADMIN])
      class TestController {}

      const metadata = Reflect.getMetadata(PERMISSIONS_KEY, TestController);
      expect(metadata).toEqual([SystemPermission.SYSTEM_ADMIN]);
    });

    it('应该正确设置权限检查模式元数据到类', () => {
      @RequirePermissions(
        [SystemPermission.SYSTEM_ADMIN],
        PermissionCheckMode.ANY
      )
      class TestController {}

      const mode = Reflect.getMetadata(PERMISSIONS_MODE_KEY, TestController);
      expect(mode).toBe(PermissionCheckMode.ANY);
    });

    it('类装饰器应该返回原始类构造函数', () => {
      @RequirePermissions([SystemPermission.SYSTEM_ADMIN])
      class TestController {
        testMethod() {
          return 'test';
        }
      }

      const instance = new TestController();
      expect(instance.testMethod()).toBe('test');
    });
  });

  describe('权限检查模式', () => {
    it('PermissionCheckMode.ALL 应该等于 "ALL"', () => {
      expect(PermissionCheckMode.ALL).toBe('ALL');
    });

    it('PermissionCheckMode.ANY 应该等于 "ANY"', () => {
      expect(PermissionCheckMode.ANY).toBe('ANY');
    });
  });

  describe('边界情况', () => {
    it('应该支持空权限数组', () => {
      class TestController {
        @RequirePermissions([])
        testMethod() {}
      }

      const metadata = Reflect.getMetadata(
        PERMISSIONS_KEY,
        TestController.prototype,
        'testMethod'
      );
      expect(metadata).toEqual([]);
    });

    it('应该支持单个权限', () => {
      class TestController {
        @RequirePermissions([SystemPermission.SYSTEM_USER_READ])
        testMethod() {}
      }

      const metadata = Reflect.getMetadata(
        PERMISSIONS_KEY,
        TestController.prototype,
        'testMethod'
      );
      expect(metadata).toEqual([SystemPermission.SYSTEM_USER_READ]);
    });

    it('方法装饰器和类装饰器应该可以同时使用', () => {
      @RequirePermissions([SystemPermission.SYSTEM_ADMIN])
      class TestController {
        @RequirePermissions([SystemPermission.SYSTEM_USER_READ])
        testMethod() {}
      }

      const classMetadata = Reflect.getMetadata(
        PERMISSIONS_KEY,
        TestController
      );
      const methodMetadata = Reflect.getMetadata(
        PERMISSIONS_KEY,
        TestController.prototype,
        'testMethod'
      );

      expect(classMetadata).toEqual([SystemPermission.SYSTEM_ADMIN]);
      expect(methodMetadata).toEqual([SystemPermission.SYSTEM_USER_READ]);
    });

    it('方法装饰器应该覆盖类装饰器的模式', () => {
      @RequirePermissions(
        [SystemPermission.SYSTEM_ADMIN],
        PermissionCheckMode.ALL
      )
      class TestController {
        @RequirePermissions(
          [SystemPermission.SYSTEM_USER_READ],
          PermissionCheckMode.ANY
        )
        testMethod() {}
      }

      const classMode = Reflect.getMetadata(
        PERMISSIONS_MODE_KEY,
        TestController
      );
      const methodMode = Reflect.getMetadata(
        PERMISSIONS_MODE_KEY,
        TestController.prototype,
        'testMethod'
      );

      expect(classMode).toBe(PermissionCheckMode.ALL);
      expect(methodMode).toBe(PermissionCheckMode.ANY);
    });
  });

  describe('回归测试 - 修复的问题', () => {
    it('修复：方法装饰器元数据应该被正确设置（使用 Reflect.defineMetadata）', () => {
      // 这是一个回归测试，确保方法装饰器的元数据被正确设置
      // 之前的 bug 是 SetMetadata 返回值未被正确使用
      class TestController {
        @RequirePermissions([SystemPermission.SYSTEM_USER_READ])
        testMethod() {}
      }

      // 验证元数据确实被设置到方法上
      const hasMetadata = Reflect.hasMetadata(
        PERMISSIONS_KEY,
        TestController.prototype,
        'testMethod'
      );
      expect(hasMetadata).toBe(true);

      const metadata = Reflect.getMetadata(
        PERMISSIONS_KEY,
        TestController.prototype,
        'testMethod'
      );
      expect(metadata).toBeDefined();
      expect(Array.isArray(metadata)).toBe(true);
    });

    it('修复：方法装饰器模式元数据应该被正确设置', () => {
      class TestController {
        @RequirePermissions(
          [SystemPermission.SYSTEM_USER_READ],
          PermissionCheckMode.ANY
        )
        testMethod() {}
      }

      // 验证模式元数据也被正确设置
      const hasModeMetadata = Reflect.hasMetadata(
        PERMISSIONS_MODE_KEY,
        TestController.prototype,
        'testMethod'
      );
      expect(hasModeMetadata).toBe(true);

      const mode = Reflect.getMetadata(
        PERMISSIONS_MODE_KEY,
        TestController.prototype,
        'testMethod'
      );
      expect(mode).toBe(PermissionCheckMode.ANY);
    });
  });
});
