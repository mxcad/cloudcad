import { Test, TestingModule } from '@nestjs/testing';
import { MxCadPermissionService } from './mxcad-permission.service';
import { DatabaseService } from '../database/database.service';

describe('MxCadPermissionService', () => {
  let service: MxCadPermissionService;
  let mockPrisma: jest.Mocked<DatabaseService>;

  beforeEach(async () => {
    const mockDatabaseService = {
      projectMember: {
        findFirst: jest.fn(),
      },
      fileAccess: {
        findFirst: jest.fn(),
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
      const context = { userId: undefined, projectId: '123' };
      
      await expect(service.validateUploadPermission(context))
        .rejects.toThrow('用户未登录');
    });

    it('should throw BadRequestException when project is missing', async () => {
      const context = { userId: 'user1', projectId: undefined };
      
      await expect(service.validateUploadPermission(context))
        .rejects.toThrow('缺少项目信息');
    });

    it('should throw ForbiddenException when user is not project member', async () => {
      const context = { userId: 'user1', projectId: '123' };
      mockPrisma.projectMember.findFirst.mockResolvedValue(null);
      
      await expect(service.validateUploadPermission(context))
        .rejects.toThrow('无权限访问该项目');
    });

    it('should pass when user is project member', async () => {
      const context = { userId: 'user1', projectId: '123' };
      mockPrisma.projectMember.findFirst.mockResolvedValue({
        userId: 'user1',
        nodeId: '123',
        role: 'MEMBER',
      });
      
      await expect(service.validateUploadPermission(context))
        .resolves.toBe(true);
    });
  });

  describe('validateFileAccess', () => {
    it('should throw UnauthorizedException when user is not logged in', async () => {
      const context = { userId: undefined };
      
      await expect(service.validateFileAccess(context, 'file1'))
        .rejects.toThrow('用户未登录');
    });

    it('should throw BadRequestException when file does not exist', async () => {
      const context = { userId: 'user1' };
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);
      
      await expect(service.validateFileAccess(context, 'file1'))
        .rejects.toThrow('文件不存在');
    });

    it('should pass when user is file owner', async () => {
      const context = { userId: 'user1' };
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'file1',
        ownerId: 'user1',
      });
      
      await expect(service.validateFileAccess(context, 'file1'))
        .resolves.toBe(true);
    });
  });
});