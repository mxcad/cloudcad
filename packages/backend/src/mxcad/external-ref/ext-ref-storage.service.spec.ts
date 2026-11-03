import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NotFoundException } from '@nestjs/common';
import { ExtRefStorageService } from './ext-ref-storage.service';

/**
 * ExtRefStorageService 落位/候选单测。
 *
 * 覆盖两件事（单一事实源 @cloudcad/contracts/files/ext-ref-naming）：
 * - stageConvertedExtRefArtifact：引擎产物 `{hash}.{srcExt}.mxweb` → 外部参照
 *   标准磁盘名 `{逻辑名}.mxweb`（CAD）/ 原名（非 CAD），源产物保留作转换缓存；
 * - findExtRefCandidate：候选集顺序（标准名 → 逻辑名 → 旧格式 basename.mxweb）
 *   与「检查存在 vs 文件解析」收敛一致。
 */
describe('ExtRefStorageService', () => {
  let tmpBase: string;
  let service: ExtRefStorageService;

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-ref-storage-'));
    service = new ExtRefStorageService();
  });

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  const makeSrcDir = (hash: string): string => {
    const srcDir = path.join(tmpBase, 'uploads', hash);
    fs.mkdirSync(srcDir, { recursive: true });
    return srcDir;
  };

  describe('stageConvertedExtRefArtifact', () => {
    it('CAD 逻辑名落位为 {名}.mxweb，源产物保留作转换缓存', async () => {
      const srcDir = makeSrcDir('abc123');
      const artifact = path.join(srcDir, 'hash123.dwg.mxweb');
      fs.writeFileSync(artifact, 'x');

      const target = await service.stageConvertedExtRefArtifact({
        srcFilePath: artifact,
        targetDir: srcDir,
        logicalName: 'block.dwg',
      });

      expect(target).toBe(path.join(srcDir, 'block.dwg.mxweb'));
      expect(fs.existsSync(path.join(srcDir, 'block.dwg.mxweb'))).toBe(true);
      expect(fs.existsSync(artifact)).toBe(true);
    });

    it('非 CAD（图片）原名落位，不加 .mxweb', async () => {
      const srcDir = makeSrcDir('abc123');
      const image = path.join(srcDir, 'image.png');
      fs.writeFileSync(image, 'x');

      const target = await service.stageConvertedExtRefArtifact({
        srcFilePath: image,
        targetDir: srcDir,
        logicalName: 'image.png',
      });

      expect(target).toBe(path.join(srcDir, 'image.png'));
    });

    it('产物缺失抛 NotFoundException', async () => {
      const srcDir = makeSrcDir('abc123');

      await expect(
        service.stageConvertedExtRefArtifact({
          srcFilePath: path.join(srcDir, 'missing.dwg.mxweb'),
          targetDir: srcDir,
          logicalName: 'block.dwg',
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('产物已按目标磁盘名就位（源=目标）幂等跳过拷贝，不抛错', async () => {
      // 公开上传：引擎按临时文件完整名自定产物名 {逻辑名}.mxweb，
      // 恰为目标磁盘名 → srcFilePath === targetFile，必须幂等返回（自拷会抛错）。
      const srcDir = makeSrcDir('abc123');
      const inPlace = path.join(srcDir, 'block.dwg.mxweb');
      fs.writeFileSync(inPlace, 'x');

      const target = await service.stageConvertedExtRefArtifact({
        srcFilePath: inPlace,
        targetDir: srcDir,
        logicalName: 'block.dwg',
      });

      expect(target).toBe(inPlace);
      expect(fs.existsSync(inPlace)).toBe(true);
    });
  });

  describe('findExtRefCandidate', () => {
    it('按候选集顺序命中标准磁盘名 {名}.mxweb', async () => {
      const srcDir = makeSrcDir('abc123');
      fs.writeFileSync(path.join(srcDir, 'block.dwg.mxweb'), 'x');

      await expect(service.findExtRefCandidate(srcDir, 'block.dwg')).resolves.toBe(
        path.join(srcDir, 'block.dwg.mxweb')
      );
    });

    it('旧格式 basename.mxweb 兜底命中', async () => {
      const srcDir = makeSrcDir('abc123');
      fs.writeFileSync(path.join(srcDir, 'block.mxweb'), 'x');

      await expect(service.findExtRefCandidate(srcDir, 'block.dwg')).resolves.toBe(
        path.join(srcDir, 'block.mxweb')
      );
    });

    it('全部候选缺失返回 null', async () => {
      const srcDir = makeSrcDir('abc123');

      await expect(
        service.findExtRefCandidate(srcDir, 'block.dwg')
      ).resolves.toBeNull();
    });
  });
});
