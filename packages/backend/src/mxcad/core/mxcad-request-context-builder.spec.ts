import { Test, type TestingModule } from '@nestjs/testing';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { MxCadRequestContextBuilder } from './mxcad-request-context-builder';
import { MxCadRequestAuthService } from './mxcad-request-auth.service';

describe('MxCadRequestContextBuilder', () => {
  let builder: MxCadRequestContextBuilder;

  const mockRequestAuthService = {
    resolveUserOrGuest: jest.fn(),
  };

  const mockFileTreeService = {
    isLibraryNode: jest.fn().mockResolvedValue(false),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // clearAllMocks 会清空实现，重新挂默认值
    mockFileTreeService.isLibraryNode.mockResolvedValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MxCadRequestContextBuilder,
        { provide: MxCadRequestAuthService, useValue: mockRequestAuthService },
        { provide: FileTreeService, useValue: mockFileTreeService },
      ],
    }).compile();

    builder = module.get<MxCadRequestContextBuilder>(MxCadRequestContextBuilder);
  });

  describe('buildContextFromRequest', () => {
    it('should build context with valid JWT and nodeId from body', async () => {
      mockRequestAuthService.resolveUserOrGuest.mockResolvedValue({
        userId: 'user-1',
        userRole: 'USER',
      });

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
      mockRequestAuthService.resolveUserOrGuest.mockResolvedValue({
        userId: 'user-1',
        userRole: 'USER',
      });

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: {},
        query: { nodeId: 'node-2' },
      } as any;

      const context = await builder.buildContextFromRequest(request);

      expect(context.nodeId).toBe('node-2');
    });

    it('should default conflictStrategy to rename', async () => {
      mockRequestAuthService.resolveUserOrGuest.mockResolvedValue({
        userId: 'user-1',
        userRole: 'USER',
      });

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: { nodeId: 'node-1' },
        query: {},
      } as any;

      const context = await builder.buildContextFromRequest(request);

      expect(context.conflictStrategy).toBe('rename');
    });

    it('should set isLibrary=true for drawing library', async () => {
      mockRequestAuthService.resolveUserOrGuest.mockResolvedValue({
        userId: 'user-1',
        userRole: 'USER',
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
      mockRequestAuthService.resolveUserOrGuest.mockResolvedValue({
        userId: 'user-1',
        userRole: 'USER',
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
      mockRequestAuthService.resolveUserOrGuest.mockResolvedValue({
        userId: 'user-1',
        userRole: 'USER',
      });
      mockFileTreeService.isLibraryNode.mockResolvedValue(true);

      const request = {
        headers: { authorization: 'Bearer valid-token' },
        body: { nodeId: 'folder-1' },
        query: {},
      } as any;

      const context = await builder.buildContextFromRequest(request);

      expect(context.isLibrary).toBe(true);
      expect(mockFileTreeService.isLibraryNode).toHaveBeenCalledWith('folder-1');
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
      // 无凭据直接走匿名分支，不触碰鉴权服务
      expect(mockRequestAuthService.resolveUserOrGuest).not.toHaveBeenCalled();
    });

    it('should return anonymous context when JWT is invalid', async () => {
      mockRequestAuthService.resolveUserOrGuest.mockResolvedValue(null);

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
      mockRequestAuthService.resolveUserOrGuest.mockResolvedValue(null);

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
      mockRequestAuthService.resolveUserOrGuest.mockResolvedValue(null);

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
      mockRequestAuthService.resolveUserOrGuest.mockResolvedValue({
        userId: 'user-1',
        userRole: 'USER',
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
});
