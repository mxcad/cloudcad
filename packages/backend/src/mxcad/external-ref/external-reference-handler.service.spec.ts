jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, existsSync: jest.fn() };
});

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

import * as path from 'path';
import { NodeType } from '@cloudcad/db';
import { ExternalReferenceHandler } from './external-reference-handler.service';

/**
 * 外部参照根目录收口回归：根目录与 preloading 文件名都锚定磁盘实际主文件，
 * 且根目录只能来自 ExtRefPreloadingService.resolveStorageRoot（剥 /mxcad/file/
 * 前缀、游客 mxcadUploadPath 回落、validatePath fail-closed）。
 * 此前本服务自建 path.resolve(filesDataPath, node.path, '..')，三项全缺。
 */
describe('ExternalReferenceHandler — 根目录收口 resolveStorageRoot', () => {
  let handler: ExternalReferenceHandler;
  let extRefPreloadingService: Record<string, jest.Mock>;
  let fsMock: any;
  let fsPromisesMock: any;
  let fakeRes: { headersSent: boolean; status: jest.Mock; json: jest.Mock };

  const node = {
    id: 'node-1',
    path: '202607/node-1/drawing.dwg.mxweb',
    fileHash: 'hash-1',
    nodeType: NodeType.FILE,
  };
  const resolvedRoot = '/data/202607/node-1';

  beforeEach(() => {
    fsMock = jest.requireMock('fs');
    fsPromisesMock = jest.requireMock('fs/promises');
    extRefPreloadingService = {
      resolveStorageRoot: jest.fn().mockResolvedValue(resolvedRoot),
      getPreloadingFileName: jest
        .fn()
        .mockReturnValue('drawing.dwg.mxweb_preloading.json'),
    };
    handler = new ExternalReferenceHandler(
      {} as never,
      {} as never,
      extRefPreloadingService as never
    );
    jest.spyOn(handler as any, 'getNodeInfo').mockResolvedValue(node);
    jest.spyOn(handler as any, 'streamFile').mockResolvedValue(undefined);
    fsPromisesMock.readFile.mockResolvedValue(
      JSON.stringify({ src_file_md5: 'md5-of-src' })
    );
    fsMock.existsSync.mockReturnValue(true);
    // resetMocks 会清掉 mockReturnThis，须每次重建链式返回
    fakeRes = {
      headersSent: false,
      status: jest.fn().mockImplementation(() => fakeRes),
      json: jest.fn(),
    };
  });

  it('根目录来自 resolveStorageRoot，并传回已查得的 node 以免二次 findById', async () => {
    await handler.handleExternalReferenceRequest('node-1', 'ref.dwg', fakeRes as any);

    expect(extRefPreloadingService.resolveStorageRoot).toHaveBeenCalledWith(
      'node-1',
      node
    );
    // preloading.json 的路径必须由 resolver 的结果拼出，而非自建 filesDataPath
    expect(fsPromisesMock.readFile).toHaveBeenCalledWith(
      path.join(resolvedRoot, 'drawing.dwg.mxweb_preloading.json'),
      'utf-8'
    );
  });

  it('标准结构命中：交付路径落在 resolver 返回的根目录下', async () => {
    await handler.handleExternalReferenceRequest('node-1', 'ref.dwg', fakeRes as any);

    expect((handler as any).streamFile).toHaveBeenCalledWith(
      path.join(resolvedRoot, 'md5-of-src', 'ref.dwg'),
      'ref.dwg',
      expect.anything()
    );
  });

  it('标准结构缺失回落扁平结构：两条候选路径共用同一条根目录', async () => {
    fsMock.existsSync
      .mockReturnValueOnce(false) // 标准结构 {root}/{src_file_md5}/fileName
      .mockReturnValue(true); // 扁平结构 {root}/fileName

    await handler.handleExternalReferenceRequest('node-1', 'ref.dwg', fakeRes as any);

    expect((handler as any).streamFile).toHaveBeenCalledWith(
      path.join(resolvedRoot, 'ref.dwg'),
      'ref.dwg',
      expect.anything()
    );
  });

  it('preloading.json 读取失败：目录名降级 nodeId，路径仍从 resolver 结果拼出', async () => {
    fsPromisesMock.readFile.mockRejectedValue(new Error('ENOENT'));

    await handler.handleExternalReferenceRequest('node-1', 'ref.dwg', fakeRes as any);

    expect((handler as any).streamFile).toHaveBeenCalledWith(
      path.join(resolvedRoot, 'node-1', 'ref.dwg'),
      'ref.dwg',
      expect.anything()
    );
  });
});
