import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { PublicFileService } from './public-file.service';

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

  const createService = (uploadPathOverride: string) => {
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
    const restrictionEngine = {
      reserveConversionCountOrThrow: jest.fn(),
      reserveGuestConversionCountOrThrow: jest.fn(),
      releaseConversionCount: jest.fn().mockResolvedValue(undefined),
      releaseGuestConversionCount: jest.fn().mockResolvedValue(undefined),
    };
    const fileConversionService = { convertFile: jest.fn() };
    return new PublicFileService(
      uploadService as never,
      databaseService as never,
      storageManager as never,
      restrictionEngine as never,
      fileConversionService as never
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
});
