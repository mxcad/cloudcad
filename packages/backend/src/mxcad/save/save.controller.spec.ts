import { Test, type TestingModule } from '@nestjs/testing';
import { SaveController } from './save.controller';
import { MxCadService } from '../core/mxcad.service';
import { SaveAsService } from './save-as.service';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

describe('SaveController', () => {
  let controller: SaveController;

  const mockMxCadService = {
    saveMxwebFile: jest.fn(),
    findNodeByIdWithDeletedAt: jest.fn(),
    findNodeById: jest.fn(),
  };

  const mockSaveAsService = {
    saveMxwebAs: jest.fn(),
  };

  const mockFileTreeService = {
    getProjectId: jest.fn(),
  };

  const mockPermissionService = {
    checkNodePermission: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SaveController],
      providers: [
        { provide: MxCadService, useValue: mockMxCadService },
        { provide: SaveAsService, useValue: mockSaveAsService },
        { provide: FileTreeService, useValue: mockFileTreeService },
        { provide: FileSystemPermissionService, useValue: mockPermissionService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RequireProjectPermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SaveController>(SaveController);
  });

  describe('saveMxwebToNode', () => {
    it('should save mxweb file successfully', async () => {
      mockMxCadService.saveMxwebFile.mockResolvedValue({
        success: true,
        message: '保存成功',
        path: '/some/path',
      });

      const result = await controller.saveMxwebToNode(
        'node-1',
        { path: '/tmp/test.mxweb', originalname: 'test.mxweb' } as any,
        'commit msg',
        undefined,
        { user: { id: 'u1', username: 'tester' } } as any,
      );

      expect(result.nodeId).toBe('node-1');
      expect(result.path).toBe('/some/path');
    });

    it('should throw on save failure', async () => {
      mockMxCadService.saveMxwebFile.mockResolvedValue({
        success: false,
        message: '保存失败',
      });

      await expect(
        controller.saveMxwebToNode(
          'node-1',
          {} as any,
          '',
          undefined,
          { user: { id: 'u1' } } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('saveMxwebAs', () => {
    it('should save as and return result', async () => {
      mockMxCadService.findNodeByIdWithDeletedAt.mockResolvedValue({
        id: 'parent-1',
        isFolder: true,
        personalSpaceKey: null,
      });
      mockFileTreeService.getProjectId.mockResolvedValue('proj-1');
      mockMxCadService.findNodeById.mockResolvedValue({
        personalSpaceKey: null,
        ownerId: 'u1',
      });
      mockPermissionService.checkNodePermission.mockResolvedValue(true);
      mockSaveAsService.saveMxwebAs.mockResolvedValue({
        success: true,
        message: '保存成功',
        nodeId: 'new-node',
      });

      const result = await controller.saveMxwebAs(
        { path: '/tmp/f.mxweb', originalname: 'f.mxweb' } as any,
        {
          targetType: 'project',
          targetParentId: 'parent-1',
          projectId: 'proj-1',
          format: 'dwg',
        } as any,
        { user: { id: 'u1', username: 'tester' } } as any,
      );

      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('new-node');
    });

    it('should throw when user not logged in', async () => {
      await expect(
        controller.saveMxwebAs({} as any, {} as any, { user: null } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when target folder not found', async () => {
      mockMxCadService.findNodeByIdWithDeletedAt.mockResolvedValue(null);

      await expect(
        controller.saveMxwebAs(
          { path: '/tmp/f.mxweb', originalname: 'f.mxweb' } as any,
          { targetType: 'project', targetParentId: 'missing', projectId: 'p1' } as any,
          { user: { id: 'u1' } } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when target is not a folder', async () => {
      mockMxCadService.findNodeByIdWithDeletedAt.mockResolvedValue({
        id: 'file-1',
        isFolder: false,
      });

      await expect(
        controller.saveMxwebAs(
          { path: '/tmp/f.mxweb', originalname: 'f.mxweb' } as any,
          { targetType: 'project', targetParentId: 'file-1', projectId: 'p1' } as any,
          { user: { id: 'u1' } } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when project save lacks permission', async () => {
      mockMxCadService.findNodeByIdWithDeletedAt.mockResolvedValue({
        id: 'parent-1',
        isFolder: true,
      });
      mockPermissionService.checkNodePermission.mockResolvedValue(false);

      await expect(
        controller.saveMxwebAs(
          { path: '/tmp/f.mxweb', originalname: 'f.mxweb' } as any,
          { targetType: 'project', targetParentId: 'parent-1', projectId: 'p1' } as any,
          { user: { id: 'u1' } } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
