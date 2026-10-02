import { MxcadFileAccessController } from './mxcad-file-access.controller';

function createController(mocks: {
  fileHandler?: any;
  permissionService?: any;
  fileSystemNodeService?: any;
  shareService?: any;
}) {
  const configService = {
    get: jest.fn((key: string) => (key === 'filesDataPath' ? '/fake/filesData' : undefined)),
  };
  return new MxcadFileAccessController(
    mocks.fileHandler || { serveFile: jest.fn() },
    {} as any, // versionHistoryService
    configService as any,
    {} as any, // storageService
    mocks.permissionService || { getNodeAccessRole: jest.fn().mockResolvedValue('VIEWER') },
    mocks.fileSystemNodeService || { findById: jest.fn().mockResolvedValue({ id: 'node-1' }) },
    mocks.shareService || { validateShareFileAccess: jest.fn().mockResolvedValue(undefined) },
    {} as any, // conversionService
    {} as any, // externalRefFacade
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
});
