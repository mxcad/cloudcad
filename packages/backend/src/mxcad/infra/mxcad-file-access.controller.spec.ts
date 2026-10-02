import { MxcadFileAccessController } from './mxcad-file-access.controller';

function createController(mocks: {
  fileHandler?: any;
  permissionService?: any;
  fileSystemNodeService?: any;
  shareService?: any;
  storageService?: any;
  externalRefFacade?: any;
}) {
  const configService = {
    get: jest.fn((key: string) => (key === 'filesDataPath' ? '/fake/filesData' : undefined)),
  };
  return new MxcadFileAccessController(
    mocks.fileHandler || { serveFile: jest.fn() },
    {} as any, // versionHistoryService
    configService as any,
    mocks.storageService || { fileExists: jest.fn().mockResolvedValue(false), getFileStream: jest.fn(), getFileInfo: jest.fn() },
    mocks.permissionService || { getNodeAccessRole: jest.fn().mockResolvedValue('VIEWER') },
    mocks.fileSystemNodeService || {
      findById: jest.fn().mockResolvedValue({ id: 'node-1' }),
      findFileByIdNotDeleted: jest.fn().mockResolvedValue(null),
    },
    mocks.shareService || { validateShareFileAccess: jest.fn().mockResolvedValue(undefined) },
    {} as any, // conversionService
    mocks.externalRefFacade || {
      validateTokenAndGetUserId: jest.fn().mockResolvedValue('user-1'),
      checkFileAccessPermission: jest.fn().mockResolvedValue(true),
    },
    {} as any, // restrictionEngine
  );
}

function makeRes(): any {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  };
}

