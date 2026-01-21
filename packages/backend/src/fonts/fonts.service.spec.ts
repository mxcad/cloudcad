import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FontsService } from './fonts.service';
import { FontUploadTarget } from './dto/font.dto';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('FontsService', () => {
  let service: FontsService;
  let configService: ConfigService;

  // 测试目录路径
  const testBackendDir = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'test-fonts-backend'
  );
  const testFrontendDir = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'test-fonts-frontend'
  );

  // 测试字体文件
  const testFontBuffer = Buffer.from('test font content');
  const testFontFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'test-font.ttf',
    encoding: '7bit',
    mimetype: 'font/ttf',
    size: testFontBuffer.length,
    buffer: testFontBuffer,
    stream: null as any,
    destination: '',
    filename: '',
    path: '',
  };

  beforeEach(async () => {
    // 创建测试目录
    await fs.mkdir(testBackendDir, { recursive: true });
    await fs.mkdir(testFrontendDir, { recursive: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FontsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'MXCAD_FONTS_PATH') return testBackendDir;
              if (key === 'FRONTEND_FONTS_PATH') return testFrontendDir;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FontsService>(FontsService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    // 清理测试目录
    try {
      await fs.rm(testBackendDir, { recursive: true, force: true });
      await fs.rm(testFrontendDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });

  describe('getFonts', () => {
    it('应该返回空列表当目录为空时', async () => {
      const result = await service.getFonts();

      expect(result.fonts).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('应该返回后端目录中的字体', async () => {
      // 创建测试字体文件
      await fs.writeFile(
        path.join(testBackendDir, 'test-font.ttf'),
        testFontBuffer
      );

      const result = await service.getFonts();

      expect(result.fonts).toHaveLength(1);
      expect(result.fonts[0].name).toBe('test-font.ttf');
      expect(result.fonts[0].existsInBackend).toBe(true);
      expect(result.fonts[0].existsInFrontend).toBe(false);
      expect(result.total).toBe(1);
    });

    it('应该返回前端目录中的字体', async () => {
      // 创建测试字体文件
      await fs.writeFile(
        path.join(testFrontendDir, 'test-font.woff'),
        testFontBuffer
      );

      const result = await service.getFonts();

      expect(result.fonts).toHaveLength(1);
      expect(result.fonts[0].name).toBe('test-font.woff');
      expect(result.fonts[0].existsInBackend).toBe(false);
      expect(result.fonts[0].existsInFrontend).toBe(true);
      expect(result.total).toBe(1);
    });

    it('应该合并两个目录中的字体', async () => {
      // 在两个目录创建相同的字体文件
      await fs.writeFile(
        path.join(testBackendDir, 'shared-font.ttf'),
        testFontBuffer
      );
      await fs.writeFile(
        path.join(testFrontendDir, 'shared-font.ttf'),
        testFontBuffer
      );

      // 在后端目录创建独有的字体
      await fs.writeFile(
        path.join(testBackendDir, 'backend-only.ttf'),
        testFontBuffer
      );

      // 在前端目录创建独有的字体
      await fs.writeFile(
        path.join(testFrontendDir, 'frontend-only.woff'),
        testFontBuffer
      );

      const result = await service.getFonts();

      expect(result.fonts).toHaveLength(3);
      expect(result.total).toBe(3);

      // 检查共享字体
      const sharedFont = result.fonts.find((f) => f.name === 'shared-font.ttf');
      expect(sharedFont).toBeDefined();
      expect(sharedFont.existsInBackend).toBe(true);
      expect(sharedFont.existsInFrontend).toBe(true);

      // 检查后端独有字体
      const backendFont = result.fonts.find(
        (f) => f.name === 'backend-only.ttf'
      );
      expect(backendFont).toBeDefined();
      expect(backendFont.existsInBackend).toBe(true);
      expect(backendFont.existsInFrontend).toBe(false);

      // 检查前端独有字体
      const frontendFont = result.fonts.find(
        (f) => f.name === 'frontend-only.woff'
      );
      expect(frontendFont).toBeDefined();
      expect(frontendFont.existsInBackend).toBe(false);
      expect(frontendFont.existsInFrontend).toBe(true);
    });

    it('应该忽略非字体文件', async () => {
      // 创建非字体文件
      await fs.writeFile(
        path.join(testBackendDir, 'readme.txt'),
        Buffer.from('text')
      );
      await fs.writeFile(
        path.join(testBackendDir, 'image.png'),
        Buffer.from('image')
      );

      const result = await service.getFonts();

      expect(result.fonts).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('应该按名称排序字体列表', async () => {
      await fs.writeFile(
        path.join(testBackendDir, 'z-font.ttf'),
        testFontBuffer
      );
      await fs.writeFile(
        path.join(testBackendDir, 'a-font.ttf'),
        testFontBuffer
      );
      await fs.writeFile(
        path.join(testBackendDir, 'm-font.ttf'),
        testFontBuffer
      );

      const result = await service.getFonts();

      expect(result.fonts[0].name).toBe('a-font.ttf');
      expect(result.fonts[1].name).toBe('m-font.ttf');
      expect(result.fonts[2].name).toBe('z-font.ttf');
    });
  });

  describe('uploadFont', () => {
    it('应该成功上传字体到后端目录', async () => {
      const result = await service.uploadFont(
        testFontFile,
        FontUploadTarget.BACKEND
      );

      expect(result.message).toContain('上传成功');
      expect(result.font.name).toBe('test-font.ttf');
      expect(result.font.existsInBackend).toBe(true);
      expect(result.font.existsInFrontend).toBe(false);

      // 验证文件已创建
      const backendPath = path.join(testBackendDir, 'test-font.ttf');
      await expect(fs.access(backendPath)).resolves.not.toThrow();
    });

    it('应该成功上传字体到前端目录', async () => {
      const result = await service.uploadFont(
        testFontFile,
        FontUploadTarget.FRONTEND
      );

      expect(result.message).toContain('上传成功');
      expect(result.font.name).toBe('test-font.ttf');
      expect(result.font.existsInBackend).toBe(false);
      expect(result.font.existsInFrontend).toBe(true);

      // 验证文件已创建
      const frontendPath = path.join(testFrontendDir, 'test-font.ttf');
      await expect(fs.access(frontendPath)).resolves.not.toThrow();
    });

    it('应该成功上传字体到两个目录', async () => {
      const result = await service.uploadFont(
        testFontFile,
        FontUploadTarget.BOTH
      );

      expect(result.message).toContain('上传成功');
      expect(result.font.name).toBe('test-font.ttf');
      expect(result.font.existsInBackend).toBe(true);
      expect(result.font.existsInFrontend).toBe(true);

      // 验证两个目录都已创建文件
      const backendPath = path.join(testBackendDir, 'test-font.ttf');
      const frontendPath = path.join(testFrontendDir, 'test-font.ttf');
      await expect(fs.access(backendPath)).resolves.not.toThrow();
      await expect(fs.access(frontendPath)).resolves.not.toThrow();
    });

    it('应该拒绝不支持的文件类型', async () => {
      const invalidFile: Express.Multer.File = {
        ...testFontFile,
        originalname: 'test.txt',
      };

      await expect(
        service.uploadFont(invalidFile, FontUploadTarget.BOTH)
      ).rejects.toThrow(BadRequestException);
    });

    it('应该拒绝过大的文件', async () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
      const largeFile: Express.Multer.File = {
        ...testFontFile,
        buffer: largeBuffer,
        size: largeBuffer.length,
      };

      await expect(
        service.uploadFont(largeFile, FontUploadTarget.BOTH)
      ).rejects.toThrow(BadRequestException);
    });

    it('应该拒绝无效的文件名', async () => {
      const invalidFile: Express.Multer.File = {
        ...testFontFile,
        originalname: '',
      };

      await expect(
        service.uploadFont(invalidFile, FontUploadTarget.BOTH)
      ).rejects.toThrow(BadRequestException);
    });

    it('应该支持所有允许的字体扩展名', async () => {
      const allowedExtensions = ['.ttf', '.otf', '.woff', '.woff2', '.eot'];

      for (const ext of allowedExtensions) {
        const fontFile: Express.Multer.File = {
          ...testFontFile,
          originalname: `test${ext}`,
        };

        const result = await service.uploadFont(
          fontFile,
          FontUploadTarget.BOTH
        );
        expect(result.font.extension).toBe(ext);
      }
    });
  });

  describe('deleteFont', () => {
    beforeEach(async () => {
      // 在两个目录创建测试字体
      await fs.writeFile(
        path.join(testBackendDir, 'delete-test.ttf'),
        testFontBuffer
      );
      await fs.writeFile(
        path.join(testFrontendDir, 'delete-test.ttf'),
        testFontBuffer
      );
      await fs.writeFile(
        path.join(testBackendDir, 'backend-only.ttf'),
        testFontBuffer
      );
      await fs.writeFile(
        path.join(testFrontendDir, 'frontend-only.woff'),
        testFontBuffer
      );
    });

    it('应该成功从后端目录删除字体', async () => {
      const result = await service.deleteFont(
        'delete-test.ttf',
        FontUploadTarget.BACKEND
      );

      expect(result.message).toContain('删除成功');

      // 验证后端文件已删除
      const backendPath = path.join(testBackendDir, 'delete-test.ttf');
      await expect(fs.access(backendPath)).rejects.toThrow();

      // 验证前端文件仍然存在
      const frontendPath = path.join(testFrontendDir, 'delete-test.ttf');
      await expect(fs.access(frontendPath)).resolves.not.toThrow();
    });

    it('应该成功从前端目录删除字体', async () => {
      const result = await service.deleteFont(
        'delete-test.ttf',
        FontUploadTarget.FRONTEND
      );

      expect(result.message).toContain('删除成功');

      // 验证前端文件已删除
      const frontendPath = path.join(testFrontendDir, 'delete-test.ttf');
      await expect(fs.access(frontendPath)).rejects.toThrow();

      // 验证后端文件仍然存在
      const backendPath = path.join(testBackendDir, 'delete-test.ttf');
      await expect(fs.access(backendPath)).resolves.not.toThrow();
    });

    it('应该成功从两个目录删除字体', async () => {
      const result = await service.deleteFont(
        'delete-test.ttf',
        FontUploadTarget.BOTH
      );

      expect(result.message).toContain('删除成功');

      // 验证两个目录的文件都已删除
      const backendPath = path.join(testBackendDir, 'delete-test.ttf');
      const frontendPath = path.join(testFrontendDir, 'delete-test.ttf');
      await expect(fs.access(backendPath)).rejects.toThrow();
      await expect(fs.access(frontendPath)).rejects.toThrow();
    });

    it('应该抛出异常当文件不存在时', async () => {
      await expect(
        service.deleteFont('non-existent.ttf', FontUploadTarget.BOTH)
      ).rejects.toThrow(NotFoundException);
    });

    it('应该拒绝无效的文件名', async () => {
      await expect(
        service.deleteFont('../etc/passwd', FontUploadTarget.BOTH)
      ).rejects.toThrow(BadRequestException);
    });

    it('应该拒绝包含路径分隔符的文件名', async () => {
      await expect(
        service.deleteFont('subdir/font.ttf', FontUploadTarget.BOTH)
      ).rejects.toThrow(BadRequestException);
    });

    it('应该处理仅存在于一个目录的字体', async () => {
      const result = await service.deleteFont(
        'backend-only.ttf',
        FontUploadTarget.BOTH
      );

      expect(result.message).toContain('删除成功');
    });
  });

  describe('downloadFont', () => {
    beforeEach(async () => {
      // 在两个目录创建测试字体
      await fs.writeFile(
        path.join(testBackendDir, 'download-test.ttf'),
        testFontBuffer
      );
      await fs.writeFile(
        path.join(testFrontendDir, 'download-test.woff'),
        testFontBuffer
      );
    });

    it('应该成功从后端目录下载字体', async () => {
      const result = await service.downloadFont('download-test.ttf', 'backend');

      expect(result.fileName).toBe('download-test.ttf');
      expect(result.path).toContain('test-fonts-backend');
      expect(result.path).toContain('download-test.ttf');

      // 验证文件存在
      await expect(fs.access(result.path)).resolves.not.toThrow();
    });

    it('应该成功从前端目录下载字体', async () => {
      const result = await service.downloadFont(
        'download-test.woff',
        'frontend'
      );

      expect(result.fileName).toBe('download-test.woff');
      expect(result.path).toContain('test-fonts-frontend');
      expect(result.path).toContain('download-test.woff');

      // 验证文件存在
      await expect(fs.access(result.path)).resolves.not.toThrow();
    });

    it('应该抛出异常当文件不存在时', async () => {
      await expect(
        service.downloadFont('non-existent.ttf', 'backend')
      ).rejects.toThrow(NotFoundException);
    });

    it('应该拒绝无效的文件名', async () => {
      await expect(
        service.downloadFont('../etc/passwd', 'backend')
      ).rejects.toThrow(BadRequestException);
    });

    it('应该拒绝包含路径分隔符的文件名', async () => {
      await expect(
        service.downloadFont('subdir/font.ttf', 'backend')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateFontFile', () => {
    it('应该拒绝空文件', async () => {
      const emptyFile: Express.Multer.File = null as any;

      await expect(
        service.uploadFont(emptyFile, FontUploadTarget.BOTH)
      ).rejects.toThrow(BadRequestException);
    });

    it('应该拒绝过长的文件名', async () => {
      const longName = 'a'.repeat(256) + '.ttf';
      const longNameFile: Express.Multer.File = {
        ...testFontFile,
        originalname: longName,
      };

      await expect(
        service.uploadFont(longNameFile, FontUploadTarget.BOTH)
      ).rejects.toThrow(BadRequestException);
    });
  });
});
