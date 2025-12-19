import { apiService } from './apiService';

export interface FileUploadOptions {
  parentId?: string;
  onProgress?: (progress: number) => void;
  onStatusChange?: (
    status: 'uploading' | 'processing' | 'completed' | 'error'
  ) => void;
  onError?: (error: Error) => void;
}

export class FileUploadService {
  // 使用apiService实例，自动包含认证拦截器

  constructor(private options: FileUploadOptions) {}

  /**
   * 上传文件
   */
  async uploadFile(file: File): Promise<any> {
    try {
      this.options.onStatusChange?.('uploading');

      // 将文件转换为base64
      const fileContent = await this.fileToBase64(file);

      const uploadData = {
        fileName: file.name,
        fileContent,
        parentId: this.options.parentId,
      };

      console.log('[FileUploadService] 上传数据:', {
        fileName: uploadData.fileName,
        parentId: uploadData.parentId,
        fileContentLength: uploadData.fileContent?.length || 0,
      });

      const response = await apiService.post(
        'file-system/files/upload',
        uploadData
      );

      this.options.onProgress?.(100);
      this.options.onStatusChange?.('completed');

      return response.data;
    } catch (error) {
      this.options.onError?.(error as Error);
      this.options.onStatusChange?.('error');
      throw error;
    }
  }

  /**
   * 文件转Base64
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1]; // 移除 data:*/*;base64, 前缀
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
