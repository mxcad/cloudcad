export interface UploadResult {
  key: string;
  etag: string;
  size: number;
}

export interface Part {
  partNumber: number;
  etag: string;
}

export interface StorageProvider {
  // 基础操作
  uploadFile(key: string, data: Buffer): Promise<UploadResult>;
  downloadFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
  fileExists(key: string): Promise<boolean>;

  // 文件流操作（用于图片代理等场景）
  getFileStream(key: string): Promise<NodeJS.ReadableStream>;

  // 预签名 URL
  getPresignedPutUrl(key: string, expiry?: number): Promise<string>;
}
