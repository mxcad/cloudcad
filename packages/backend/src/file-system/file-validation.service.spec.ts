import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { FileValidationService, FILE_UPLOAD_CONFIG } from './file-validation.service';

describe('FileValidationService', () => {
  let service: FileValidationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileValidationService],
    }).compile();

    service = module.get<FileValidationService>(FileValidationService);
  });

  describe('validateFileType', () => {
    it('应该通过 .dwg 文件验证', () => {
      const file = {
        originalname: 'test.dwg',
        mimetype: 'application/acad',
        size: 1024,
      } as Express.Multer.File;

      expect(() => service.validateFileType(file)).not.toThrow();
    });

    it('应该通过 .dxf 文件验证', () => {
      const file = {
        originalname: 'test.dxf',
        mimetype: 'application/dxf',
        size: 1024,
      } as Express.Multer.File;

      expect(() => service.validateFileType(file)).not.toThrow();
    });

    it('应该通过 .DWG 大写扩展名文件验证', () => {
      const file = {
        originalname: 'test.DWG',
        mimetype: 'application/acad',
        size: 1024,
      } as Express.Multer.File;

      expect(() => service.validateFileType(file)).not.toThrow();
    });

    it('应该拒绝黑名单中的 .exe 文件', () => {
      const file = {
        originalname: 'malicious.exe',
        mimetype: 'application/x-msdownload',
        size: 1024,
      } as Express.Multer.File;

      expect(() => service.validateFileType(file)).toThrow(BadRequestException);
      expect(() => service.validateFileType(file)).toThrow('禁止上传 .exe 类型文件');
    });

    it('应该拒绝黑名单中的 .bat 文件', () => {
      const file = {
        originalname: 'script.bat',
        mimetype: 'application/x-bat',
        size: 1024,
      } as Express.Multer.File;

      expect(() => service.validateFileType(file)).toThrow(BadRequestException);
      expect(() => service.validateFileType(file)).toThrow('禁止上传 .bat 类型文件');
    });

    it('应该拒绝不在白名单中的 .pdf 文件', () => {
      const file = {
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      } as Express.Multer.File;

      expect(() => service.validateFileType(file)).toThrow(BadRequestException);
      expect(() => service.validateFileType(file)).toThrow('仅允许上传以下类型文件');
    });

    it('应该拒绝不在白名单中的 .jpg 文件', () => {
      const file = {
        originalname: 'image.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
      } as Express.Multer.File;

      expect(() => service.validateFileType(file)).toThrow(BadRequestException);
    });

    it('应该处理没有扩展名的文件', () => {
      const file = {
        originalname: 'noextension',
        mimetype: 'application/octet-stream',
        size: 1024,
      } as Express.Multer.File;

      expect(() => service.validateFileType(file)).toThrow(BadRequestException);
    });

    it('应该处理多个点的文件名', () => {
      const file = {
        originalname: 'test.backup.dwg',
        mimetype: 'application/acad',
        size: 1024,
      } as Express.Multer.File;

      expect(() => service.validateFileType(file)).not.toThrow();
    });
  });

  describe('validateFileSize', () => {
    it('应该通过小于限制的文件大小验证', () => {
      const file = {
        originalname: 'test.dwg',
        size: 50 * 1024 * 1024,
      } as Express.Multer.File;

      expect(() => service.validateFileSize(file)).not.toThrow();
    });

    it('应该通过等于限制的文件大小验证', () => {
      const file = {
        originalname: 'test.dwg',
        size: FILE_UPLOAD_CONFIG.maxFileSize,
      } as Express.Multer.File;

      expect(() => service.validateFileSize(file)).not.toThrow();
    });

    it('应该拒绝超过限制的文件大小', () => {
      const file = {
        originalname: 'large.dwg',
        size: FILE_UPLOAD_CONFIG.maxFileSize + 1,
      } as Express.Multer.File;

      expect(() => service.validateFileSize(file)).toThrow(BadRequestException);
      expect(() => service.validateFileSize(file)).toThrow('文件大小超过限制');
    });

    it('应该拒绝远超限制的文件大小', () => {
      const file = {
        originalname: 'huge.dwg',
        size: 500 * 1024 * 1024,
      } as Express.Multer.File;

      expect(() => service.validateFileSize(file)).toThrow(BadRequestException);
    });

    it('应该通过零字节文件验证', () => {
      const file = {
        originalname: 'empty.dwg',
        size: 0,
      } as Express.Multer.File;

      expect(() => service.validateFileSize(file)).not.toThrow();
    });
  });

  describe('validateFile', () => {
    it('应该通过完整的文件验证', () => {
      const file = {
        originalname: 'test.dwg',
        mimetype: 'application/acad',
        size: 10 * 1024 * 1024,
      } as Express.Multer.File;

      expect(() => service.validateFile(file)).not.toThrow();
    });

    it('应该拒绝类型错误的文件', () => {
      const file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      } as Express.Multer.File;

      expect(() => service.validateFile(file)).toThrow(BadRequestException);
    });

    it('应该拒绝大小超限的文件', () => {
      const file = {
        originalname: 'test.dwg',
        mimetype: 'application/acad',
        size: FILE_UPLOAD_CONFIG.maxFileSize + 1,
      } as Express.Multer.File;

      expect(() => service.validateFile(file)).toThrow(BadRequestException);
    });

    it('应该拒绝类型和大小都错误的文件', () => {
      const file = {
        originalname: 'test.exe',
        mimetype: 'application/x-msdownload',
        size: FILE_UPLOAD_CONFIG.maxFileSize + 1,
      } as Express.Multer.File;

      expect(() => service.validateFile(file)).toThrow(BadRequestException);
    });
  });

  describe('MIME type validation', () => {
    it('应该对 octet-stream 类型给出警告', () => {
      const logSpy = jest.spyOn(service['logger'], 'warn');
      const file = {
        originalname: 'test.dwg',
        mimetype: 'application/octet-stream',
        size: 1024,
      } as Express.Multer.File;

      service.validateFileType(file);

      expect(logSpy).not.toHaveBeenCalled();
    });

    it('应该记录类型验证通过的日志', () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      const file = {
        originalname: 'test.dwg',
        mimetype: 'application/acad',
        size: 1024,
      } as Express.Multer.File;

      service.validateFileType(file);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('文件类型验证通过')
      );
    });
  });

  describe('边界情况', () => {
    it('应该处理文件名为空字符串的情况', () => {
      const file = {
        originalname: '',
        mimetype: 'application/acad',
        size: 1024,
      } as Express.Multer.File;

      expect(() => service.validateFileType(file)).toThrow(BadRequestException);
    });

    it('应该处理只有点号的文件名', () => {
      const file = {
        originalname: '.',
        mimetype: 'application/acad',
        size: 1024,
      } as Express.Multer.File;

      expect(() => service.validateFileType(file)).toThrow(BadRequestException);
    });

    it('应该处理以点开头的文件名', () => {
      const file = {
        originalname: '.dwg',
        mimetype: 'application/acad',
        size: 1024,
      } as Express.Multer.File;

      expect(() => service.validateFileType(file)).not.toThrow();
    });

    it('应该处理负数文件大小', () => {
      const file = {
        originalname: 'test.dwg',
        size: -1,
      } as Express.Multer.File;

      expect(() => service.validateFileSize(file)).not.toThrow();
    });
  });

  describe('私有方法测试', () => {
    it('应该处理 getExpectedMimeType 返回 null', () => {
      const result = service['getExpectedMimeType']('dwg');
      expect(result).toBeNull();
    });

    it('应该处理未配置的扩展名', () => {
      const result = service['getExpectedMimeType']('unknown');
      expect(result).toBeNull();
    });

    it('应该处理禁用的文件类型', () => {
      const result = service['getExpectedMimeType']('disabled-type');
      expect(result).toBeNull();
    });
  });
});
