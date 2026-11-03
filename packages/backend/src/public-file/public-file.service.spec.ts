import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PublicFileService } from './public-file.service';
import { QuotaExceededException } from '../vip/errors/quota-exceeded.error';

/**
 * PublicFileService 路径包含性（path containment）回归测试。
 *
 * 公开端点（@Public，无认证）的 hash/filename/srcHash 来自 URL 参数：
 * - findFileInDir：越界路径必须返回 null（否则 access 端点变任意文件读取，
 *   Windows 下反斜杠也是分隔符，Express 参数不含 `/` 挡不住 `..`/`..\`）
 * - checkExtReferenceExists：越界路径必须返回 false（否则 existsSync 成为
 *   任意文件存在性探测 oracle）
 * - uploadExtReference：srcFileHash 无格式校验，裸 startsWith 会被 uploads 的
 *   同名前缀兄弟目录（../uploads-evil）绕过并真建目录，必须带 path.sep 比较
 */
describe('PublicFileService 路径包含性', () => {
  let tmpBase: string;
  let uploadPath: string;
  let service: PublicFileService;

  const createService = (uploadPathOverride: string, overrides: {
    extRefStorageService?: { stageConvertedExtRefArtifact: jest.Mock; findExtRefCandidate: jest.Mock };
    fileConversionService?: { convertFile: jest.Mock; convertServerFile?: jest.Mock };
    restrictionEngine?: { withConversionQuota: jest.Mock };
  } = {}) => {
    const uploadService = {
      getUploadPath: () => uploadPathOverride,
      findFilesByPrefix: jest.fn().mockResolvedValue([]),
      readFile: jest.fn(),
      deleteFile: jest.fn(),
    };
    const databaseService = {
      fileSystemNode: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const storageManager = { getFullPath: jest.fn().mockReturnValue(null) };
    const restrictionEngine = overrides.restrictionEngine ?? {
      // 透传包装：占位/释放语义由 RestrictionEngine.withConversionQuota 单点保证（引擎级 spec 覆盖）
      withConversionQuota: jest.fn(
        async (_principal: unknown, fn: () => Promise<unknown>) => fn()
      ),
    };
    const fileConversionService = overrides.fileConversionService ?? {
      convertFile: jest.fn().mockResolvedValue({ isOk: true, ret: { message: 'ok' } }),
    };
    const extRefStorageService = overrides.extRefStorageService ?? {
      stageConvertedExtRefArtifact: jest.fn().mockResolvedValue(path.join(uploadPathOverride, 'default.mxweb')),
      findExtRefCandidate: jest.fn().mockResolvedValue(null),
    };
    return new PublicFileService(
      uploadService as never,
      databaseService as never,
      storageManager as never,
      restrictionEngine as never,
      fileConversionService as never,
      extRefStorageService as never
    );
  };

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'public-file-spec-'));
    uploadPath = path.join(tmpBase, 'uploads');
    fs.mkdirSync(uploadPath, { recursive: true });
    service = createService(uploadPath);
  });

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  describe('findFileInDir', () => {
    it('正常：返回 uploads/{hash}/ 下的文件', async () => {
      const hashDir = path.join(uploadPath, 'abc123');
      fs.mkdirSync(hashDir, { recursive: true });
      const target = path.join(hashDir, 'A1.dwg.mxweb');
      fs.writeFileSync(target, 'x');

      await expect(service.findFileInDir('abc123', 'A1.dwg.mxweb')).resolves.toBe(target);
    });

    it('越界：hash=.. 指向 uploads 父目录的文件时返回 null（不读取）', async () => {
      // uploads 父目录（tmpBase）下的敏感文件
      const secret = path.join(tmpBase, 'secret.txt');
      fs.writeFileSync(secret, 'top-secret');

      await expect(service.findFileInDir('..', 'secret.txt')).resolves.toBeNull();
    });

    it('越界：filename 带 .. 前缀时返回 null', async () => {
      const hashDir = path.join(uploadPath, 'abc123');
      fs.mkdirSync(hashDir, { recursive: true });
      const secret = path.join(tmpBase, 'secret.txt');
      fs.writeFileSync(secret, 'top-secret');

      // uploads/abc123/../secret.txt → tmpBase/secret.txt
      await expect(service.findFileInDir('abc123', '../secret.txt')).resolves.toBeNull();
    });
  });

  describe('checkExtReferenceExists', () => {
    it('正常：uploads/{srcHash}/ 下的文件返回 true', async () => {
      const hashDir = path.join(uploadPath, 'abc123');
      fs.mkdirSync(hashDir, { recursive: true });
      fs.writeFileSync(path.join(hashDir, 'ref.png'), 'x');

      await expect(
        service.checkExtReferenceExists('abc123', 'ref.png')
      ).resolves.toBe(true);
    });

    it('越界：srcHash=.. 探测 uploads 父目录文件时返回 false（非 oracle）', async () => {
      const secret = path.join(tmpBase, 'secret.txt');
      fs.writeFileSync(secret, 'top-secret');

      await expect(
        service.checkExtReferenceExists('..', 'secret.txt')
      ).resolves.toBe(false);
    });
  });

  describe('uploadExtReference', () => {
    it('正常：图片写入 uploads/{srcFileHash}/ 并返回 ok', async () => {
      const result = await service.uploadExtReference(
        Buffer.from('img'),
        'abc123',
        'ref.png'
      );
      expect(result.ret).toBe('ok');
      expect(
        fs.existsSync(path.join(uploadPath, 'abc123', 'ref.png'))
      ).toBe(true);
    });

    it('越界：srcFileHash 指向 uploads 的同名前缀兄弟目录（../uploads-evil）时拒绝', async () => {
      // 裸 startsWith 会放行：/…/uploads-evil 以 /…/uploads 开头
      // 带 path.sep 的比较必须拒绝，且不得创建该目录
      await expect(
        service.uploadExtReference(Buffer.from('img'), '../uploads-evil', 'ref.png')
      ).rejects.toThrow(BadRequestException);
      expect(fs.existsSync(path.join(tmpBase, 'uploads-evil'))).toBe(false);
    });

    it('越界：srcFileHash=.. 指向 uploads 父目录时拒绝', async () => {
      await expect(
        service.uploadExtReference(Buffer.from('img'), '..', 'ref.png')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('uploadExtReference DWG 回归（主 BUG：产物落位）', () => {
    it('转换成功后调用 stageConvertedExtRefArtifact 落位产物为 {名}.mxweb', async () => {
      const stage = jest
        .fn()
        .mockResolvedValue(
          path.join(uploadPath, 'abc123', 'block.dwg.mxweb')
        );
      const service = createService(uploadPath, {
        extRefStorageService: {
          stageConvertedExtRefArtifact: stage,
          findExtRefCandidate: jest.fn().mockResolvedValue(null),
        },
      });

      const result = await service.uploadExtReference(
        Buffer.from('dwg'),
        'abc123',
        'block.dwg',
        'hash123'
      );

      expect(result.ret).toBe('ok');
      // 引擎产物路径 = 临时文件完整名 + .mxweb = {extRefFileName}.mxweb
      // （公开上传临时文件 = srcDir/{extRefFileName}，引擎按临时文件名自定产物名）
      expect(stage).toHaveBeenCalledWith(
        expect.objectContaining({
          srcFilePath: path.join(uploadPath, 'abc123', 'block.dwg.mxweb'),
          targetDir: path.join(uploadPath, 'abc123'),
          logicalName: 'block.dwg',
        })
      );
    });

    it('产物落位失败（引擎产物缺失）返回 ret:failed，不透传引擎成功假象', async () => {
      const stage = jest
        .fn()
        .mockRejectedValue(
          new NotFoundException('转换后的文件不存在: missing.mxweb')
        );
      const service = createService(uploadPath, {
        extRefStorageService: {
          stageConvertedExtRefArtifact: stage,
          findExtRefCandidate: jest.fn().mockResolvedValue(null),
        },
      });

      const result = await service.uploadExtReference(
        Buffer.from('dwg'),
        'abc123',
        'block.dwg',
        'hash123'
      );

      expect(result.ret).toBe('failed');
      expect(result.message).toContain('转换后的文件不存在');
    });
  });

  describe('checkExtReferenceExists 候选集', () => {
    it('CAD 外部参照产物为 {名}.mxweb 时返回 true', async () => {
      const hashDir = path.join(uploadPath, 'abc123');
      fs.mkdirSync(hashDir, { recursive: true });
      fs.writeFileSync(path.join(hashDir, 'block.dwg.mxweb'), 'x');

      await expect(
        service.checkExtReferenceExists('abc123', 'block.dwg')
      ).resolves.toBe(true);
    });

    it('旧格式 basename.mxweb 候选也命中（对齐 findFileInDir 宽容度）', async () => {
      const hashDir = path.join(uploadPath, 'abc123');
      fs.mkdirSync(hashDir, { recursive: true });
      fs.writeFileSync(path.join(hashDir, 'block.mxweb'), 'x');

      await expect(
        service.checkExtReferenceExists('abc123', 'block.dwg')
      ).resolves.toBe(true);
    });

    it('所有候选缺失时返回 false', async () => {
      const hashDir = path.join(uploadPath, 'abc123');
      fs.mkdirSync(hashDir, { recursive: true });

      await expect(
        service.checkExtReferenceExists('abc123', 'block.dwg')
      ).resolves.toBe(false);
    });
  });

  describe('serveExternalRefDownload（游客态外部参照下载/转换）', () => {
    const makeHashDir = (hash: string) => {
      const hashDir = path.join(uploadPath, hash);
      fs.mkdirSync(hashDir, { recursive: true });
      return hashDir;
    };

    it('直接流：CAD 外部参照默认（无 format）命中 {名}.mxweb 候选，不触发转换', async () => {
      const hashDir = makeHashDir('abc123');
      fs.writeFileSync(path.join(hashDir, 'block.dwg.mxweb'), 'x');
      const convertServerFile = jest.fn();

      const service = createService(uploadPath, {
        fileConversionService: { convertFile: jest.fn(), convertServerFile },
      });

      const result = await service.serveExternalRefDownload(
        'abc123',
        'block.dwg',
        {},
        'ip',
      );

      expect(result.isConverted).toBe(false);
      // 显示名剥 .mxweb 容器（契约单一事实源）
      expect(result.filename).toBe('block.dwg');
      expect(result.filePath).toBe(
        path.join(uploadPath, 'abc123', 'block.dwg.mxweb'),
      );
      expect(convertServerFile).not.toHaveBeenCalled();
    });

    it('直接流：图片外部参照即使 format=pdf 也直取源文件（图片不转换）', async () => {
      const hashDir = makeHashDir('abc123');
      fs.writeFileSync(path.join(hashDir, 'ref.png'), 'x');
      const convertServerFile = jest.fn();

      const service = createService(uploadPath, {
        fileConversionService: { convertFile: jest.fn(), convertServerFile },
      });

      const result = await service.serveExternalRefDownload(
        'abc123',
        'ref.png',
        { format: 'pdf' },
        'ip',
      );

      expect(result.isConverted).toBe(false);
      expect(result.filename).toBe('ref.png');
      expect(convertServerFile).not.toHaveBeenCalled();
    });

    it('转换：format=pdf 走 convertServerFile + withConversionQuota，返回转换产物', async () => {
      const hashDir = makeHashDir('abc123');
      fs.writeFileSync(path.join(hashDir, 'block.dwg.mxweb'), 'x');
      const withConversionQuota = jest.fn(
        async (_principal: unknown, fn: () => Promise<unknown>) => fn(),
      );
      const convertServerFile = jest.fn().mockResolvedValue({ code: 0 });

      const service = createService(uploadPath, {
        restrictionEngine: { withConversionQuota },
        fileConversionService: { convertFile: jest.fn(), convertServerFile },
      });

      // 引擎把产物写到 srcPath 同目录（outname）：预置 outPath 存在以通过就位校验
      const outPath = path.join(hashDir, 'block.pdf');
      fs.writeFileSync(outPath, 'pdf');

      const result = await service.serveExternalRefDownload(
        'abc123',
        'block.dwg',
        { format: 'pdf' },
        'ip',
      );

      expect(result.isConverted).toBe(true);
      expect(result.filename).toBe('block.pdf');
      expect(result.filePath).toBe(outPath);
      expect(withConversionQuota).toHaveBeenCalledWith(
        { userId: undefined, ip: 'ip' },
        expect.any(Function),
      );
      expect(convertServerFile).toHaveBeenCalledWith(
        expect.objectContaining({
          srcPath: path.join(uploadPath, 'abc123', 'block.dwg.mxweb'),
          outname: 'block.pdf',
          cmd: 'toPdf',
          width: '2000',
          height: '2000',
          colorPolicy: 'mono',
          createPreloadingData: false,
        }),
      );
    });

    it('转换：引擎 code≠0 抛 InternalServerErrorException（占位作用域内）', async () => {
      const hashDir = makeHashDir('abc123');
      fs.writeFileSync(path.join(hashDir, 'block.dwg.mxweb'), 'x');
      const convertServerFile = jest
        .fn()
        .mockResolvedValue({ code: 12, message: 'engine boom' });

      const service = createService(uploadPath, {
        fileConversionService: { convertFile: jest.fn(), convertServerFile },
      });

      await expect(
        service.serveExternalRefDownload('abc123', 'block.dwg', { format: 'dwg' }, 'ip'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('404：候选全部缺失时抛 NotFoundException', async () => {
      makeHashDir('abc123');

      await expect(
        service.serveExternalRefDownload('abc123', 'missing.dwg', {}, 'ip'),
      ).rejects.toThrow(NotFoundException);
    });

    it('频率超限：withConversionQuota 抛 QuotaExceededException 原样上抛（403）', async () => {
      const hashDir = makeHashDir('abc123');
      fs.writeFileSync(path.join(hashDir, 'block.dwg.mxweb'), 'x');
      const quotaError = new QuotaExceededException('转换频率超限', {
        restrictionKey: 'conversion-guest',
      });
      const withConversionQuota = jest.fn().mockRejectedValue(quotaError);

      const service = createService(uploadPath, {
        restrictionEngine: { withConversionQuota },
        fileConversionService: {
          convertFile: jest.fn(),
          convertServerFile: jest.fn(),
        },
      });

      await expect(
        service.serveExternalRefDownload('abc123', 'block.dwg', { format: 'pdf' }, 'ip'),
      ).rejects.toBe(quotaError);
    });

    it('越界：srcHash=.. 指向 uploads 父目录文件时返回 404（不读取）', async () => {
      const secret = path.join(tmpBase, 'secret.txt');
      fs.writeFileSync(secret, 'top-secret');

      await expect(
        service.serveExternalRefDownload('..', 'secret.txt', {}, 'ip'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
