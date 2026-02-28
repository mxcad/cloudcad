import {
  SystemRole,
  ProjectRole,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLE_HIERARCHY,
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
  SystemPermission,
  ProjectPermission,
} from './permissions.enum';

describe('权限枚举', () => {
  describe('SystemRole', () => {
    it('应该定义所有系统角色', () => {
      expect(SystemRole.ADMIN).toBe('ADMIN');
      expect(SystemRole.USER_MANAGER).toBe('USER_MANAGER');
      expect(SystemRole.FONT_MANAGER).toBe('FONT_MANAGER');
      expect(SystemRole.USER).toBe('USER');
    });

    it('系统角色数量应该是 4 个', () => {
      const roles = Object.values(SystemRole);
      expect(roles).toHaveLength(4);
    });
  });

  describe('ProjectRole', () => {
    it('应该定义所有项目角色', () => {
      expect(ProjectRole.OWNER).toBe('PROJECT_OWNER');
      expect(ProjectRole.ADMIN).toBe('PROJECT_ADMIN');
      expect(ProjectRole.EDITOR).toBe('PROJECT_EDITOR');
      expect(ProjectRole.MEMBER).toBe('PROJECT_MEMBER');
      expect(ProjectRole.VIEWER).toBe('PROJECT_VIEWER');
    });

    it('项目角色数量应该是 5 个', () => {
      const roles = Object.values(ProjectRole);
      expect(roles).toHaveLength(5);
    });
  });

  describe('SYSTEM_ROLE_PERMISSIONS', () => {
    it('ADMIN 角色应该拥有所有系统权限', () => {
      const adminPermissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.ADMIN];
      expect(adminPermissions).toContain(SystemPermission.SYSTEM_USER_READ);
      expect(adminPermissions).toContain(SystemPermission.SYSTEM_USER_CREATE);
      expect(adminPermissions).toContain(SystemPermission.SYSTEM_ADMIN);
    });

    it('USER_MANAGER 角色应该拥有用户管理权限', () => {
      const userManagerPermissions =
        SYSTEM_ROLE_PERMISSIONS[SystemRole.USER_MANAGER];
      expect(userManagerPermissions).toContain(
        SystemPermission.SYSTEM_USER_READ
      );
      expect(userManagerPermissions).toContain(
        SystemPermission.SYSTEM_USER_CREATE
      );
      expect(userManagerPermissions).toContain(
        SystemPermission.SYSTEM_USER_UPDATE
      );
      expect(userManagerPermissions).toContain(
        SystemPermission.SYSTEM_USER_DELETE
      );
    });

    it('FONT_MANAGER 角色应该拥有字体管理权限', () => {
      const fontManagerPermissions =
        SYSTEM_ROLE_PERMISSIONS[SystemRole.FONT_MANAGER];
      expect(fontManagerPermissions).toContain(
        SystemPermission.SYSTEM_FONT_READ
      );
      expect(fontManagerPermissions).toContain(
        SystemPermission.SYSTEM_FONT_UPLOAD
      );
      expect(fontManagerPermissions).toContain(
        SystemPermission.SYSTEM_FONT_DELETE
      );
      expect(fontManagerPermissions).toContain(
        SystemPermission.SYSTEM_FONT_DOWNLOAD
      );
    });

    it('USER 角色默认没有系统权限', () => {
      const userPermissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.USER];
      expect(userPermissions).toHaveLength(0);
    });

    it('所有系统角色的权限数组不应该有重复项', () => {
      for (const [role, permissions] of Object.entries(
        SYSTEM_ROLE_PERMISSIONS
      )) {
        const uniquePermissions = new Set(permissions);
        const hasDuplicates = permissions.length !== uniquePermissions.size;
        expect(hasDuplicates).toBe(false);
      }
    });
  });

  describe('SYSTEM_ROLE_HIERARCHY', () => {
    it('ADMIN 角色应该没有父角色', () => {
      expect(SYSTEM_ROLE_HIERARCHY[SystemRole.ADMIN]).toBeNull();
    });

    it('USER 角色应该没有父角色', () => {
      expect(SYSTEM_ROLE_HIERARCHY[SystemRole.USER]).toBeNull();
    });

    it('USER_MANAGER 应该继承自 USER', () => {
      expect(SYSTEM_ROLE_HIERARCHY[SystemRole.USER_MANAGER]).toBe(
        SystemRole.USER
      );
    });

    it('FONT_MANAGER 应该继承自 USER', () => {
      expect(SYSTEM_ROLE_HIERARCHY[SystemRole.FONT_MANAGER]).toBe(
        SystemRole.USER
      );
    });
  });

  describe('DEFAULT_PROJECT_ROLE_PERMISSIONS', () => {
    it('OWNER 角色应该拥有所有项目权限', () => {
      const ownerPermissions =
        DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.OWNER];
      expect(ownerPermissions).toContain(ProjectPermission.PROJECT_UPDATE);
      expect(ownerPermissions).toContain(ProjectPermission.PROJECT_DELETE);
      expect(ownerPermissions).toContain(
        ProjectPermission.PROJECT_MEMBER_MANAGE
      );
      expect(ownerPermissions).toContain(ProjectPermission.FILE_CREATE);
      expect(ownerPermissions).toContain(ProjectPermission.CAD_SAVE);
    });

    it('ADMIN 角色应该拥有大部分项目权限（除了删除和转让）', () => {
      const adminPermissions =
        DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.ADMIN];
      expect(adminPermissions).toContain(ProjectPermission.PROJECT_UPDATE);
      expect(adminPermissions).toContain(
        ProjectPermission.PROJECT_MEMBER_MANAGE
      );
      expect(adminPermissions).not.toContain(ProjectPermission.PROJECT_DELETE);
      expect(adminPermissions).not.toContain(
        ProjectPermission.PROJECT_TRANSFER
      );
    });

    it('MEMBER 角色应该有基础编辑权限', () => {
      const memberPermissions =
        DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER];
      expect(memberPermissions).toContain(ProjectPermission.FILE_CREATE);
      expect(memberPermissions).toContain(ProjectPermission.FILE_UPLOAD);
      expect(memberPermissions).toContain(ProjectPermission.FILE_EDIT);
      expect(memberPermissions).not.toContain(
        ProjectPermission.PROJECT_MEMBER_MANAGE
      );
    });

    it('EDITOR 角色应该有文件编辑权限但没有创建权限', () => {
      const editorPermissions =
        DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.EDITOR];
      expect(editorPermissions).toContain(ProjectPermission.FILE_EDIT);
      expect(editorPermissions).toContain(ProjectPermission.FILE_UPLOAD);
      expect(editorPermissions).not.toContain(ProjectPermission.FILE_CREATE);
      expect(editorPermissions).not.toContain(ProjectPermission.PROJECT_UPDATE);
    });

    it('VIEWER 角色应该只有只读权限', () => {
      const viewerPermissions =
        DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.VIEWER];
      expect(viewerPermissions).toContain(ProjectPermission.FILE_OPEN);
      expect(viewerPermissions).toContain(ProjectPermission.FILE_DOWNLOAD);
      expect(viewerPermissions).toContain(ProjectPermission.CAD_EXPORT);
      expect(viewerPermissions).not.toContain(ProjectPermission.FILE_EDIT);
      expect(viewerPermissions).not.toContain(ProjectPermission.FILE_DELETE);
    });

    it('修复：所有项目角色的权限数组不应该有重复项', () => {
      // 这是一个回归测试，确保修复后没有重复权限
      // 之前的 bug 是 ProjectRole.ADMIN 中有多项权限重复
      for (const [role, permissions] of Object.entries(
        DEFAULT_PROJECT_ROLE_PERMISSIONS
      )) {
        const uniquePermissions = new Set(permissions);
        const hasDuplicates = permissions.length !== uniquePermissions.size;
        expect(hasDuplicates).toBe(false);
      }
    });

    it('权限应该按照层级递减', () => {
      // OWNER > ADMIN > MEMBER > EDITOR > VIEWER
      const ownerPerms = new Set(
        DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.OWNER]
      );
      const adminPerms = new Set(
        DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.ADMIN]
      );
      const memberPerms = new Set(
        DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER]
      );
      const editorPerms = new Set(
        DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.EDITOR]
      );
      const viewerPerms = new Set(
        DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.VIEWER]
      );

      // OWNER 应该包含 ADMIN 的所有权限（除了 OWNER 特有的）
      for (const perm of adminPerms) {
        expect(ownerPerms.has(perm)).toBe(true);
      }

      // VIEWER 的权限应该最少
      expect(viewerPerms.size).toBeLessThan(editorPerms.size);
      expect(editorPerms.size).toBeLessThan(memberPerms.size);
      expect(memberPerms.size).toBeLessThanOrEqual(adminPerms.size);
    });
  });

  describe('回归测试 - 修复的问题', () => {
    it('修复：ProjectRole.ADMIN 权限数组不应该有重复项', () => {
      // 专门针对修复的问题进行测试
      const adminPermissions =
        DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.ADMIN];

      // 检查是否有重复
      const seen = new Set<string>();
      const duplicates: string[] = [];

      for (const perm of adminPermissions) {
        if (seen.has(perm)) {
          duplicates.push(perm);
        }
        seen.add(perm);
      }

      expect(duplicates).toHaveLength(0);
    });

    it('修复：ProjectRole.ADMIN 权限数量应该是正确的', () => {
      const adminPermissions =
        DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.ADMIN];
      // 预期有 15 个不重复的权限
      expect(adminPermissions).toHaveLength(15);
    });
  });
});
