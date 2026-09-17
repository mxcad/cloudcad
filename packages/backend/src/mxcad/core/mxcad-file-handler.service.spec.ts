import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { DatabaseService } from '../../database/database.service';
import { MxcadFileHandlerService } from './mxcad-file-handler.service';

// fs 按需 mock：existsSync 默认 false（文件不存在），createReadStream/statSync 仅占位，
// 避免测试真的读盘。路径遍历场景在 resolveWithinRoot 阶段即抛错，不会走到这些。
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => false),
  statSync: jest.fn(() => ({ size: 100 })),
  createReadStream: jest.fn(() => ({ pipe: jest.fn(), on: jest.fn() })),
}));

describe('MxcadFileHandlerService.serveFile — 路径遍历防护', () => {
  let service: MxcadFileHandlerService;

  const mockConfigService = {
    get: jest.fn((key: string) =>
      key === 'filesDataPath' ? '/fake/filesData' : undefined
    ),
  };
  const mockDb = {};

  const makeRes = () => {
    const res: any = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false,
    };
    return res;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigService.get.mockImplementation((key: string) =>
      key === 'filesDataPath' ? '/fake/filesData' : undefined
    );
    (fs.existsSync as jest.Mock).mockImplementation(() => false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MxcadFileHandlerService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get<MxcadFileHandlerService>(MxcadFileHandlerService);
  });

  it('filename 含 .. 逃逸出 filesDataPath：返回 400，不读取任意文件', async () => {
    const res = makeRes();
    // 202608/node-1 两段 + 5 个 .. → 跳出 /fake/filesData
    await service.serveFile('202608/node-1/../../../../../etc/passwd', res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalled();
    // 逃逸在 resolveWithinRoot 阶段即被拦截，不应触碰文件系统读取
    expect(fs.createReadStream).not.toHaveBeenCalled();
  });

  it('正常路径（文件不存在）：返回 404，不受遍历防护误伤', async () => {
    const res = makeRes();
    await service.serveFile('202608/node-1/abc.mxweb', res);
    // existsSync false → 外部参照回退也为空 → NotFoundException(404)
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalled();
  });
});
