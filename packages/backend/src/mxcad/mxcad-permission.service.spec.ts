import { Test, TestingModule } from '@nestjs/testing';
import { MxCadPermissionService } from './mxcad-permission.service';
import { DatabaseService } from '../database/database.service';

describe('MxCadPermissionService', () => {
  let service: MxCadPermissionService;
  let mockPrisma: jest.Mocked<DatabaseService>;

  beforeEach(async () => {
    const mockDatabaseService = {
      fileAccess: {
        findUnique: jest.fn(),
      },
      fileSystemNode: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MxCadPermissionService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<MxCadPermissionService>(MxCadPermissionService);
    mockPrisma = module.get(DatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUploadPermission', () => {
    it('should throw UnauthorizedException when user is not logged in', async () => {
      const context = { userId: undefined, nodeId: '123' };

      await expect(service.validateUploadPermission(context)).rejects.toThrow(
        '用户未认证，请先登录'
      );
    });

    it('should throw BadRequestException when node is missing', async () => {
      const context = { userId: 'user1', nodeId: undefined };

      await expect(service.validateUploadPermission(context)).rejects.toThrow(
        '缺少节点信息'
      );
    });

    it('should throw ForbiddenException when user has no node access', async () => {
      const context = { userId: 'user1', nodeId: '123' };
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: '123',
        ownerId: 'owner-id',
      });
      mockPrisma.fileAccess.findUnique.mockResolvedValue(null);

      await expect(service.validateUploadPermission(context)).rejects.toThrow(
        '您没有该节点的访问权限，无法上传文件'
      );
    });

    it('should pass when user is node owner', async () => {
      const context = { userId: 'user1', nodeId: '123' };
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: '123',
        ownerId: 'user1',
      });

      await expect(service.validateUploadPermission(context)).resolves.toBe(
        true
      );
    });

    it('should pass when user has node access', async () => {
      const context = { userId: 'user1', nodeId: '123' };
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: '123',
        ownerId: 'owner-id',
      });
      mockPrisma.fileAccess.findUnique.mockResolvedValue({
        userId: 'user1',
        nodeId: '123',
        role: 'EDITOR',
      });

      await expect(service.validateUploadPermission(context)).resolves.toBe(
        true
      );
    });
  });

  describe('validateFileAccess', () => {
    it('should allow anonymous access when no user info', async () => {
      const context = { userId: undefined };

      await expect(service.validateFileAccess(context, 'file1')).resolves.toBe(
        true
      );
    });

    it('should throw BadRequestException when file does not exist', async () => {
      const context = { userId: 'user1' };
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(
        service.validateFileAccess(context, 'file1')
      ).rejects.toThrow('文件不存在');
    });

    it('should pass when user is file owner', async () => {
      const context = { userId: 'user1' };
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'file1',
        ownerId: 'user1',
      });

      await expect(service.validateFileAccess(context, 'file1')).resolves.toBe(
        true
      );
    });
  });
});
