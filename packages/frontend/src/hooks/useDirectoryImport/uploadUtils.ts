import {
  uploadMxCadFile,
  MxCadUploadOptions,
  MxCadUploadResult,
} from '../../utils/mxcadUploadUtils';

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
