import { Injectable, Logger, BadRequestException } from '@nestjs/common';

export const FILE_UPLOAD_CONFIG = {
  allowedExtensions: ['.dwg', '.dxf'],
  maxFileSize: 104857600,
  maxFilesPerUpload: 10,
  blockedExtensions: ['.exe', '.bat', '.sh', '.cmd', '.ps1'],
};

export interface FileTypeConfig {
  extension: string;
  mimeType: string;
  maxSize: number;
  enabled: boolean;
}

export const CONFIGURABLE_FILE_TYPES: FileTypeConfig[] = [
  {
    extension: '.dwg',
    mimeType: 'application/acad',
    maxSize: 100 * 1024 * 1024,
    enabled: true,
  },
  {
    extension: '.dxf',
    mimeType: 'application/dxf',
    maxSize: 100 * 1024 * 1024,
    enabled: true,
  },
  {
    extension: '.pdf',
    mimeType: 'application/pdf',
    maxSize: 50 * 1024 * 1024,
    enabled: false,
  },
];

@Injectable()
export class FileValidationService {
  private readonly logger = new Logger(FileValidationService.name);

  validateFileType(file: Express.Multer.File): void {
    const extension = `.${file.originalname.split('.').pop()?.toLowerCase() || ''}`;

    if (FILE_UPLOAD_CONFIG.blockedExtensions.includes(extension)) {
      throw new BadRequestException(`禁止上传 ${extension} 类型文件`);
    }

    if (!FILE_UPLOAD_CONFIG.allowedExtensions.includes(extension)) {
      throw new BadRequestException(
        `仅允许上传以下类型文件: ${FILE_UPLOAD_CONFIG.allowedExtensions.join(', ')}`
      );
    }

    const expectedMimeType = this.getExpectedMimeType(extension);
    if (expectedMimeType && !file.mimetype.includes('octet-stream')) {
      this.logger.warn(
        `MIME类型可能不匹配: 文件=${file.originalname}, 期望=${expectedMimeType}, 实际=${file.mimetype}`
      );
    }

    this.logger.log(`文件类型验证通过: ${file.originalname} (${extension})`);
  }

  validateFileSize(file: Express.Multer.File): void {
    if (file.size > FILE_UPLOAD_CONFIG.maxFileSize) {
      throw new BadRequestException(
        `文件大小超过限制: ${(file.size / 1024 / 1024).toFixed(2)}MB > ${(FILE_UPLOAD_CONFIG.maxFileSize / 1024 / 1024).toFixed(2)}MB`
      );
    }
  }

  validateFile(file: Express.Multer.File): void {
    this.validateFileType(file);
    this.validateFileSize(file);
  }

  private getExpectedMimeType(extension: string): string | null {
    const config = CONFIGURABLE_FILE_TYPES.find(
      (c) => c.extension === extension && c.enabled
    );
    return config?.mimeType || null;
  }
}
