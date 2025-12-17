import { apiService } from './apiService';

export interface FileUploadOptions {
  projectId?: string;
  onProgress?: (progress: number) => void;
  onStatusChange?: (status: 'uploading' | 'processing' | 'completed' | 'error') => void;
  onError?: (error: Error) => void;
}

export interface MultipartUploadInfo {
  uploadId: string;
  storageKey: string;
  sessionId: string;
  chunkSize: number;
  totalChunks: number;
}

export class FileUploadService {
  // 使用apiService实例，自动包含认证拦截器

  constructor(private options: FileUploadOptions) {}

  /**
   * 上传文件（自动选择小文件直接上传或大文件分片上传）
   */
  async uploadFile(file: File): Promise<any> {
    try {
      this.options.onStatusChange?.('uploading');

      // 大于50MB的文件使用分片上传
      if (file.size > 50 * 1024 * 1024) {
        return this.uploadLargeFile(file);
      } else {
        return this.uploadSmallFile(file);
      }
    } catch (error) {
      this.options.onError?.(error as Error);
      this.options.onStatusChange?.('error');
      throw error;
    }
  }

  /**
   * 小文件直接上传
   */
  private async uploadSmallFile(file: File): Promise<any> {
    // 将文件转换为base64
    const fileContent = await this.fileToBase64(file);
    
    const response = await apiService.post('/file-system/files/upload', {
      fileName: file.name,
      fileContent,
      projectId: this.options.projectId,
    });

    this.options.onProgress?.(100);
    this.options.onStatusChange?.('completed');
    
    return response.data;
  }

  /**
   * 大文件分片上传
   */
  private async uploadLargeFile(file: File): Promise<any> {
    // 1. 初始化分片上传
    const initResponse = await apiService.post('/file-system/files/multipart/init', {
      fileName: file.name,
      fileSize: file.size,
      parentId: this.options.projectId,
    });

    const uploadInfo: MultipartUploadInfo = initResponse.data;

    // 2. 分片上传
    const chunkSize = uploadInfo.chunkSize;
    const totalChunks = uploadInfo.totalChunks;
    const parts: Array<{ partNumber: number; etag: string }> = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      // 将分片转换为base64
      const chunkData = await this.blobToBase64(chunk);

      const chunkResponse = await apiService.post('/file-system/files/multipart/chunk', {
        uploadId: uploadInfo.uploadId,
        chunkIndex: i,
        chunkData,
      });

      parts.push({
        partNumber: i + 1, // MinIO分片编号从1开始
        etag: chunkResponse.data.etag,
      });

      // 更新进度
      const progress = Math.round(((i + 1) / totalChunks) * 100);
      this.options.onProgress?.(progress);
    }

    // 3. 完成上传
    this.options.onStatusChange?.('processing');
    const completeResponse = await apiService.post('/file-system/files/multipart/complete', {
      uploadId: uploadInfo.uploadId,
      parts,
    });

    this.options.onStatusChange?.('completed');
    return completeResponse.data;
  }

  /**
   * 获取上传进度
   */
  async getUploadProgress(uploadId: string): Promise<{
    status: string;
    progress: number;
    uploadedParts: number;
    totalParts: number;
  }> {
    const response = await apiService.get(`/file-system/files/multipart/progress/${uploadId}`);
    return response.data;
  }

  /**
   * 中止上传
   */
  async abortUpload(uploadId: string): Promise<void> {
    await apiService.post('/file-system/files/multipart/abort', { uploadId });
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

  /**
   * Blob转Base64
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1]; // 移除 data:*/*;base64, 前缀
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}