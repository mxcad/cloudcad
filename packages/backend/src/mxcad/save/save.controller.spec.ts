import { Test, type TestingModule } from '@nestjs/testing';
import { SaveController } from './save.controller';
import { MXCAD_SAVE_SERVICE } from '../interfaces/mxcad-service-tokens';
import { SaveAsService } from './save-as.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { TreeWalker } from '../../file-system/file-tree/tree-walker.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { PermissionService } from '../../permission/services/permission.service';
import { IPERMISSION_SERVICE } from '../../permission/interfaces/permission-service.interface';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';
import { DatabaseService } from '../../database/database.service';
import { JwtStrategyExecutor } from '../../auth/jwt.strategy.executor';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { SaveMxwebAsDto } from '../dto/save-mxweb-as.dto';
import { SaveMxwebDto } from '../dto/save-mxweb.dto';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { AuditLogService } from '../../audit/audit-log.service';

describe('SaveController', () => {
  let controller: SaveController;

  const mockAuditLogService = {
    log: jest.fn(),
    logProjectNodeAction: jest.fn(),
  };

  const mockSaveService = {
    saveMxwebFile: jest.fn(),
  };

  const mockNodeService = {
    findByIdWithDeletedAt: jest.fn(),
    findUniqueById: jest.fn(),
  };

  const mockSaveAsService = {
    saveMxwebAs: jest.fn(),
  };

  const mockTreeWalker = {
    resolveProjectId: jest.fn(),
  };

  const mockPermissionService = {
    checkNodePermission: jest.fn(),
  };

  const mockSystemPermissionService = {
    checkSystemPermission: jest.fn(),
  };

  const mockRuntimeConfigService = {
    get: jest.fn(),
  };

  const mockDatabaseService = {
    $queryRaw: jest.fn(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SaveController],
      providers: [
        { provide: MXCAD_SAVE_SERVICE, useValue: mockSaveService },
        { provide: FileSystemNodeService, useValue: mockNodeService },
        { provide: SaveAsService, useValue: mockSaveAsService },
        { provide: TreeWalker, useValue: mockTreeWalker },
        { provide: FileSystemPermissionService, useValue: mockPermissionService },
        { provide: PermissionService, useValue: mockSystemPermissionService },
        { provide: IPERMISSION_SERVICE, useValue: mockSystemPermissionService },
        { provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    })
      .overrideGuard(JwtStrategyExecutor)
      .useValue({ canActivate: () => true })
      .overrideGuard(RequireProjectPermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SaveController>(SaveController);
  });

  describe('saveMxwebToNode', () => {
    it('should save mxweb file successfully', async () => {
      mockSaveService.saveMxwebFile.mockResolvedValue({
        success: true,
        message: '保存成功',
        path: '/some/path',
      });

      const result = await controller.saveMxwebToNode(
        'node-1',
        { fieldname: 'file', path: '/tmp/test.mxweb', originalname: 'test.mxweb' } as Express.Multer.File,
        { commitMessage: 'commit msg' } as SaveMxwebDto,
        { user: { id: 'u1', username: 'tester' } } as any,
      );

      expect(result.nodeId).toBe('node-1');
      expect(result.path).toBe('/some/path');
    });

    it('should throw on save failure', async () => {
      mockSaveService.saveMxwebFile.mockResolvedValue({
        success: false,
        message: '保存失败',
      });

      await expect(
        controller.saveMxwebToNode(
          'node-1',
          { fieldname: 'file', path: '/tmp/test.mxweb', originalname: 'test.mxweb' } as Express.Multer.File,
          {} as SaveMxwebDto,
          { user: { id: 'u1' } } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should audit FILE_UPDATE when saving into a project node', async () => {
      mockSaveService.saveMxwebFile.mockResolvedValue({
        success: true,
        message: '保存成功',
        path: '/some/path',
      });

      await controller.saveMxwebToNode(
        'node-1',
        { fieldname: 'file', path: '/tmp/test.mxweb', originalname: 'test.mxweb' } as Express.Multer.File,
        { commitMessage: 'commit msg' } as SaveMxwebDto,
        { user: { id: 'u1', username: 'tester' } } as any,
      );

      // 项目内判断收敛在 AuditLogService.logProjectNodeAction（audit-log.service.spec 覆盖）
      expect(mockAuditLogService.logProjectNodeAction).toHaveBeenCalledWith(
        'FILE_UPDATE',
        'node-1',
        'u1',
      );
    });
  });

  describe('saveMxwebAs', () => {
    it('should save as and return result', async () => {
      mockNodeService.findByIdWithDeletedAt.mockResolvedValue({
        id: 'parent-1',
        nodeType: 'FOLDER',
        ownerId: 'u1',
      });
      mockTreeWalker.resolveProjectId.mockResolvedValue('proj-1');
      mockNodeService.findUniqueById.mockResolvedValue({
        nodeType: 'PROJECT',
        ownerId: 'u1',
      });
      mockPermissionService.checkNodePermission.mockResolvedValue(true);
      mockSaveAsService.saveMxwebAs.mockResolvedValue({
        success: true,
        message: '保存成功',
        nodeId: 'new-node',
      });

      const result = await controller.saveMxwebAs(
        { fieldname: 'file', path: '/tmp/f.mxweb', originalname: 'f.mxweb' } as Express.Multer.File,
        {
          targetType: 'project',
          targetParentId: 'parent-1',
          projectId: 'proj-1',
          format: 'dwg',
        } as SaveMxwebAsDto,
        { user: { id: 'u1', username: 'tester' } } as any,
      );

      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('new-node');
    });

    it('should audit FILE_CREATE when saving-as into a project', async () => {
      mockNodeService.findByIdWithDeletedAt.mockResolvedValue({
        id: 'parent-1',
        nodeType: 'FOLDER',
        ownerId: 'u1',
      });
      mockTreeWalker.resolveProjectId.mockResolvedValue('proj-1');
      mockPermissionService.checkNodePermission.mockResolvedValue(true);
      mockSaveAsService.saveMxwebAs.mockResolvedValue({
        success: true,
        message: '保存成功',
        nodeId: 'new-node',
      });

      await controller.saveMxwebAs(
        { fieldname: 'file', path: '/tmp/f.mxweb', originalname: 'f.mxweb' } as Express.Multer.File,
        {
          targetType: 'project',
          targetParentId: 'parent-1',
          projectId: 'proj-1',
          format: 'dwg',
        } as SaveMxwebAsDto,
        { user: { id: 'u1', username: 'tester' } } as any,
      );

      expect(mockAuditLogService.logProjectNodeAction).toHaveBeenCalledWith(
        'FILE_CREATE',
        'new-node',
        'u1',
      );
    });

    it('should throw when user not logged in', async () => {
      await expect(
        controller.saveMxwebAs({ fieldname: 'file', path: '/tmp/f.mxweb', originalname: 'f.mxweb' } as Express.Multer.File, {} as SaveMxwebAsDto, { user: null } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when target folder not found', async () => {
      mockNodeService.findByIdWithDeletedAt.mockResolvedValue(null);

      await expect(
        controller.saveMxwebAs(
          { fieldname: 'file', path: '/tmp/f.mxweb', originalname: 'f.mxweb' } as Express.Multer.File,
          { targetType: 'project', targetParentId: 'missing', projectId: 'p1' } as SaveMxwebAsDto,
          { user: { id: 'u1' } } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when target is not a folder', async () => {
      mockNodeService.findByIdWithDeletedAt.mockResolvedValue({
        id: 'file-1',
        nodeType: 'FILE',
      });

      await expect(
        controller.saveMxwebAs(
          { fieldname: 'file', path: '/tmp/f.mxweb', originalname: 'f.mxweb' } as Express.Multer.File,
          { targetType: 'project', targetParentId: 'file-1', projectId: 'p1' } as SaveMxwebAsDto,
          { user: { id: 'u1' } } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when project save lacks permission', async () => {
      mockNodeService.findByIdWithDeletedAt.mockResolvedValue({
        id: 'parent-1',
        nodeType: 'FOLDER',
      });
      mockPermissionService.checkNodePermission.mockResolvedValue(false);

      await expect(
        controller.saveMxwebAs(
          { fieldname: 'file', path: '/tmp/f.mxweb', originalname: 'f.mxweb' } as Express.Multer.File,
          { targetType: 'project', targetParentId: 'parent-1', projectId: 'p1' } as SaveMxwebAsDto,
          { user: { id: 'u1' } } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
