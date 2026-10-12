import { MxcadFileAccessService } from './mxcad-file-access.service';
import {
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

// 服务直接写 Express Response 并做真实 fs 取流。单测只对用到的 fs 函数打 spy，
// 不整模块 mock——整模块 mock 会让 nestjs-i18n→chokidar（服务经 I18nContext 间接依赖）
// 在加载时拿不到真实 fs.watch/readdir 而崩溃。服务里 `import * as fs` 的属性是
// __importStar 的活 getter，指向 require('fs') 本体，故 spy 真实模块即生效。
const realFs = jest.requireActual<typeof import('fs')>('fs');
const realFsPromises = jest.requireActual<typeof import('fs/promises')>('fs/promises');

const fsCreateReadStream = () => realFs.createReadStream as unknown as jest.Mock;

function createService(mocks: {
  storageService?: any;
  permissionService?: any;
  fileSystemNodeService?: any;
  shareService?: any;
  conversionService?: any;
  externalRefFacade?: any;
  restrictionEngine?: any;
  requestAuthService?: any;
} = {}) {
  const configService = {
    get: jest.fn((key: string) =>
      key === 'filesDataPath' ? '/fake/filesData' : key === 'mxcad.fileExt' ? '.mxweb' : undefined,
    ),
  };
  return new MxcadFileAccessService(
    {} as any, // versionHistoryService
    configService as any,
    mocks.storageService || { fileExists: jest.fn().mockResolvedValue(false), getFileStream: jest.fn(), getFileInfo: jest.fn() },
    mocks.permissionService || { getNodeAccessRole: jest.fn().mockResolvedValue('VIEWER') },
    mocks.fileSystemNodeService || {
      findById: jest.fn().mockResolvedValue({ id: 'node-1' }),
      findFileByIdNotDeleted: jest.fn().mockResolvedValue(null),
      findByPath: jest.fn().mockResolvedValue(null),
    },
    mocks.shareService || { validateShareFileAccess: jest.fn().mockResolvedValue(undefined) },
    mocks.conversionService || { convertServerFile: jest.fn().mockResolvedValue({ code: 0 }) },
    mocks.externalRefFacade || {
      getExternalRefDownloadPath: jest.fn().mockResolvedValue(null),
    },
    // withConversionQuota 只跑回调（占位/释放是 RestrictionEngine 的职责，非本服务）
    mocks.restrictionEngine || { withConversionQuota: jest.fn((_ctx: any, fn: any) => fn()) },
    mocks.requestAuthService || {
      resolveUserId: jest.fn().mockResolvedValue('user-1'),
      canAccessNode: jest.fn().mockResolvedValue(true),
    },
  );
}

function makeRes(): any {
  return {
    headersSent: false,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  };
}

function makeStream(): any {
  return { on: jest.fn().mockReturnThis(), pipe: jest.fn() };
}

beforeEach(() => {
  jest.spyOn(realFs, 'createReadStream').mockReturnValue(makeStream());
  jest.spyOn(realFs, 'statSync').mockReturnValue({ size: 100 } as any);
  jest.spyOn(realFsPromises, 'access').mockResolvedValue(undefined);
  jest.spyOn(realFsPromises, 'unlink').mockResolvedValue(undefined);
});

describe('MxcadFileAccessService.serveExternalRefDownload', () => {
  it('token 校验失败时 401', async () => {
    const service = createService({
      externalRefFacade: { getExternalRefDownloadPath: jest.fn() },
      requestAuthService: {
        resolveUserId: jest.fn().mockRejectedValue(new Error('invalid token')),
        canAccessNode: jest.fn(),
      },
    });
    const res = makeRes();
    await service.serveExternalRefDownload('node-1', 'A1.dwg', { format: 'pdf' }, res, {} as any);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('节点存在但无访问权限时 401', async () => {
    const service = createService({
      fileSystemNodeService: { findFileByIdNotDeleted: jest.fn().mockResolvedValue({ id: 'node-1' }) },
      externalRefFacade: { getExternalRefDownloadPath: jest.fn() },
      requestAuthService: {
        resolveUserId: jest.fn().mockResolvedValue('user-1'),
        canAccessNode: jest.fn().mockResolvedValue(false),
      },
    });
    const res = makeRes();
    await service.serveExternalRefDownload('node-1', 'A1.dwg', { format: 'pdf' }, res, {} as any);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('外参路径解析不到时 404', async () => {
    const service = createService({
      externalRefFacade: { getExternalRefDownloadPath: jest.fn().mockResolvedValue(null) },
    });
    const res = makeRes();
    await service.serveExternalRefDownload('node-1', 'A1.dwg', { format: 'pdf' }, res, {} as any);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('mxweb 格式直取源文件，不触发转换', async () => {
    const convertServerFile = jest.fn();
    const service = createService({
      externalRefFacade: {
        getExternalRefDownloadPath: jest.fn().mockResolvedValue('/tmp/fake/A1.mxweb'),
      },
      conversionService: { convertServerFile },
    });
    const res = makeRes();
    await service.serveExternalRefDownload('node-1', 'A1.mxweb', { format: 'mxweb' }, res, {} as any);
    expect(fsCreateReadStream()).toHaveBeenCalledWith('/tmp/fake/A1.mxweb');
    expect(convertServerFile).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('图片格式即使 format=pdf 也直取源文件（isImageFile 分支）', async () => {
    const convertServerFile = jest.fn();
    const service = createService({
      externalRefFacade: {
        getExternalRefDownloadPath: jest.fn().mockResolvedValue('/tmp/fake/pic.png'),
      },
      conversionService: { convertServerFile },
    });
    const res = makeRes();
    await service.serveExternalRefDownload('node-1', 'pic.png', { format: 'pdf' }, res, {} as any);
    expect(convertServerFile).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('pdf 格式走转换并应用 FormatPolicy 默认值（2000/2000/mono + toPdf）', async () => {
    const convertServerFile = jest.fn().mockResolvedValue({ code: 0 });
    const service = createService({
      externalRefFacade: {
        getExternalRefDownloadPath: jest.fn().mockResolvedValue('/tmp/fake/A1.dwg'),
      },
      conversionService: { convertServerFile },
      restrictionEngine: { withConversionQuota: jest.fn((_ctx: any, fn: any) => fn()) },
    });
    const res = makeRes();
    await service.serveExternalRefDownload('node-1', 'A1.dwg', { format: 'pdf' }, res, {} as any);

    expect(convertServerFile).toHaveBeenCalledWith(
      expect.objectContaining({
        srcPath: '/tmp/fake/A1.dwg',
        nodeId: 'node-1',
        userId: 'user-1',
        outname: 'A1.pdf',
        cmd: 'toPdf',
        width: '2000',
        height: '2000',
        colorPolicy: 'mono',
      }),
    );
    expect(fsCreateReadStream()).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('转换失败（code≠0）时抛出 500', async () => {
    const convertServerFile = jest.fn().mockResolvedValue({ code: 1, message: 'engine error' });
    const service = createService({
      externalRefFacade: {
        getExternalRefDownloadPath: jest.fn().mockResolvedValue('/tmp/fake/A1.dwg'),
      },
      conversionService: { convertServerFile },
      restrictionEngine: { withConversionQuota: jest.fn((_ctx: any, fn: any) => fn()) },
    });
    const res = makeRes();
    await expect(
      service.serveExternalRefDownload('node-1', 'A1.dwg', { format: 'pdf' }, res, {} as any),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});

describe('MxcadFileAccessService.serveExternalRefView', () => {
  it('外参路径解析不到时 404', async () => {
    const service = createService({
      externalRefFacade: { getExternalRefDownloadPath: jest.fn().mockResolvedValue(null) },
    });
    const res = makeRes();
    await service.serveExternalRefView('node-1', 'A1.dwg', res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('外参查看成功时禁缓存（no-store）并取流', async () => {
    const service = createService({
      externalRefFacade: {
        getExternalRefDownloadPath: jest.fn().mockResolvedValue('/tmp/fake/A1.dwg.mxweb'),
      },
    });
    const res = makeRes();
    await service.serveExternalRefView('node-1', 'A1.dwg', res);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(fsCreateReadStream()).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('MxcadFileAccessService.authorizeFilesDataAccess', () => {
  it('query.shareToken 优先走分享鉴权', async () => {
    const validateShareFileAccess = jest.fn().mockResolvedValue(undefined);
    const service = createService({ shareService: { validateShareFileAccess } });
    const req: any = { query: { shareToken: 'tok-1' }, headers: {} };
    await service.authorizeFilesDataAccess('202610/node-1/a.mxweb', req);
    expect(validateShareFileAccess).toHaveBeenCalledWith('tok-1', '202610/node-1/a.mxweb');
  });

  it('无 query 时回退 x-share-token header', async () => {
    const validateShareFileAccess = jest.fn().mockResolvedValue(undefined);
    const service = createService({ shareService: { validateShareFileAccess } });
    const req: any = { query: {}, headers: { 'x-share-token': 'tok-2' } };
    await service.authorizeFilesDataAccess('202610/node-1/a.mxweb', req);
    expect(validateShareFileAccess).toHaveBeenCalledWith('tok-2', '202610/node-1/a.mxweb');
  });

  it('无 query/header 时从 referer 提取 shareToken（WASM 外部参照 fallback）', async () => {
    const validateShareFileAccess = jest.fn().mockResolvedValue(undefined);
    const service = createService({ shareService: { validateShareFileAccess } });
    const req: any = { query: {}, headers: { referer: 'http://host/share?shareToken=tok-3' } };
    await service.authorizeFilesDataAccess('202610/node-1/a.mxweb', req);
    expect(validateShareFileAccess).toHaveBeenCalledWith('tok-3', '202610/node-1/a.mxweb');
  });

  it('referer 非法 URL 时安全回退到登录态校验', async () => {
    const getNodeAccessRole = jest.fn().mockResolvedValue('VIEWER');
    const service = createService({ permissionService: { getNodeAccessRole } });
    const req: any = { query: {}, headers: { referer: 'not a url' }, user: { id: 'user-1' } };
    await service.authorizeFilesDataAccess('202610/node-1/a.mxweb', req);
    expect(getNodeAccessRole).toHaveBeenCalledWith('user-1', 'node-1');
  });

  it('无 shareToken 且未登录时抛 UnauthorizedException', async () => {
    const service = createService();
    const req: any = { query: {}, headers: {}, user: undefined };
    await expect(service.authorizeFilesDataAccess('202610/node-1/a.mxweb', req)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('无 shareToken 且节点不存在时抛 NotFoundException', async () => {
    const service = createService({
      fileSystemNodeService: { findById: jest.fn().mockResolvedValue(null) },
    });
    const req: any = { query: {}, headers: {}, user: { id: 'user-1' } };
    await expect(service.authorizeFilesDataAccess('202610/missing/a.mxweb', req)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('无 shareToken 且无访问角色时抛 UnauthorizedException', async () => {
    const service = createService({ permissionService: { getNodeAccessRole: jest.fn().mockResolvedValue(null) } });
    const req: any = { query: {}, headers: {}, user: { id: 'user-1' } };
    await expect(service.authorizeFilesDataAccess('202610/node-1/a.mxweb', req)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('MxcadFileAccessService.serveNodeFile（file/*path 外参取数 fail-closed）', () => {
  it('节点查不到/已删除时 404 且绝不取流——已删文件 IDOR 回归', async () => {
    const getFileStream = jest.fn();
    const canAccessNode = jest.fn().mockResolvedValue(true);
    const service = createService({
      storageService: { fileExists: jest.fn().mockResolvedValue(true), getFileStream, getFileInfo: jest.fn() },
      fileSystemNodeService: { findFileByIdNotDeleted: jest.fn().mockResolvedValue(null) },
      requestAuthService: { resolveUserId: jest.fn().mockResolvedValue('user-1'), canAccessNode },
    });
    const res = makeRes();
    await service.serveNodeFile('node-deleted/a.mxweb', res, { session: undefined } as any, false);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(getFileStream).not.toHaveBeenCalled();
    // 节点查不到时不应再做权限判定（直接 fail-closed）
    expect(canAccessNode).not.toHaveBeenCalled();
  });

  it('节点存在但无访问权限时 401 且绝不取流', async () => {
    const getFileStream = jest.fn();
    const service = createService({
      storageService: { fileExists: jest.fn().mockResolvedValue(true), getFileStream, getFileInfo: jest.fn() },
      fileSystemNodeService: { findFileByIdNotDeleted: jest.fn().mockResolvedValue({ id: 'node-1' }) },
      requestAuthService: {
        resolveUserId: jest.fn().mockResolvedValue('user-1'),
        canAccessNode: jest.fn().mockResolvedValue(false),
      },
    });
    const res = makeRes();
    await service.serveNodeFile('node-1/a.mxweb', res, { session: undefined } as any, false);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(getFileStream).not.toHaveBeenCalled();
  });
});

describe('MxcadFileAccessService.serveNonCadFile（files/:storageKey 取数 fail-closed）', () => {
  it('storageKey 含路径穿越时 400 且绝不取流', async () => {
    const getFileStream = jest.fn();
    const service = createService({
      storageService: { fileExists: jest.fn(), getFileStream, getFileInfo: jest.fn() },
    });
    const res = makeRes();
    await service.serveNonCadFile('../../etc/passwd', res, { user: { id: 'user-1' } } as any);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(getFileStream).not.toHaveBeenCalled();
  });

  it('原始 storageKey 无法解析到节点时 404 且绝不取流——根目录裸读 IDOR 回归', async () => {
    const getFileStream = jest.fn();
    const service = createService({
      storageService: { fileExists: jest.fn(), getFileStream, getFileInfo: jest.fn() },
      fileSystemNodeService: { findByPath: jest.fn().mockResolvedValue(null) },
    });
    const res = makeRes();
    await service.serveNonCadFile('files/space-1', res, { user: { id: 'user-1' } } as any);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(getFileStream).not.toHaveBeenCalled();
  });

  it('匿名（无 user）时 401 且绝不取流', async () => {
    const getFileStream = jest.fn();
    const service = createService({
      storageService: { fileExists: jest.fn(), getFileStream, getFileInfo: jest.fn() },
    });
    const res = makeRes();
    await service.serveNonCadFile('files/space-1', res, { user: undefined } as any);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(getFileStream).not.toHaveBeenCalled();
  });
});
