/**
 * 另存为成功后的缩略图生成与上传（ADR-0040 内部工具）
 */
import { generateThumbnail, uploadThumbnail } from '@/services/mxcadManager';

export async function uploadSaveAsThumbnail(nodeId: string): Promise<void> {
  try {
    const imageData = await generateThumbnail();
    if (!imageData) {
      console.warn(`[handleSaveAsSuccess] 缩略图生成失败(无数据): ${nodeId}`);
      return;
    }
    console.log(`[handleSaveAsSuccess] 缩略图生成成功, 开始上传: ${nodeId}`);
    const uploaded = await uploadThumbnail(nodeId, imageData);
    if (uploaded) {
      console.log(`[handleSaveAsSuccess] 缩略图上传成功: ${nodeId}`);
    } else {
      console.warn(`[handleSaveAsSuccess] 缩略图上传失败: ${nodeId}`);
    }
  } catch (err) {
    console.error('[handleSaveAsSuccess] 缩略图生成/上传异常:', err);
  }
}
