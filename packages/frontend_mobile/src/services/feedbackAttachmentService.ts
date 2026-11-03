/**
 * 用户反馈附件上传/下载（移动端唯一出口，对齐 PC `hooks/feedback/useFeedbackAttachments.ts`）。
 *
 * 三种来源：
 *  - 图片/文档：直接 multipart 上传（feedbackAttachmentControllerUpload），返回附件 id
 *    供提交时绑定；匿名携带设备令牌（后端只存 HMAC）。
 *  - 图纸（copy，本地上传文件）：同走 multipart 上传——后端 detectType 按扩展名识别为
 *    DRAWING 并直存附件存储区（原始文件，下载即原图），无 nodeId/转换时序依赖。
 *    ⚠️ 不能复用 mxcad 图纸分片通道：无 nodeId 时后端走 no-node 预览路径（不建节点、
 *    异步转换），registerDrawing 拿不到 nodeId；skipDb 变体又不转换。故本地上传图纸与图片同路。
 *  - 图纸（reference）：引用已有图纸，仅存 nodeId 不重复上传（本入口登录后使用）。
 *
 * 下载：后端 DTO 的 downloadUrl 已带 /api/v1 前缀，本文件统一补 origin 成绝对 URL。
 */
import {
  feedbackAttachmentControllerUpload,
  feedbackAttachmentControllerRegisterDrawing,
} from '@cloudcad/api-sdk/sdk.gen';
import type { FeedbackAttachmentDto } from '@cloudcad/api-sdk/types.gen';
import { getApiOrigin } from '@/utils/apiConfig';
import { getFeedbackAnonToken } from '@/constants/feedback';

/** 图纸扩展名（与后端 feedback.constants FEEDBACK_DRAWING_EXTENSIONS 对齐） */
const DRAWING_EXTS = ['.dwg', '.dxf', '.mxweb'];

/** 是否为图纸文件（按扩展名判定，与后端 detectType 一致） */
export function isDrawingFile(file: File): boolean {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  return DRAWING_EXTS.includes(ext);
}

/**
 * 上传图片/文档附件（multipart；返回附件投影，feedbackId 暂为 null）。
 * 匿名（未登录）自动携带设备令牌。
 */
export async function uploadFileAttachment(
  file: File,
  isAuthenticated: boolean
): Promise<FeedbackAttachmentDto> {
  const res = await feedbackAttachmentControllerUpload({
    throwOnError: true,
    body: {
      file,
      anonToken: isAuthenticated ? undefined : getFeedbackAnonToken(),
    },
  });
  return res.data as FeedbackAttachmentDto;
}

/**
 * 上传本地图纸文件（copy 副本）——与图片/文档同路 multipart 直存附件存储区。
 * 后端 detectType 按扩展名（.dwg/.dxf/.mxweb）识别为 DRAWING，返回原始文件副本，
 * 下载即用户上传的原图。不走 mxcad 分片通道（无 nodeId 时不建节点，见文件头注释）。
 */
export async function uploadDrawingFile(
  file: File,
  isAuthenticated: boolean
): Promise<FeedbackAttachmentDto> {
  return uploadFileAttachment(file, isAuthenticated);
}

/**
 * 引用空间图纸（reference，统一转真实附件副本，对齐 PC useFeedbackAttachments.registerDrawing）。
 *
 * 源定位：nodeId（登录空间/项目图纸，选择弹框选中节点）。
 * thumbnailData：节点缩略图转 base64 dataURL（后端落附件缩略图区供富文本卡片显示）；
 * 无缩略图/生成失败传 undefined，卡片降级为仅下载。
 */
export async function registerDrawing(params: {
  nodeId: string;
  fileName?: string;
  thumbnailData?: string;
}): Promise<FeedbackAttachmentDto> {
  const res = await feedbackAttachmentControllerRegisterDrawing({
    throwOnError: true,
    body: { ...params, kind: 'reference' },
  });
  return res.data as FeedbackAttachmentDto;
}

/** DTO 的 downloadUrl/thumbnailUrl（后端已带 /api/v1 前缀）补 origin 成绝对 URL */
export function attachmentUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const origin = getApiOrigin();
  return origin ? `${origin}${path}` : path;
}

export type { FeedbackAttachmentDto };
