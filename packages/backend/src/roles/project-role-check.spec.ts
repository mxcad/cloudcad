import { Test, TestingModule } from '@nestjs/testing';
import { ProjectPermissionService } from './project-permission.service';
import { DatabaseService } from '../database/database.service';
import { ProjectRolesService } from './project-roles.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { AuditLogService } from '../audit/audit-log.service';
import {
  ProjectPermission,
  ProjectRole,
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
  SystemRole,
  SystemPermission,
  SYSTEM_ROLE_PERMISSIONS,
} from '../common/enums/permissions.enum';

describe('ProjectPermissionService', () => {
  let service: ProjectPermissionService;
  let prisma: DatabaseService;
  let cacheService: PermissionCacheService;

  const mockPrisma = {
    fileSystemNode: {
      findUnique: jest.fn(),
    },
    projectMember: {
      findUnique: jest.fn(),
    },
  };

  const mockProjectRolesService = {
    getRolePermissions: jest.fn(),
  };

  const mockCacheService = {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    delete: jest.fn(),
  };

  const mockAuditLogService = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectPermissionService,
        {
          provide: DatabaseService,
          useValue: mockPrisma,
        },
        {
          provide: ProjectRolesService,
          useValue: mockProjectRolesService,
        },
        {
          provide: PermissionCacheService,
          useValue: mockCacheService,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    })
      .setLogger({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
      })
      .compile();

    service = module.get<ProjectPermissionService>(ProjectPermissionService);
    prisma = module.get<DatabaseService>(DatabaseService);
    cacheService = module.get<PermissionCacheService>(PermissionCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ProjectRole 枚举值', () => {
    it('OWNER 枚举值应该是 PROJECT_OWNER', () => {
      expect(ProjectRole.OWNER).toBe('PROJECT_OWNER');
    });

    it('ADMIN 枚举值应该是 PROJECT_ADMIN', () => {
      expect(ProjectRole.ADMIN).toBe('PROJECT_ADMIN');
    });

    it('MEMBER 枚举值应该是 PROJECT_MEMBER', () => {
      expect(ProjectRole.MEMBER).toBe('PROJECT_MEMBER');
    });

    it('EDITOR 枚举值应该是 PROJECT_EDITOR', () => {
      expect(ProjectRole.EDITOR).toBe('PROJECT_EDITOR');
    });

    it('VIEWER 枚举值应该是 PROJECT_VIEWER', () => {
      expect(ProjectRole.VIEWER).toBe('PROJECT_VIEWER');
    });
  });

  describe('DEFAULT_PROJECT_ROLE_PERMISSIONS 权限映射', () => {
    it('OWNER 应该拥有所有项目权限', () => {
      const ownerPermissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.OWNER];
      const allPermissions = Object.values(ProjectPermission);
      expect(ownerPermissions.length).toBe(allPermissions.length);
    });

    it('ADMIN 应该拥有成员管理权限', () => {
      const adminPermissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.ADMIN];
      expect(adminPermissions).toContain(ProjectPermission.PROJECT_MEMBER_MANAGE);
      expect(adminPermissions).toContain(ProjectPermission.PROJECT_MEMBER_ASSIGN);
    });

    it('ADMIN 不应该拥有删除项目权限', () => {
      const adminPermissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.ADMIN];
      expect(adminPermissions).not.toContain(ProjectPermission.PROJECT_DELETE);
    });

    it('MEMBER 应该拥有文件创建权限', () => {
      const memberPermissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER];
      expect(memberPermissions).toContain(ProjectPermission.FILE_CREATE);
      expect(memberPermissions).toContain(ProjectPermission.FILE_UPLOAD);
    });

    it('MEMBER 不应该拥有成员管理权限', () => {
      const memberPermissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER];
      expect(memberPermissions).not.toContain(ProjectPermission.PROJECT_MEMBER_MANAGE);
    });

    it('VIEWER 只应该拥有只读权限', () => {
      const viewerPermissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.VIEWER];
      expect(viewerPermissions).toContain(ProjectPermission.FILE_OPEN);
      expect(viewerPermissions).toContain(ProjectPermission.FILE_DOWNLOAD);
      expect(viewerPermissions).not.toContain(ProjectPermission.FILE_CREATE);
      expect(viewerPermissions).not.toContain(ProjectPermission.FILE_EDIT);
      expect(viewerPermissions).not.toContain(ProjectPermission.FILE_DELETE);
    });
  });

  describe('isProjectOwner', () => {
    it('应该在用户是项目所有者时返回 true', async () => {
      const userId = 'user-123';
      const projectId = 'project-123';

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: userId,
      });
      mockCacheService.get.mockReturnValue(null);

      const result = await service.isProjectOwner(userId, projectId);

      expect(result).toBe(true);
    });

    it('应该在用户不是项目所有者时返回 false', async () => {
      const userId = 'user-123';
      const projectId = 'project-123';

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: 'other-user',
      });
      mockCacheService.get.mockReturnValue(null);

      const result = await service.isProjectOwner(userId, projectId);

      expect(result).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('应该在用户具有 ADMIN 角色时返回 true', async () => {
      const userId = 'user-123';
      const projectId = 'project-123';

      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: { name: ProjectRole.ADMIN },
      });
      mockCacheService.get.mockReturnValue(null);

      const result = await service.hasRole(userId, projectId, [
        ProjectRole.OWNER,
        ProjectRole.ADMIN,
      ]);

      expect(result).toBe(true);
    });

    it('应该在用户只有 VIEWER 角色时对 ADMIN 要求返回 false', async () => {
      const userId = 'user-123';
      const projectId = 'project-123';

      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: { name: ProjectRole.VIEWER },
      });
      mockCacheService.get.mockReturnValue(null);

      const result = await service.hasRole(userId, projectId, [
        ProjectRole.OWNER,
        ProjectRole.ADMIN,
      ]);

      expect(result).toBe(false);
    });

    it('应该在用户不是项目成员时返回 false', async () => {
      const userId = 'user-123';
      const projectId = 'project-123';

      mockPrisma.projectMember.findUnique.mockResolvedValue(null);
      mockCacheService.get.mockReturnValue(null);

      const result = await service.hasRole(userId, projectId, [
        ProjectRole.OWNER,
        ProjectRole.ADMIN,
      ]);

      expect(result).toBe(false);
    });
  });

  describe('checkPermission', () => {
    it('项目所有者应该拥有所有权限', async () => {
      const userId = 'user-123';
      const projectId = 'project-123';

      // 模拟项目所有者
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: userId,
      });
      mockCacheService.get.mockReturnValue(null);

      const result = await service.checkPermission(
        userId,
        projectId,
        ProjectPermission.PROJECT_DELETE
      );

      expect(result).toBe(true);
    });

    it('ADMIN 应该拥有成员管理权限', async () => {
      const userId = 'user-123';
      const projectId = 'project-123';

      // 模拟不是项目所有者
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: 'other-user',
      });

      // 模拟 ADMIN 角色
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: {
          permissions: DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.ADMIN].map(
            (p) => ({ permission: p })
          ),
        },
      });
      mockCacheService.get.mockReturnValue(null);

      const result = await service.checkPermission(
        userId,
        projectId,
        ProjectPermission.PROJECT_MEMBER_MANAGE
      );

      expect(result).toBe(true);
    });

    it('VIEWER 不应该拥有文件编辑权限', async () => {
      const userId = 'user-123';
      const projectId = 'project-123';

      // 模拟不是项目所有者
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        ownerId: 'other-user',
      });

      // 模拟 VIEWER 角色
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: {
          permissions: DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.VIEWER].map(
            (p) => ({ permission: p })
          ),
        },
      });
      mockCacheService.get.mockReturnValue(null);

      const result = await service.checkPermission(
        userId,
        projectId,
        ProjectPermission.FILE_EDIT
      );

      expect(result).toBe(false);
    });
  });

  describe('getUserRole', () => {
    it('应该返回用户的角色', async () => {
      const userId = 'user-123';
      const projectId = 'project-123';

      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: { name: ProjectRole.EDITOR },
      });
      mockCacheService.get.mockReturnValue(null);

      const result = await service.getUserRole(userId, projectId);

      expect(result).toBe(ProjectRole.EDITOR);
    });

    it('应该在用户不是项目成员时返回 null', async () => {
      const userId = 'user-123';
      const projectId = 'project-123';

      mockPrisma.projectMember.findUnique.mockResolvedValue(null);
      mockCacheService.get.mockReturnValue(null);

      const result = await service.getUserRole(userId, projectId);

      expect(result).toBeNull();
    });
  });

  describe('角色权限边界测试', () => {
    it('OWNER 应该可以删除项目', () => {
      const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.OWNER];
      expect(permissions).toContain(ProjectPermission.PROJECT_DELETE);
    });

    it('ADMIN 不可以删除项目', () => {
      const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.ADMIN];
      expect(permissions).not.toContain(ProjectPermission.PROJECT_DELETE);
    });

    it('ADMIN 应该可以管理回收站', () => {
      const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.ADMIN];
      expect(permissions).toContain(ProjectPermission.FILE_TRASH_MANAGE);
    });

    it('MEMBER 不可以管理回收站', () => {
      const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER];
      expect(permissions).not.toContain(ProjectPermission.FILE_TRASH_MANAGE);
    });

    it('EDITOR 应该可以编辑文件', () => {
      const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.EDITOR];
      expect(permissions).toContain(ProjectPermission.FILE_EDIT);
    });

    it('VIEWER 不可以编辑文件', () => {
      const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.VIEWER];
      expect(permissions).not.toContain(ProjectPermission.FILE_EDIT);
    });
  });

  // ==================== 详细权限测试 ====================
  describe('项目管理权限详细测试', () => {
    describe('PROJECT_UPDATE - 更新项目', () => {
      it('OWNER 应该拥有 PROJECT_UPDATE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.OWNER];
        expect(permissions).toContain(ProjectPermission.PROJECT_UPDATE);
      });

      it('ADMIN 应该拥有 PROJECT_UPDATE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.ADMIN];
        expect(permissions).toContain(ProjectPermission.PROJECT_UPDATE);
      });

      it('MEMBER 不应该拥有 PROJECT_UPDATE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER];
        expect(permissions).not.toContain(ProjectPermission.PROJECT_UPDATE);
      });

      it('EDITOR 不应该拥有 PROJECT_UPDATE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.EDITOR];
        expect(permissions).not.toContain(ProjectPermission.PROJECT_UPDATE);
      });

      it('VIEWER 不应该拥有 PROJECT_UPDATE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.VIEWER];
        expect(permissions).not.toContain(ProjectPermission.PROJECT_UPDATE);
      });
    });

    describe('PROJECT_DELETE - 删除项目', () => {
      it('只有 OWNER 应该拥有 PROJECT_DELETE 权限', () => {
        const allRoles = [ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER, ProjectRole.EDITOR, ProjectRole.VIEWER];
        allRoles.forEach((role) => {
          const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[role];
          if (role === ProjectRole.OWNER) {
            expect(permissions).toContain(ProjectPermission.PROJECT_DELETE);
          } else {
            expect(permissions).not.toContain(ProjectPermission.PROJECT_DELETE);
          }
        });
      });
    });

    describe('PROJECT_TRANSFER - 转让项目', () => {
      it('只有 OWNER 应该拥有 PROJECT_TRANSFER 权限', () => {
        const allRoles = [ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER, ProjectRole.EDITOR, ProjectRole.VIEWER];
        allRoles.forEach((role) => {
          const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[role];
          if (role === ProjectRole.OWNER) {
            expect(permissions).toContain(ProjectPermission.PROJECT_TRANSFER);
          } else {
            expect(permissions).not.toContain(ProjectPermission.PROJECT_TRANSFER);
          }
        });
      });
    });

    describe('PROJECT_MEMBER_MANAGE - 成员管理', () => {
      it('OWNER 应该拥有 PROJECT_MEMBER_MANAGE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.OWNER];
        expect(permissions).toContain(ProjectPermission.PROJECT_MEMBER_MANAGE);
      });

      it('ADMIN 应该拥有 PROJECT_MEMBER_MANAGE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.ADMIN];
        expect(permissions).toContain(ProjectPermission.PROJECT_MEMBER_MANAGE);
      });

      it('MEMBER 不应该拥有 PROJECT_MEMBER_MANAGE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER];
        expect(permissions).not.toContain(ProjectPermission.PROJECT_MEMBER_MANAGE);
      });
    });

    describe('PROJECT_ROLE_MANAGE - 角色管理', () => {
      it('只有 OWNER 应该拥有 PROJECT_ROLE_MANAGE 权限', () => {
        const allRoles = [ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER, ProjectRole.EDITOR, ProjectRole.VIEWER];
        allRoles.forEach((role) => {
          const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[role];
          if (role === ProjectRole.OWNER) {
            expect(permissions).toContain(ProjectPermission.PROJECT_ROLE_MANAGE);
          } else {
            expect(permissions).not.toContain(ProjectPermission.PROJECT_ROLE_MANAGE);
          }
        });
      });
    });
  });

  describe('文件操作权限详细测试', () => {
    describe('FILE_CREATE - 创建文件', () => {
      it('OWNER 应该拥有 FILE_CREATE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.OWNER];
        expect(permissions).toContain(ProjectPermission.FILE_CREATE);
      });

      it('ADMIN 应该拥有 FILE_CREATE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.ADMIN];
        expect(permissions).toContain(ProjectPermission.FILE_CREATE);
      });

      it('MEMBER 应该拥有 FILE_CREATE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER];
        expect(permissions).toContain(ProjectPermission.FILE_CREATE);
      });

      it('EDITOR 不应该拥有 FILE_CREATE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.EDITOR];
        expect(permissions).not.toContain(ProjectPermission.FILE_CREATE);
      });

      it('VIEWER 不应该拥有 FILE_CREATE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.VIEWER];
        expect(permissions).not.toContain(ProjectPermission.FILE_CREATE);
      });
    });

    describe('FILE_UPLOAD - 上传文件', () => {
      it('MEMBER 应该拥有 FILE_UPLOAD 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER];
        expect(permissions).toContain(ProjectPermission.FILE_UPLOAD);
      });

      it('EDITOR 应该拥有 FILE_UPLOAD 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.EDITOR];
        expect(permissions).toContain(ProjectPermission.FILE_UPLOAD);
      });

      it('VIEWER 不应该拥有 FILE_UPLOAD 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.VIEWER];
        expect(permissions).not.toContain(ProjectPermission.FILE_UPLOAD);
      });
    });

    describe('FILE_OPEN - 打开文件', () => {
      it('所有角色都应该拥有 FILE_OPEN 权限', () => {
        const allRoles = [ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER, ProjectRole.EDITOR, ProjectRole.VIEWER];
        allRoles.forEach((role) => {
          const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[role];
          expect(permissions).toContain(ProjectPermission.FILE_OPEN);
        });
      });
    });

    describe('FILE_EDIT - 编辑文件', () => {
      it('VIEWER 不应该拥有 FILE_EDIT 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.VIEWER];
        expect(permissions).not.toContain(ProjectPermission.FILE_EDIT);
      });

      it('EDITOR 应该拥有 FILE_EDIT 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.EDITOR];
        expect(permissions).toContain(ProjectPermission.FILE_EDIT);
      });
    });

    describe('FILE_DELETE - 删除文件', () => {
      it('VIEWER 不应该拥有 FILE_DELETE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.VIEWER];
        expect(permissions).not.toContain(ProjectPermission.FILE_DELETE);
      });

      it('MEMBER 应该拥有 FILE_DELETE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER];
        expect(permissions).toContain(ProjectPermission.FILE_DELETE);
      });

      it('EDITOR 应该拥有 FILE_DELETE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.EDITOR];
        expect(permissions).toContain(ProjectPermission.FILE_DELETE);
      });
    });

    describe('FILE_TRASH_MANAGE - 回收站管理', () => {
      it('只有 OWNER 和 ADMIN 应该拥有 FILE_TRASH_MANAGE 权限', () => {
        const allRoles = [ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER, ProjectRole.EDITOR, ProjectRole.VIEWER];
        allRoles.forEach((role) => {
          const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[role];
          if (role === ProjectRole.OWNER || role === ProjectRole.ADMIN) {
            expect(permissions).toContain(ProjectPermission.FILE_TRASH_MANAGE);
          } else {
            expect(permissions).not.toContain(ProjectPermission.FILE_TRASH_MANAGE);
          }
        });
      });
    });

    describe('FILE_DOWNLOAD - 下载文件', () => {
      it('所有角色都应该拥有 FILE_DOWNLOAD 权限', () => {
        const allRoles = [ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER, ProjectRole.EDITOR, ProjectRole.VIEWER];
        allRoles.forEach((role) => {
          const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[role];
          expect(permissions).toContain(ProjectPermission.FILE_DOWNLOAD);
        });
      });
    });
  });

  describe('CAD 图纸权限详细测试', () => {
    describe('CAD_SAVE - 保存图纸', () => {
      it('VIEWER 不应该拥有 CAD_SAVE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.VIEWER];
        expect(permissions).not.toContain(ProjectPermission.CAD_SAVE);
      });

      it('MEMBER 应该拥有 CAD_SAVE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER];
        expect(permissions).toContain(ProjectPermission.CAD_SAVE);
      });

      it('EDITOR 应该拥有 CAD_SAVE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.EDITOR];
        expect(permissions).toContain(ProjectPermission.CAD_SAVE);
      });
    });

    describe('CAD_EXPORT - 导出图纸', () => {
      it('所有角色都应该拥有 CAD_EXPORT 权限', () => {
        const allRoles = [ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER, ProjectRole.EDITOR, ProjectRole.VIEWER];
        allRoles.forEach((role) => {
          const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[role];
          expect(permissions).toContain(ProjectPermission.CAD_EXPORT);
        });
      });
    });

    describe('CAD_EXTERNAL_REFERENCE - 外部参照管理', () => {
      it('VIEWER 不应该拥有 CAD_EXTERNAL_REFERENCE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.VIEWER];
        expect(permissions).not.toContain(ProjectPermission.CAD_EXTERNAL_REFERENCE);
      });

      it('MEMBER 不应该拥有 CAD_EXTERNAL_REFERENCE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER];
        expect(permissions).not.toContain(ProjectPermission.CAD_EXTERNAL_REFERENCE);
      });

      it('EDITOR 不应该拥有 CAD_EXTERNAL_REFERENCE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.EDITOR];
        expect(permissions).not.toContain(ProjectPermission.CAD_EXTERNAL_REFERENCE);
      });

      it('ADMIN 应该拥有 CAD_EXTERNAL_REFERENCE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.ADMIN];
        expect(permissions).toContain(ProjectPermission.CAD_EXTERNAL_REFERENCE);
      });

      it('OWNER 应该拥有 CAD_EXTERNAL_REFERENCE 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.OWNER];
        expect(permissions).toContain(ProjectPermission.CAD_EXTERNAL_REFERENCE);
      });
    });
  });

  describe('图库权限详细测试', () => {
    describe('GALLERY_ADD - 添加到图库', () => {
      it('VIEWER 不应该拥有 GALLERY_ADD 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.VIEWER];
        expect(permissions).not.toContain(ProjectPermission.GALLERY_ADD);
      });

      it('MEMBER 应该拥有 GALLERY_ADD 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER];
        expect(permissions).toContain(ProjectPermission.GALLERY_ADD);
      });

      it('EDITOR 不应该拥有 GALLERY_ADD 权限', () => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.EDITOR];
        expect(permissions).not.toContain(ProjectPermission.GALLERY_ADD);
      });
    });
  });

  describe('版本管理权限详细测试', () => {
    describe('VERSION_READ - 查看版本', () => {
      it('所有角色都应该拥有 VERSION_READ 权限', () => {
        const allRoles = [ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER, ProjectRole.EDITOR, ProjectRole.VIEWER];
        allRoles.forEach((role) => {
          const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[role];
          expect(permissions).toContain(ProjectPermission.VERSION_READ);
        });
      });
    });
  });

  describe('权限数量验证', () => {
    it('OWNER 应该拥有 21 个权限', () => {
      const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.OWNER];
      expect(permissions.length).toBe(21);
    });

    it('ADMIN 应该拥有 17 个权限', () => {
      const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.ADMIN];
      expect(permissions.length).toBe(17);
    });

    it('MEMBER 应该拥有 12 个权限', () => {
      const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER];
      expect(permissions.length).toBe(12);
    });

    it('EDITOR 应该拥有 10 个权限', () => {
      const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.EDITOR];
      expect(permissions.length).toBe(10);
    });

    it('VIEWER 应该拥有 4 个权限', () => {
      const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.VIEWER];
      expect(permissions.length).toBe(4);
    });
  });

  describe('权限层级关系验证', () => {
    it('ADMIN 权限应该是 MEMBER 权限的超集', () => {
      const adminPermissions = new Set(DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.ADMIN]);
      const memberPermissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER];

      // MEMBER 的所有权限都应该在 ADMIN 的权限中
      memberPermissions.forEach((permission) => {
        expect(adminPermissions.has(permission)).toBe(true);
      });
    });

    it('MEMBER 权限应该是 EDITOR 权限的超集（部分）', () => {
      const memberPermissions = new Set(DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER]);
      const editorPermissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.EDITOR];

      // EDITOR 的所有权限都应该在 MEMBER 的权限中
      editorPermissions.forEach((permission) => {
        expect(memberPermissions.has(permission)).toBe(true);
      });
    });

    it('EDITOR 权限应该是 VIEWER 权限的超集', () => {
      const editorPermissions = new Set(DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.EDITOR]);
      const viewerPermissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.VIEWER];

      // VIEWER 的所有权限都应该在 EDITOR 的权限中
      viewerPermissions.forEach((permission) => {
        expect(editorPermissions.has(permission)).toBe(true);
      });
    });
  });

  describe('权限重复检测', () => {
    it('所有角色的权限数组不应该有重复项', () => {
      const allRoles = [ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER, ProjectRole.EDITOR, ProjectRole.VIEWER];
      allRoles.forEach((role) => {
        const permissions = DEFAULT_PROJECT_ROLE_PERMISSIONS[role];
        const uniquePermissions = new Set(permissions);
        expect(permissions.length).toBe(uniquePermissions.size);
      });
    });
  });

  describe('系统角色权限测试', () => {
    describe('ADMIN 角色', () => {
      it('ADMIN 应该拥有所有系统权限', () => {
        const permissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.ADMIN];
        const allPermissions = Object.values(SystemPermission);
        expect(permissions.length).toBe(allPermissions.length);
      });

      it('ADMIN 应该可以访问审计日志', () => {
        const permissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.ADMIN];
        expect(permissions).toContain(SystemPermission.SYSTEM_ADMIN);
      });

      it('ADMIN 应该可以访问系统监控', () => {
        const permissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.ADMIN];
        expect(permissions).toContain(SystemPermission.SYSTEM_MONITOR);
      });
    });

    describe('USER_MANAGER 角色', () => {
      it('USER_MANAGER 应该拥有用户管理权限', () => {
        const permissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.USER_MANAGER];
        expect(permissions).toContain(SystemPermission.SYSTEM_USER_READ);
        expect(permissions).toContain(SystemPermission.SYSTEM_USER_CREATE);
        expect(permissions).toContain(SystemPermission.SYSTEM_USER_UPDATE);
        expect(permissions).toContain(SystemPermission.SYSTEM_USER_DELETE);
      });

      it('USER_MANAGER 应该拥有角色管理权限', () => {
        const permissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.USER_MANAGER];
        expect(permissions).toContain(SystemPermission.SYSTEM_ROLE_READ);
        expect(permissions).toContain(SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE);
      });

      it('USER_MANAGER 不应该拥有系统管理权限', () => {
        const permissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.USER_MANAGER];
        expect(permissions).not.toContain(SystemPermission.SYSTEM_ADMIN);
        expect(permissions).not.toContain(SystemPermission.SYSTEM_MONITOR);
      });

      it('USER_MANAGER 不应该拥有字体管理权限', () => {
        const permissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.USER_MANAGER];
        expect(permissions).not.toContain(SystemPermission.SYSTEM_FONT_READ);
        expect(permissions).not.toContain(SystemPermission.SYSTEM_FONT_UPLOAD);
      });
    });

    describe('FONT_MANAGER 角色', () => {
      it('FONT_MANAGER 应该拥有字体管理权限', () => {
        const permissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.FONT_MANAGER];
        expect(permissions).toContain(SystemPermission.SYSTEM_FONT_READ);
        expect(permissions).toContain(SystemPermission.SYSTEM_FONT_UPLOAD);
        expect(permissions).toContain(SystemPermission.SYSTEM_FONT_DELETE);
        expect(permissions).toContain(SystemPermission.SYSTEM_FONT_DOWNLOAD);
      });

      it('FONT_MANAGER 不应该拥有用户管理权限', () => {
        const permissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.FONT_MANAGER];
        expect(permissions).not.toContain(SystemPermission.SYSTEM_USER_READ);
        expect(permissions).not.toContain(SystemPermission.SYSTEM_USER_CREATE);
      });

      it('FONT_MANAGER 不应该拥有系统管理权限', () => {
        const permissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.FONT_MANAGER];
        expect(permissions).not.toContain(SystemPermission.SYSTEM_ADMIN);
        expect(permissions).not.toContain(SystemPermission.SYSTEM_MONITOR);
      });
    });

    describe('USER 角色', () => {
      it('USER 不应该拥有任何系统权限', () => {
        const permissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.USER];
        expect(permissions.length).toBe(0);
      });
    });

    describe('系统权限数量验证', () => {
      it('ADMIN 应该拥有 15 个系统权限', () => {
        const permissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.ADMIN];
        expect(permissions.length).toBe(15);
      });

      it('USER_MANAGER 应该拥有 9 个系统权限', () => {
        const permissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.USER_MANAGER];
        expect(permissions.length).toBe(9);
      });

      it('FONT_MANAGER 应该拥有 4 个系统权限', () => {
        const permissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.FONT_MANAGER];
        expect(permissions.length).toBe(4);
      });

      it('USER 应该拥有 0 个系统权限', () => {
        const permissions = SYSTEM_ROLE_PERMISSIONS[SystemRole.USER];
        expect(permissions.length).toBe(0);
      });
    });
  });
});