describe('MxcadFileAccessController filesData 鉴权（HEAD/GET 同一出口）', () => {
  describe('getFilesDataFileHead', () => {
    it('匿名 HEAD（无 shareToken）返回 401 且绝不 serveFile——文件存在性探测回归', async () => {
      const serveFile = jest.fn();
      const controller = createController({ fileHandler: { serveFile } });
      const res = makeRes();
      const req: any = { headers: {}, query: {}, user: undefined };

      await controller.getFilesDataFileHead(res, req, '202610/node-1/a.mxweb');

      expect(res.status).toHaveBeenCalledWith(401);
      expect(serveFile).not.toHaveBeenCalled();
    });

    it('匿名 HEAD 携带有效 shareToken 时走分享鉴权并 serveFile', async () => {
      const serveFile = jest.fn();
      const validateShareFileAccess = jest.fn().mockResolvedValue(undefined);
      const controller = createController({
        fileHandler: { serveFile },
        shareService: { validateShareFileAccess },
      });
      const res = makeRes();
      const req: any = { headers: {}, query: { shareToken: 'tok-1' }, user: undefined };

      await controller.getFilesDataFileHead(res, req, '202610/node-1/a.mxweb');

      expect(validateShareFileAccess).toHaveBeenCalledWith('tok-1', '202610/node-1/a.mxweb');
      expect(serveFile).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('已登录且有访问角色时 serveFile', async () => {
      const serveFile = jest.fn();
      const controller = createController({ fileHandler: { serveFile } });
      const res = makeRes();
      const req: any = { headers: {}, query: {}, user: { id: 'user-1' } };

      await controller.getFilesDataFileHead(res, req, '202610/node-1/a.mxweb');

      expect(serveFile).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('已登录但无访问角色时返回 401 且不 serveFile', async () => {
      const serveFile = jest.fn();
      const controller = createController({
        fileHandler: { serveFile },
        permissionService: { getNodeAccessRole: jest.fn().mockResolvedValue(null) },
      });
      const res = makeRes();
      const req: any = { headers: {}, query: {}, user: { id: 'user-1' } };

      await controller.getFilesDataFileHead(res, req, '202610/node-1/a.mxweb');

      expect(res.status).toHaveBeenCalledWith(401);
      expect(serveFile).not.toHaveBeenCalled();
    });

    it('节点不存在时返回 404 且不触碰文件系统', async () => {
      const serveFile = jest.fn();
      const controller = createController({
        fileHandler: { serveFile },
        fileSystemNodeService: { findById: jest.fn().mockResolvedValue(null) },
      });
      const res = makeRes();
      const req: any = { headers: {}, query: {}, user: { id: 'user-1' } };

      await controller.getFilesDataFileHead(res, req, '202610/missing/a.mxweb');

      expect(res.status).toHaveBeenCalledWith(404);
      expect(serveFile).not.toHaveBeenCalled();
    });
  });

  describe('getFilesDataFile（GET 与 HEAD 鉴权等价）', () => {
    it('匿名 GET（无 shareToken）返回 401 且绝不 serveFile', async () => {
      const serveFile = jest.fn();
      const controller = createController({ fileHandler: { serveFile } });
      const res = makeRes();
      const req: any = { headers: {}, query: {}, user: undefined };

      await controller.getFilesDataFile(res, req, '202610/node-1/a.mxweb');

      expect(res.status).toHaveBeenCalledWith(401);
      expect(serveFile).not.toHaveBeenCalled();
    });
  });

  describe('getFile（file/*path 外参取数，handleFileRequest 鉴权）', () => {
    it('节点查不到/已删除时 404 且不触碰存储——已删文件 IDOR 回归', async () => {
      const fileExists = jest.fn().mockResolvedValue(true); // 磁盘上文件仍在
      const getFileStream = jest.fn();
      const findFileByIdNotDeleted = jest.fn().mockResolvedValue(null); // 节点已删
      const controller = createController({
        storageService: { fileExists, getFileStream, getFileInfo: jest.fn() },
        fileSystemNodeService: { findFileByIdNotDeleted },
        externalRefFacade: {
          validateTokenAndGetUserId: jest.fn().mockResolvedValue('user-1'),
          checkFileAccessPermission: jest.fn().mockResolvedValue(true),
        },
      });
      const res = makeRes();
      const req: any = { headers: {}, query: {}, session: undefined };

      await controller.getFile(res, req, 'node-deleted/a.mxweb');

      expect(res.status).toHaveBeenCalledWith(404);
      expect(getFileStream).not.toHaveBeenCalled();
      // 节点查不到时不应再做权限判定（直接 fail-closed）
      expect(
        (controller as any).externalRefFacade.checkFileAccessPermission
      ).not.toHaveBeenCalled();
    });

    it('节点存在但无访问权限时 401', async () => {
      const getFileStream = jest.fn();
      const controller = createController({
        storageService: {
          fileExists: jest.fn().mockResolvedValue(true),
          getFileStream,
          getFileInfo: jest.fn(),
        },
        fileSystemNodeService: {
          findFileByIdNotDeleted: jest.fn().mockResolvedValue({ id: 'node-1' }),
        },
        externalRefFacade: {
          validateTokenAndGetUserId: jest.fn().mockResolvedValue('user-1'),
          checkFileAccessPermission: jest.fn().mockResolvedValue(false),
        },
      });
      const res = makeRes();
      const req: any = { headers: {}, query: {}, session: undefined };

      await controller.getFile(res, req, 'node-1/a.mxweb');

      expect(res.status).toHaveBeenCalledWith(401);
      expect(getFileStream).not.toHaveBeenCalled();
    });

    it('节点存在且有权限且存储命中时正常取流', async () => {
      const stream: any = { on: jest.fn().mockReturnThis(), pipe: jest.fn() };
      const getFileStream = jest.fn().mockResolvedValue(stream);
      const controller = createController({
        storageService: {
          fileExists: jest.fn().mockResolvedValue(true),
          getFileStream,
          getFileInfo: jest.fn().mockResolvedValue(null),
        },
        fileSystemNodeService: {
          findFileByIdNotDeleted: jest.fn().mockResolvedValue({ id: 'node-1' }),
        },
        externalRefFacade: {
          validateTokenAndGetUserId: jest.fn().mockResolvedValue('user-1'),
          checkFileAccessPermission: jest.fn().mockResolvedValue(true),
        },
      });
      const res = makeRes();
      const req: any = { headers: {}, query: {}, session: undefined };

      await controller.getFile(res, req, 'node-1/a.mxweb');

      expect(getFileStream).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
