import { Test, TestingModule } from '@nestjs/testing';
import { FileSystemController } from './file-system.controller';
import { FileSystemService } from './file-system.service';

describe('FileSystemController', () => {
  let controller: FileSystemController;
  let service: FileSystemService;

  const mockFileSystemService = {
    createProject: jest.fn(),
    getUserProjects: jest.fn(),
    getProject: jest.fn(),
    updateProject: jest.fn(),
    deleteProject: jest.fn(),
    createFolder: jest.fn(),
    getNodeTree: jest.fn(),
    getChildren: jest.fn(),
    updateNode: jest.fn(),
    deleteNode: jest.fn(),
    moveNode: jest.fn(),
  };

  const mockRequest = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FileSystemController],
      providers: [
        {
          provide: FileSystemService,
          useValue: mockFileSystemService,
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

    controller = module.get<FileSystemController>(FileSystemController);
    service = module.get<FileSystemService>(FileSystemService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createProject', () => {
    it('应该创建项目', async () => {
      const dto = { name: '测试项目', description: '描述' };
      const mockResult = { id: 'project-123', ...dto };

      mockFileSystemService.createProject.mockResolvedValue(mockResult);

      const result = await controller.createProject(mockRequest, dto);

      expect(result).toEqual(mockResult);
      expect(service.createProject).toHaveBeenCalledWith(
        mockRequest.user.id,
        dto
      );
    });
  });

  describe('getProjects', () => {
    it('应该返回用户项目列表', async () => {
      const mockProjects = [
        { id: 'project-1', name: '项目1' },
        { id: 'project-2', name: '项目2' },
      ];

      mockFileSystemService.getUserProjects.mockResolvedValue(mockProjects);

      const result = await controller.getProjects(mockRequest);

      expect(result).toEqual(mockProjects);
      expect(service.getUserProjects).toHaveBeenCalledWith(mockRequest.user.id);
    });

    it('应该返回空数组当用户无项目', async () => {
      mockFileSystemService.getUserProjects.mockResolvedValue([]);

      const result = await controller.getProjects(mockRequest);

      expect(result).toEqual([]);
    });
  });

  describe('getProject', () => {
    it('应该返回项目详情', async () => {
      const projectId = 'project-123';
      const mockProject = {
        id: projectId,
        name: '项目',
        members: [],
        children: [],
      };

      mockFileSystemService.getProject.mockResolvedValue(mockProject);

      const result = await controller.getProject(projectId);

      expect(result).toEqual(mockProject);
      expect(service.getProject).toHaveBeenCalledWith(projectId);
    });
  });

  describe('updateProject', () => {
    it('应该更新项目', async () => {
      const projectId = 'project-123';
      const dto = { name: '新名称' };
      const mockUpdated = { id: projectId, ...dto };

      mockFileSystemService.updateProject.mockResolvedValue(mockUpdated);

      const result = await controller.updateProject(projectId, dto);

      expect(result).toEqual(mockUpdated);
      expect(service.updateProject).toHaveBeenCalledWith(projectId, dto);
    });
  });

  describe('deleteProject', () => {
    it('应该删除项目', async () => {
      const projectId = 'project-123';
      const mockResult = { message: '项目删除成功' };

      mockFileSystemService.deleteProject.mockResolvedValue(mockResult);

      const result = await controller.deleteProject(projectId);

      expect(result).toEqual(mockResult);
      expect(service.deleteProject).toHaveBeenCalledWith(projectId);
    });
  });

  describe('createFolder', () => {
    it('应该在指定父节点下创建文件夹', async () => {
      const parentId = 'parent-123';
      const dto = { name: '新文件夹' };
      const mockFolder = { id: 'folder-123', ...dto, parentId };

      mockFileSystemService.createFolder.mockResolvedValue(mockFolder);

      const result = await controller.createFolder(mockRequest, parentId, dto);

      expect(result).toEqual(mockFolder);
      expect(service.createFolder).toHaveBeenCalledWith(
        mockRequest.user.id,
        parentId,
        dto
      );
    });
  });

  describe('getNode', () => {
    it('应该返回节点树结构', async () => {
      const nodeId = 'node-123';
      const mockNode = {
        id: nodeId,
        name: '节点',
        children: [
          { id: 'child-1', name: '子节点' },
          { id: 'child-2', name: '子节点' },
        ],
      };

      mockFileSystemService.getNodeTree.mockResolvedValue(mockNode);

      const result = await controller.getNode(nodeId);

      expect(result).toEqual(mockNode);
      expect(service.getNodeTree).toHaveBeenCalledWith(nodeId);
    });
  });

  describe('getChildren', () => {
    it('应该返回子节点列表', async () => {
      const nodeId = 'node-123';
      const mockChildren = [
        { id: 'child-1', name: '子节点', isFolder: true },
        { id: 'child-2', name: '子节点', isFolder: false },
      ];

      mockFileSystemService.getChildren.mockResolvedValue(mockChildren);

      const result = await controller.getChildren(nodeId, mockRequest);

      expect(result).toEqual(mockChildren);
      expect(service.getChildren).toHaveBeenCalledWith(
        nodeId,
        mockRequest.user.id
      );
    });

    it('应该返回空数组当节点无子节点', async () => {
      const nodeId = 'empty-node';

      mockFileSystemService.getChildren.mockResolvedValue([]);

      const result = await controller.getChildren(nodeId, mockRequest);

      expect(result).toEqual([]);
    });
  });

  describe('updateNode', () => {
    it('应该更新节点信息', async () => {
      const nodeId = 'node-123';
      const dto = { name: '新名称', description: '新描述' };
      const mockUpdated = { id: nodeId, ...dto };

      mockFileSystemService.updateNode.mockResolvedValue(mockUpdated);

      const result = await controller.updateNode(nodeId, dto);

      expect(result).toEqual(mockUpdated);
      expect(service.updateNode).toHaveBeenCalledWith(nodeId, dto);
    });

    it('应该更新节点名称', async () => {
      const nodeId = 'node-123';
      const dto = { name: '新名称' };
      const mockUpdated = { id: nodeId, name: dto.name };

      mockFileSystemService.updateNode.mockResolvedValue(mockUpdated);

      const result = await controller.updateNode(nodeId, dto);

      expect(result.name).toBe(dto.name);
    });
  });

  describe('deleteNode', () => {
    it('应该删除节点', async () => {
      const nodeId = 'node-123';
      const mockResult = { message: '节点删除成功' };

      mockFileSystemService.deleteNode.mockResolvedValue(mockResult);

      const result = await controller.deleteNode(nodeId);

      expect(result).toEqual(mockResult);
      expect(service.deleteNode).toHaveBeenCalledWith(nodeId);
    });
  });

  describe('moveNode', () => {
    it('应该移动节点到新父节点', async () => {
      const nodeId = 'node-123';
      const dto = { targetParentId: 'new-parent' };
      const mockMoved = {
        id: nodeId,
        parentId: dto.targetParentId,
      };

      mockFileSystemService.moveNode.mockResolvedValue(mockMoved);

      const result = await controller.moveNode(nodeId, dto);

      expect(result).toEqual(mockMoved);
      expect(service.moveNode).toHaveBeenCalledWith(nodeId, dto.targetParentId);
    });
  });

  describe('错误处理', () => {
    it('应该传递 service 抛出的异常', async () => {
      const projectId = 'nonexistent';
      const error = new Error('项目不存在');

      mockFileSystemService.getProject.mockRejectedValue(error);

      await expect(controller.getProject(projectId)).rejects.toThrow(error);
    });

    it('创建项目时应该传递验证错误', async () => {
      const dto = { name: '' };
      const error = new Error('名称不能为空');

      mockFileSystemService.createProject.mockRejectedValue(error);

      await expect(controller.createProject(mockRequest, dto)).rejects.toThrow(
        error
      );
    });

    it('删除节点时应该传递权限错误', async () => {
      const nodeId = 'restricted-node';
      const error = new Error('无权限删除');

      mockFileSystemService.deleteNode.mockRejectedValue(error);

      await expect(controller.deleteNode(nodeId)).rejects.toThrow(error);
    });
  });

  describe('多种场景测试', () => {
    it('应该处理多个用户同时创建项目', async () => {
      const user1Request = { user: { id: 'user-1' } };
      const user2Request = { user: { id: 'user-2' } };
      const dto = { name: '项目' };

      mockFileSystemService.createProject
        .mockResolvedValueOnce({ id: 'project-1', ownerId: 'user-1' })
        .mockResolvedValueOnce({ id: 'project-2', ownerId: 'user-2' });

      const result1 = await controller.createProject(user1Request, dto);
      const result2 = await controller.createProject(user2Request, dto);

      expect(result1.ownerId).toBe('user-1');
      expect(result2.ownerId).toBe('user-2');
      expect(service.createProject).toHaveBeenCalledTimes(2);
    });

    it('应该处理项目更新后立即查询', async () => {
      const projectId = 'project-123';
      const updateDto = { name: '更新后的名称' };
      const mockUpdated = { id: projectId, ...updateDto };

      mockFileSystemService.updateProject.mockResolvedValue(mockUpdated);
      mockFileSystemService.getProject.mockResolvedValue(mockUpdated);

      await controller.updateProject(projectId, updateDto);
      const result = await controller.getProject(projectId);

      expect(result.name).toBe(updateDto.name);
    });

    it('应该处理文件夹重命名', async () => {
      const folderId = 'folder-123';
      const dto = { name: '重命名的文件夹' };
      const mockResult = { id: folderId, ...dto, isFolder: true };

      mockFileSystemService.updateNode.mockResolvedValue(mockResult);

      const result = await controller.updateNode(folderId, dto);

      expect(result.name).toBe(dto.name);
      expect(result.isFolder).toBe(true);
    });
  });

  describe('边界情况', () => {
    it('应该处理空的项目名称更新', async () => {
      const projectId = 'project-123';
      const dto = { name: undefined };
      const mockResult = { id: projectId };

      mockFileSystemService.updateProject.mockResolvedValue(mockResult);

      const result = await controller.updateProject(projectId, dto);

      expect(result).toEqual(mockResult);
    });

    it('应该处理特殊字符的文件夹名称', async () => {
      const parentId = 'parent-123';
      const dto = { name: '文件夹@#$%^&*()' };
      const mockFolder = { id: 'folder-123', ...dto };

      mockFileSystemService.createFolder.mockResolvedValue(mockFolder);

      const result = await controller.createFolder(mockRequest, parentId, dto);

      expect(result.name).toBe(dto.name);
    });

    it('应该处理极长的项目描述', async () => {
      const dto = {
        name: '项目',
        description: 'A'.repeat(500),
      };
      const mockResult = { id: 'project-123', ...dto };

      mockFileSystemService.createProject.mockResolvedValue(mockResult);

      const result = await controller.createProject(mockRequest, dto);

      expect(result.description).toBe(dto.description);
    });
  });
});
