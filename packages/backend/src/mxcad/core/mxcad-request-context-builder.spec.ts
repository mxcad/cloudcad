import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { MxCadRequestContextBuilder } from './mxcad-request-context-builder';

describe('MxCadRequestContextBuilder', () => {
  let builder: MxCadRequestContextBuilder;

  const mockJwtService = {
    verify: jest.fn(),
  };

  const mockNodeService = {
    findUserById: jest.fn(),
  };

  const mockFileTreeService = {
    getNodeType: jest.fn(),
    isLibraryNode: jest.fn().mockResolvedValue(false),
  };

  const mockPermissionService = {
    getNodeAccessRole: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // clearAllMocks 会清空实现，重新挂默认值
    mockFileTreeService.isLibraryNode.mockResolvedValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MxCadRequestContextBuilder,
        { provide: JwtService, useValue: mockJwtService },
        { provide: FileSystemNodeService, useValue: mockNodeService },
        { provide: FileTreeService, useValue: mockFileTreeService },
        {
          provide: FileSystemPermissionService,
          useValue: mockPermissionService,
        },
      ],
    }).compile();

    builder = module.get<MxCadRequestContextBuilder>(
      MxCadRequestContextBuilder
    );
  });

  describe('buildContextFromRequest', () => {
    it('should build context with valid JWT and nodeId from body', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockNodeService.findUserById.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        username: 'tester',
        nickname: 'Tester',
        roleId: 'USER',
        status: 'ACTIVE',
      });
      mockFileTreeService.getNodeType.mockResolvedValue(null);

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: { nodeId: 'node-1', conflictStrategy: 'overwrite' },
        query: {},
        ip: '203.0.113.9',
      } as any;

      const context = await builder.buildContextFromRequest(request);

      expect(context).toEqual({
        nodeId: 'node-1',
        userId: 'user-1',
        userRole: 'USER',
        conflictStrategy: 'overwrite',
        isLibrary: false,
        ip: '203.0.113.9',
      });
    });

    it('should build context with nodeId from query (GET requests)', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockNodeService.findUserById.mockResolvedValue({
        id: 'user-1',
        username: 'tester',
        roleId: 'USER',
        status: 'ACTIVE',
      });
      mockFileTreeService.getNodeType.mockResolvedValue(null);

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: {},
        query: { nodeId: 'node-2' },
      } as any;

      const context = await builder.buildContextFromRequest(request);

      expect(context.nodeId).toBe('node-2');
    });

    it('should default conflictStrategy to rename', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockNodeService.findUserById.mockResolvedValue({
        id: 'user-1',
        username: 'tester',
        roleId: 'USER',
        status: 'ACTIVE',
      });
      mockFileTreeService.getNodeType.mockResolvedValue(null);

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: { nodeId: 'node-1' },
        query: {},
      } as any;

      const context = await builder.buildContextFromRequest(request);

      expect(context.conflictStrategy).toBe('rename');
    });

    it('should set isLibrary=true for drawing library', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockNodeService.findUserById.mockResolvedValue({
        id: 'user-1',
        username: 'tester',
        roleId: 'USER',
        status: 'ACTIVE',
      });
      mockFileTreeService.isLibraryNode.mockResolvedValue(true);

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: { nodeId: 'node-1' },
        query: {},
      } as any;

      const context = await builder.buildContextFromRequest(request);

      expect(context.isLibrary).toBe(true);
    });

    it('should set isLibrary=true for block library', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockNodeService.findUserById.mockResolvedValue({
        id: 'user-1',
        username: 'tester',
        roleId: 'USER',
        status: 'ACTIVE',
      });
      mockFileTreeService.isLibraryNode.mockResolvedValue(true);

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: { nodeId: 'node-1' },
        query: {},
      } as any;

      const context = await builder.buildContextFromRequest(request);

      expect(context.isLibrary).toBe(true);
    });

    it('should set isLibrary=true for folder inside drawing library', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockNodeService.findUserById.mockResolvedValue({
        id: 'user-1',
        username: 'tester',
        roleId: 'USER',
        status: 'ACTIVE',
      });
      mockFileTreeService.isLibraryNode.mockResolvedValue(true);

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: { nodeId: 'folder-1' },
        query: {},
      } as any;

      const context = await builder.buildContextFromRequest(request);

      expect(context.isLibrary).toBe(true);
      expect(mockFileTreeService.isLibraryNode).toHaveBeenCalledWith(
        'folder-1'
      );
    });

    it('should return anonymous context when no authorization header', async () => {
      const request = {
        headers: {},
        body: {},
        query: {},
        ip: '198.51.100.7',
      } as any;

      const context = await builder.buildContextFromRequest(request);

      expect(context.userId).toBeUndefined();
      expect(context.userRole).toBeUndefined();
      expect(context.nodeId).toBeUndefined();
      expect(context.ip).toBe('198.51.100.7');
    });

    it('should return anonymous context when JWT is invalid', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const request = {
        headers: { authorization: 'Bearer bad-token' },
        body: {},
        query: {},
      } as any;

      const context = await builder.buildContextFromRequest(request);

      expect(context.userId).toBeUndefined();
      expect(context.userRole).toBeUndefined();
    });

    it('should return anonymous context when user not found', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockNodeService.findUserById.mockResolvedValue(null);

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: { nodeId: 'node-1' },
        query: {},
      } as any;

      const context = await builder.buildContextFromRequest(request);

      expect(context.userId).toBeUndefined();
      expect(context.userRole).toBeUndefined();
      expect(context.nodeId).toBe('node-1');
    });

    it('should return anonymous context when user is disabled', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockNodeService.findUserById.mockResolvedValue({
        id: 'user-1',
        username: 'tester',
        roleId: 'USER',
        status: 'DISABLED',
      });

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: { nodeId: 'node-1' },
        query: {},
      } as any;

      const context = await builder.buildContextFromRequest(request);

      expect(context.userId).toBeUndefined();
      expect(context.userRole).toBeUndefined();
      expect(context.nodeId).toBe('node-1');
    });

    it('should return context with undefined nodeId when nodeId is missing for authenticated user', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockNodeService.findUserById.mockResolvedValue({
        id: 'user-1',
        username: 'tester',
        roleId: 'USER',
        status: 'ACTIVE',
      });

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: {},
        query: {},
      } as any;

      const context = await builder.buildContextFromRequest(request);
      expect(context.userId).toBe('user-1');
      expect(context.nodeId).toBeUndefined();
    });
  });

  describe('validateTokenAndGetUserId', () => {
    it('should return userId for valid token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockNodeService.findUserById.mockResolvedValue({
        id: 'user-1',
        status: 'ACTIVE',
      });

      const request = {
        headers: { authorization: 'Bearer valid-token' },
      } as any;

      const userId = await builder.validateTokenAndGetUserId(request);

      expect(userId).toBe('user-1');
    });

    it('should throw UnauthorizedException when no header', async () => {
      const request = { headers: {} } as any;

      await expect(builder.validateTokenAndGetUserId(request)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw UnauthorizedException when user disabled', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockNodeService.findUserById.mockResolvedValue({
        id: 'user-1',
        status: 'DISABLED',
      });

      const request = {
        headers: { authorization: 'Bearer valid-token' },
      } as any;

      await expect(builder.validateTokenAndGetUserId(request)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('checkFileAccessPermission', () => {
    it('should return true when user has access role', async () => {
      mockPermissionService.getNodeAccessRole.mockResolvedValue('EDITOR');

      const result = await builder.checkFileAccessPermission(
        'node-1',
        'user-1',
        'user-1'
      );

      expect(result).toBe(true);
      expect(mockPermissionService.getNodeAccessRole).toHaveBeenCalledWith(
        'user-1',
        'node-1'
      );
    });

    it('should return false when user has no access role', async () => {
      mockPermissionService.getNodeAccessRole.mockResolvedValue(null);

      const result = await builder.checkFileAccessPermission(
        'node-1',
        'user-1',
        'user-1'
      );

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockPermissionService.getNodeAccessRole.mockRejectedValue(
        new Error('db error')
      );

      const result = await builder.checkFileAccessPermission(
        'node-1',
        'user-1',
        'user-1'
      );

      expect(result).toBe(false);
    });
  });
});
