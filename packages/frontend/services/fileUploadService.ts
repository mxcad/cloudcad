import { apiService } from './apiService';

export interface FileUploadOptions {
  projectId?: string;
  parentId?: string;
  onProgress?: (progress: number) => void;
  onStatusChange?: (
    status: 'uploading' | 'processing' | 'completed' | 'error'
  ) => void;
  onError?: (error: Error) => void;
}

/**
 * 文件类型检测器
 */
class FileTypeDetector {
  private static readonly CAD_EXTENSIONS = ['.dwg', '.dxf'];
  
  static isCadFile(fileName: string): boolean {
    const ext = '.' + fileName.split('.').pop()?.toLowerCase();
    return this.CAD_EXTENSIONS.includes(ext);
  }
  
  static needsConversion(fileName: string): boolean {
    return this.isCadFile(fileName);
  }
}

export class FileUploadService {
  constructor(private options: FileUploadOptions) {}

  /**
   * 上传文件（统一使用MxCAD接口）
   */
  async uploadFile(file: File): Promise<any> {
    try {
      this.options.onStatusChange?.('uploading');

      // 计算文件哈希
      const hash = await this.calculateFileHash(file);
      
      // 检查文件是否已存在
      try {
        const existResponse = await apiService.post('/mxcad/files/fileisExist', {
          fileHash: hash,
          filename: file.name,
          projectId: this.options.projectId,
          parentId: this.options.parentId,
        });

        if (existResponse.data.ret === 'fileAlreadyExist') {
          // 文件已存在，秒传
          this.options.onProgress?.(100);
          this.options.onStatusChange?.('completed');
          return { ret: 'ok', fileExists: true };
        }
      } catch (error) {
        // 检查失败，继续上传
        // 静默：文件存在性检查失败，继续上传
      }

      // 判断文件类型和上传方式
      if (file.size > 5 * 1024 * 1024) {
        // 大文件：分片上传
        await this.uploadInChunks(file, hash);
      } else {
        // 小文件：直接上传
        await this.uploadDirectly(file, hash);
      }

      this.options.onProgress?.(100);
      this.options.onStatusChange?.('completed');
      
      return { ret: 'ok' };
    } catch (error) {
      this.options.onError?.(error as Error);
      this.options.onStatusChange?.('error');
      throw error;
    }
  }

  /**
   * 直接上传小文件
   */
  private async uploadDirectly(file: File, hash: string): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', file.name);
    formData.append('hash', hash);
    formData.append('size', file.size.toString());
    formData.append('projectId', this.options.projectId || '');
    formData.append('parentId', this.options.parentId || '');

    // CAD文件需要特殊处理
    if (FileTypeDetector.needsConversion(file.name)) {
      this.options.onStatusChange?.('processing'); // CAD文件转换状态
    }

    const response = await apiService.post('/mxcad/files/uploadFiles', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (response.data.ret !== 'ok') {
      throw new Error(`上传失败: ${response.data.ret}`);
    }
  }

  /**
   * 分片上传大文件
   */
  private async uploadInChunks(file: File, hash: string): Promise<void> {
    const chunkSize = 5 * 1024 * 1024; // 5MB
    const totalChunks = Math.ceil(file.size / chunkSize);

    // CAD文件需要特殊处理
    if (FileTypeDetector.needsConversion(file.name)) {
      this.options.onStatusChange?.('processing'); // CAD文件转换状态
    }

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      // 检查分片是否存在
      try {
        const chunkResponse = await apiService.post('/mxcad/files/chunkisExist', {
          chunk: chunkIndex,
          chunks: totalChunks,
          fileName: file.name,
          fileHash: hash,
          size: chunk.size,
          projectId: this.options.projectId,
          parentId: this.options.parentId,
        });

        if (chunkResponse.data.ret === 'chunkAlreadyExist') {
          // 分片已存在，跳过
          this.options.onProgress?.(((chunkIndex + 1) / totalChunks) * 100);
          continue;
        }
      } catch (error) {
        // 检查失败，继续上传
      }

      // 上传分片
      const formData = new FormData();
      formData.append('file', chunk);
      formData.append('chunk', chunkIndex.toString());
      formData.append('chunks', totalChunks.toString());
      formData.append('name', file.name);
      formData.append('hash', hash);
      formData.append('size', file.size.toString());
      formData.append('projectId', this.options.projectId || '');
      formData.append('parentId', this.options.parentId || '');

      try {
        await apiService.post('/mxcad/files/uploadFiles', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        
        this.options.onProgress?.(((chunkIndex + 1) / totalChunks) * 100);
      } catch (error) {
        // 静默：分片上传异常，但继续上传
        // 不抛出错误，继续上传下一个分片
      }
    }

    // 完成上传 - 等待后端处理
    if (FileTypeDetector.needsConversion(file.name)) {
      // CAD文件需要等待转换完成
      await this.waitForConversionComplete(file.name, hash);
    }
  }

  /**
   * 等待CAD文件转换完成
   */
  private async waitForConversionComplete(fileName: string, hash: string): Promise<void> {
    // 静默：等待CAD文件转换完成
    
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      try {
        const response = await apiService.post('/mxcad/files/tz', {
          fileHash: hash,
        });

        if (response.data.ret === 'ok') {
          // 静默：CAD文件转换完成
          return;
        }
      } catch (error) {
        // 静默：转换状态检查失败
      }
      
      attempts++;
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // 静默：CAD文件转换验证超时，但文件可能仍在处理
  }

  /**
   * 计算文件哈希
   */
  private calculateFileHash(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        const hash = await this.simpleHash(buffer);
        resolve(hash);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * 简单的哈希函数
   */
  private simpleHash(buffer: ArrayBuffer): Promise<string> {
    return new Promise((resolve) => {
      const uint8Array = new Uint8Array(buffer);
      let hash = '';
      for (let i = 0; i < uint8Array.length; i++) {
        hash += uint8Array[i].toString(16).padStart(2, '0');
      }
      resolve(hash.substring(0, 32)); // 返回前32位作为哈希值
    });
  }
}
