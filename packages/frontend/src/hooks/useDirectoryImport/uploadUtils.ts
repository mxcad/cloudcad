import {
  uploadMxCadFile,
  MxCadUploadOptions,
  MxCadUploadResult,
} from '../../utils/mxcadUploadUtils';

/**
 * 计算文件 Hash（简化版，使用文件名+大小作为标识）
 * 实际项目中应使用 SparkMD5 等库计算真实 Hash
 */
export async function computeFileHash(file: File): Promise<string> {
  // 简化实现：使用文件名+大小生成哈希
  // 生产环境应使用 SparkMD5 计算真实文件内容哈希
  const data = `${file.name}-${file.size}-${file.lastModified}`;
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 带重试的文件上传
 */
export async function uploadFileWithRetry(
  file: File,
  hash: string,
  nodeId: string,
  conflictStrategy?: 'skip' | 'overwrite' | 'rename',
  maxRetries: number = 3
): Promise<MxCadUploadResult | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const options: MxCadUploadOptions = {
        file,
        hash,
        nodeId,
        conflictStrategy,
      };

      return await uploadMxCadFile(options);
    } catch (error) {
      console.error(`上传失败 (尝试 ${i + 1}/${maxRetries}):`, error);
      if (i === maxRetries - 1) {
        throw error;
      }
      // 等待一段时间后重试
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return null;
}
