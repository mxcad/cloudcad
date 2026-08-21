import { FolderExpanderService } from './folder-expander.service';
import { NodeType } from '@cloudcad/db';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

function createService(mocks: {
  prisma: any;
  permission?: any;
}) {
  const defaultPermission = { checkNodePermission: jest.fn().mockResolvedValue(true) };
  return new FolderExpanderService(
    mocks.prisma,
    mocks.permission || defaultPermission,
  );
}

describe('FolderExpanderService', () => {
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = {
      fileSystemNode: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };
  });

  describe('expandFolderItems', () => {
    it('should pass through file items unchanged', async () => {
      const service = createService({ prisma: mockPrisma });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        nodeType: NodeType.FILE,
        name: 'test.dwg',
      });

      const items = [{ nodeId: 'node-1', fileName: 'test.dwg', formats: ['pdf'] }];
      const dirSet = new Set<string>();
      const result = await service.expandFolderItems(items, dirSet);

      expect(result).toEqual(items);
      expect(dirSet.size).toBe(0);
    });

    it('should expand folder into children', async () => {
      const service = createService({ prisma: mockPrisma });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'folder-1',
        nodeType: NodeType.FOLDER,
        name: 'MyFolder',
      });
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([
        { id: 'child-1', name: 'a.dwg', originalName: null, nodeType: NodeType.FILE, parentId: 'folder-1' },
        { id: 'child-2', name: 'b.dwg', originalName: null, nodeType: NodeType.FILE, parentId: 'folder-1' },
      ]);

      const items = [{ nodeId: 'folder-1', fileName: 'MyFolder', formats: ['pdf', 'dwg'] }];
      const dirSet = new Set<string>();
      const result = await service.expandFolderItems(items, dirSet);

      expect(result).toHaveLength(2);
      expect(result[0].nodeId).toBe('child-1');
      expect(result[1].nodeId).toBe('child-2');
      expect(result[0].formats).toEqual(['pdf', 'dwg']);
      expect(dirSet.has('MyFolder')).toBe(true);
    });

    it('should handle nested folders recursively', async () => {
      const service = createService({ prisma: mockPrisma });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'root-folder', nodeType: NodeType.FOLDER, name: 'Root',
      });
      mockPrisma.fileSystemNode.findMany
        .mockResolvedValueOnce([
          { id: 'sub-1', name: 'SubFolder', originalName: null, nodeType: NodeType.FOLDER, parentId: 'root-folder' },
          { id: 'file-1', name: 'top.dwg', originalName: null, nodeType: NodeType.FILE, parentId: 'root-folder' },
        ])
        .mockResolvedValueOnce([
          { id: 'deep-file', name: 'deep.dwg', originalName: null, nodeType: NodeType.FILE, parentId: 'sub-1' },
        ]);

      const items = [{ nodeId: 'root-folder', fileName: 'Root', formats: ['pdf'] }];
      const dirSet = new Set<string>();
      const result = await service.expandFolderItems(items, dirSet);

      expect(result).toHaveLength(2);
      const fileNames = result.map(r => r.fileName).sort();
      expect(fileNames).toEqual(['deep.dwg', 'top.dwg']);
      expect(result.find(r => r.nodeId === 'deep-file')?.relativePath).toBe('Root/SubFolder');
      expect(result.find(r => r.nodeId === 'file-1')?.relativePath).toBe('Root');
    });

    it('should skip deleted nodes', async () => {
      const service = createService({ prisma: mockPrisma });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'folder-1', nodeType: NodeType.FOLDER, name: 'Folder',
      });
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([
        { id: 'file-1', name: 'keep.dwg', originalName: null, nodeType: NodeType.FILE, parentId: 'folder-1' },
      ]);

      const items = [{ nodeId: 'folder-1', fileName: 'Folder', formats: ['pdf'] }];
      const dirSet = new Set<string>();
      const result = await service.expandFolderItems(items, dirSet);

      expect(result).toHaveLength(1);
      expect(result[0].nodeId).toBe('file-1');
    });
  });

  describe('collectFolderChildren', () => {
    it('should collect files and subfolders recursively', async () => {
      const service = createService({ prisma: mockPrisma });
      mockPrisma.fileSystemNode.findMany
        .mockResolvedValueOnce([
          { id: 'sub', name: 'Sub', originalName: null, nodeType: NodeType.FOLDER, parentId: 'root' },
        ])
        .mockResolvedValueOnce([]);

      const dirSet = new Set<string>();
      const result = await service['collectFolderChildren']('root', 'Base', ['pdf'], dirSet);

      expect(dirSet.has('Base/Sub')).toBe(true);
    });
  });

  describe('getFolderFilesRecursive', () => {
    it('should return file node without children', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'file-1', name: 'test.dwg', originalName: null, nodeType: NodeType.FILE, projectId: null });
      const service = createService({ prisma: mockPrisma });

      const result = await service.getFolderFilesRecursive('file-1', 'user-1');
      expect(result).toEqual({ nodeId: 'file-1', fileName: 'test.dwg', isFolder: false });
    });

    it('should return folder node with children', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'folder-1', name: 'drawings', originalName: null, nodeType: NodeType.FOLDER, projectId: 'proj-1' });
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([
        { id: 'file-1', name: 'a.dwg', originalName: null, nodeType: NodeType.FILE },
      ]);
      const service = createService({ prisma: mockPrisma });

      const result = await service.getFolderFilesRecursive('folder-1', 'user-1');
      expect(result.isFolder).toBe(true);
      expect(result.children).toHaveLength(1);
      expect(result.children[0].fileName).toBe('a.dwg');
    });

    it('should throw NotFoundException for missing node', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);
      const service = createService({ prisma: mockPrisma });

      await expect(service.getFolderFilesRecursive('unknown', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when no permission', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'file-1', name: 'test.dwg', originalName: null, nodeType: NodeType.FILE, projectId: 'proj-1' });
      const noPermission = { checkNodePermission: jest.fn().mockResolvedValue(false) };
      const service = createService({ prisma: mockPrisma, permission: noPermission });

      await expect(service.getFolderFilesRecursive('file-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });
});
