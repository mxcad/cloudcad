import { Test, type TestingModule } from '@nestjs/testing';
import { VersionControlController } from './version-control.controller';
import { VERSION_CONTROL_TOKEN } from './interfaces/version-control.interface';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';

describe('VersionControlController', () => {
  let controller: VersionControlController;

  const mockVersionControlService = {
    getFileHistory: jest.fn(),
    getFileContentAtRevision: jest.fn(),
    listDirectoryAtRevision: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VersionControlController],
      providers: [
        { provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControlService },
      ],
    })
      .overrideGuard(RequireProjectPermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VersionControlController>(VersionControlController);
  });

  describe('getFileHistory', () => {
    describe('when history has entries', () => {
      it('should return formatted history records', async () => {
        mockVersionControlService.getFileHistory.mockResolvedValue({
          success: true,
          message: '获取成功',
          totalCount: 1,
          entries: [
            {
              revision: 5,
              author: 'admin',
              date: new Date('2026-07-21T10:00:00.000Z'),
              message: 'Updated drawing',
              userName: 'Admin User',
              paths: [{ action: 'M', kind: 'file', path: '/path/to/file.dwg' }],
            },
          ],
        });

        const result = await controller.getFileHistory(
          'proj-1',
          'filesData/some-path/file.dwg',
          10
        );

        expect(result.success).toBe(true);
        expect(result.entries).toHaveLength(1);
        expect(result.entries[0].revision).toBe(5);
        expect(result.entries[0].userName).toBe('Admin User');
        expect(result.totalCount).toBe(1);
      });
    });

    describe('when history is empty', () => {
      it('should return empty array', async () => {
        mockVersionControlService.getFileHistory.mockResolvedValue({
          success: true,
          message: '获取成功',
          totalCount: 0,
          entries: [],
        });

        const result = await controller.getFileHistory(
          'proj-1',
          'filesData/new-path',
          undefined
        );

        expect(result.success).toBe(true);
        expect(result.entries).toEqual([]);
        expect(result.totalCount).toBe(0);
      });
    });
  });

  describe('getFileContentAtRevision', () => {
    describe('when file content exists', () => {
      it('should return file content via getFileContentAtRevision', async () => {
        mockVersionControlService.getFileContentAtRevision.mockResolvedValue({
          success: true,
          message: '获取成功',
          content: Buffer.from('file data'),
        });

        const result = await controller.getFileContentAtRevision(
          3,
          'proj-1',
          'filesData/some-path/file.dwg'
        );

        expect(result.success).toBe(true);
        expect(result.content).toBe('file data');
        expect(
          mockVersionControlService.getFileContentAtRevision
        ).toHaveBeenCalledWith('some-path/file.dwg', 3);
      });
    });

    describe('when file content is empty', () => {
      it('should mark as failed', async () => {
        mockVersionControlService.getFileContentAtRevision.mockResolvedValue({
          success: false,
          message: '获取失败: 文件内容为空',
        });

        const result = await controller.getFileContentAtRevision(
          999,
          'proj-1',
          'filesData/missing.dwg'
        );

        expect(result.success).toBe(false);
      });
    });

    describe('when getFileContentAtRevision throws', () => {
      it('should mark as failed', async () => {
        mockVersionControlService.getFileContentAtRevision.mockRejectedValue(
          new Error('svn down')
        );

        const result = await controller.getFileContentAtRevision(
          1,
          'proj-1',
          'filesData/missing.dwg'
        );

        expect(result.success).toBe(false);
        expect(result.message).toContain('获取失败');
      });
    });
  });

  describe('listDirectoryAtRevision', () => {
    describe('when directory has files', () => {
      it('should return file list', async () => {
        mockVersionControlService.listDirectoryAtRevision.mockResolvedValue({
          success: true,
          message: '获取成功',
          files: ['file1.dwg', 'file2.dxf'],
        });

        const result = await controller.listDirectoryAtRevision(
          1,
          'proj-1',
          'filesData/some-path'
        );

        expect(result.success).toBe(true);
        expect(result.files).toEqual(['file1.dwg', 'file2.dxf']);
      });
    });

    describe('when directory is empty', () => {
      it('should return empty list', async () => {
        mockVersionControlService.listDirectoryAtRevision.mockResolvedValue({
          success: true,
          message: '获取成功',
          files: [],
        });

        const result = await controller.listDirectoryAtRevision(
          1,
          'proj-1',
          'filesData/empty-dir'
        );

        expect(result.success).toBe(true);
        expect(result.files).toEqual([]);
      });
    });
  });
});
