import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { MxCadService } from './mxcad.service';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { MxCadRequestContextBuilder } from './mxcad-request-context-builder';

describe('MxCadRequestContextBuilder', () => {
  let builder: MxCadRequestContextBuilder;

  const mockJwtService = {
    verify: jest.fn(),
  };

  const mockMxCadService = {
    findUserById: jest.fn(),
  };

  const mockFileTreeService = {
    getLibraryKey: jest.fn(),
  };

  const mockPermissionService = {
    getNodeAccessRole: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MxCadRequestContextBuilder,
        { provide: JwtService, useValue: mockJwtService },
        { provide: MxCadService, useValue: mockMxCadService },
        { provide: FileTreeService, useValue: mockFileTreeService },
        { provide: FileSystemPermissionService, useValue: mockPermissionService },
      ],
    }).compile();

    builder = module.get<MxCadRequestContextBuilder>(MxCadRequestContextBuilder);
  });

  describe('buildContextFromRequest', () => {
    it('should build context with valid JWT and nodeId from body', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockMxCadService.findUserById.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        username: 'tester',
        nickname: 'Tester',
        roleId: 'USER',
        status: 'ACTIVE',
      });
      mockFileTreeService.getLibraryKey.mockResolvedValue(null);

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: { nodeId: 'node-1', conflictStrategy: 'overwrite' },
        query: {},
      } as Partial<Request>;

      const context = await builder.buildContextFromRequest(request);

      expect(context).toEqual({
        nodeId: 'node-1',
        userId: 'user-1',
        userRole: 'USER',
        conflictStrategy: 'overwrite',
        isLibrary: false,
      });
    });

    it('should build context with nodeId from query (GET requests)', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockMxCadService.findUserById.mockResolvedValue({
        id: 'user-1',
        username: 'tester',
        roleId: 'USER',
        status: 'ACTIVE',
      });
      mockFileTreeService.getLibraryKey.mockResolvedValue(null);

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: {},
        query: { nodeId: 'node-2' },
      } as Partial<Request>;

      const context = await builder.buildContextFromRequest(request);

      expect(context.nodeId).toBe('node-2');
    });

    it('should default conflictStrategy to rename', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockMxCadService.findUserById.mockResolvedValue({
        id: 'user-1',
        username: 'tester',
        roleId: 'USER',
        status: 'ACTIVE',
      });
      mockFileTreeService.getLibraryKey.mockResolvedValue(null);

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: { nodeId: 'node-1' },
        query: {},
      } as Partial<Request>;

      const context = await builder.buildContextFromRequest(request);

      expect(context.conflictStrategy).toBe('rename');
    });

    it('should set isLibrary=true for drawing library', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockMxCadService.findUserById.mockResolvedValue({
        id: 'user-1',
        username: 'tester',
        roleId: 'USER',
        status: 'ACTIVE',
      });
      mockFileTreeService.getLibraryKey.mockResolvedValue('drawing');

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: { nodeId: 'node-1' },
        query: {},
      } as Partial<Request>;

      const context = await builder.buildContextFromRequest(request);

      expect(context.isLibrary).toBe(true);
    });

    it('should set isLibrary=true for block library', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockMxCadService.findUserById.mockResolvedValue({
        id: 'user-1',
        username: 'tester',
        roleId: 'USER',
        status: 'ACTIVE',
      });
      mockFileTreeService.getLibraryKey.mockResolvedValue('block');

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: { nodeId: 'node-1' },
        query: {},
      } as Partial<Request>;

      const context = await builder.buildContextFromRequest(request);

      expect(context.isLibrary).toBe(true);
    });

    it('should throw UnauthorizedException when no authorization header', async () => {
      const request = {
        headers: {},
        body: {},
        query: {},
      } as Partial<Request>;

      await expect(builder.buildContextFromRequest(request)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when JWT is invalid', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const request = {
        headers: { authorization: 'Bearer bad-token' },
        body: {},
        query: {},
      } as Partial<Request>;

      await expect(builder.buildContextFromRequest(request)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockMxCadService.findUserById.mockResolvedValue(null);

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: { nodeId: 'node-1' },
        query: {},
      } as Partial<Request>;

      await expect(builder.buildContextFromRequest(request)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user is disabled', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockMxCadService.findUserById.mockResolvedValue({
        id: 'user-1',
        username: 'tester',
        roleId: 'USER',
        status: 'DISABLED',
      });

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: { nodeId: 'node-1' },
        query: {},
      } as Partial<Request>;

      await expect(builder.buildContextFromRequest(request)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw when nodeId is missing (wrapped as UnauthorizedException by catch block)', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockMxCadService.findUserById.mockResolvedValue({
        id: 'user-1',
        username: 'tester',
        roleId: 'USER',
        status: 'ACTIVE',
      });

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: {},
        query: {},
      } as Partial<Request>;

      await expect(builder.buildContextFromRequest(request)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('validateTokenAndGetUserId', () => {
    it('should return userId for valid token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockMxCadService.findUserById.mockResolvedValue({
        id: 'user-1',
        status: 'ACTIVE',
      });

      const request = {
        headers: { authorization: 'Bearer valid-token' },
      } as Partial<Request>;

      const userId = await builder.validateTokenAndGetUserId(request);

      expect(userId).toBe('user-1');
    });

    it('should throw UnauthorizedException when no header', async () => {
      const request = { headers: {} } as Partial<Request>;

      await expect(builder.validateTokenAndGetUserId(request)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user disabled', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockMxCadService.findUserById.mockResolvedValue({
        id: 'user-1',
        status: 'DISABLED',
      });

      const request = {
        headers: { authorization: 'Bearer valid-token' },
      } as Partial<Request>;

      await expect(builder.validateTokenAndGetUserId(request)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('checkFileAccessPermission', () => {
    it('should return true when user has access role', async () => {
      mockPermissionService.getNodeAccessRole.mockResolvedValue('EDITOR');

      const result = await builder.checkFileAccessPermission(
        'node-1',
        'user-1',
        'user-1',
      );

      expect(result).toBe(true);
      expect(mockPermissionService.getNodeAccessRole).toHaveBeenCalledWith(
        'user-1',
        'node-1',
      );
    });

    it('should return false when user has no access role', async () => {
      mockPermissionService.getNodeAccessRole.mockResolvedValue(null);

      const result = await builder.checkFileAccessPermission(
        'node-1',
        'user-1',
        'user-1',
      );

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockPermissionService.getNodeAccessRole.mockRejectedValue(
        new Error('db error'),
      );

      const result = await builder.checkFileAccessPermission(
        'node-1',
        'user-1',
        'user-1',
      );

      expect(result).toBe(false);
    });
  });
});
