import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  feedbackAttachmentControllerRegisterDrawing,
  feedbackAttachmentControllerUpload,
} from '@/api-sdk';
import type { FeedbackAttachmentDto } from '@/api-sdk';
import { getFeedbackAnonToken } from '@/constants/feedback';

/**
 * 反馈附件上传（PC 端唯一出口，ADR-0085）
 *
 * 三种来源：
 *  - 图片/文档：直接 multipart 上传（feedbackAttachmentControllerUpload），
 *    返回附件 id 供提交时绑定；匿名携带设备令牌（后端只存 HMAC）。
 *  - 图纸（copy，本地上传文件）：同走 multipart 上传——后端 detectType 按扩展名
 *    识别为 DRAWING 并直存附件存储区（原始文件，下载即原图），无 nodeId/转换时序依赖。
 *    ⚠️ 不能复用 mxcad 图纸分片通道：无 nodeId 时后端走 no-node 预览路径（不建节点、
 *    异步转换），registerDrawing 拿不到 nodeId（attachment_drawing_missing 400）；
 *    skipDb 变体又不转换，findMxwebFile 也定位不到。故本地上传图纸与图片同路。
 *  - 图纸（reference）：引用空间/当前图纸（nodeId 或 fileHash），统一转真实附件副本
 *    （后端 copyToStorage 到附件存储区，带 downloadUrl）——fileHash 不稳定不能只存引用。
 *
 * 截图入口已随「反馈附件改为富文本内联」移除（见 ADR-0085 修订）。
 */
export function useFeedbackAttachments() {
  const { isAuthenticated } = useAuth();

  /** 上传图片/文档附件（multipart；返回附件投影，feedbackId 暂为 null） */
  const uploadFileAttachment = useCallback(
    async (file: File): Promise<FeedbackAttachmentDto> => {
      const res = await feedbackAttachmentControllerUpload({
        throwOnError: true,
        body: {
          file,
          anonToken: isAuthenticated ? undefined : getFeedbackAnonToken(),
        },
      });
      return res.data as FeedbackAttachmentDto;
    },
    [isAuthenticated]
  );

  /**
   * 上传本地图纸文件（copy 副本）——与图片/文档同路 multipart 直存附件存储区。
   * 后端 detectType 按扩展名（.dwg/.dxf/.mxweb）识别为 DRAWING，返回原始文件副本，
   * 下载即用户上传的原图。不走 mxcad 分片通道（无 nodeId 时不建节点，见文件头注释）。
   */
  const uploadDrawingFile = useCallback(
    async (
      file: File,
      _onProgress?: (percentage: number) => void
    ): Promise<FeedbackAttachmentDto> => uploadFileAttachment(file),
    [uploadFileAttachment]
  );

  /**
   * 引用图纸（reference，统一转真实附件副本）。
   *
   * 源定位二选一：
   * - nodeId：登录空间/项目图纸（选择弹框选中节点）
   * - fileHash：未登录 CAD 编辑器当前图纸（无 nodeId，按 hash 内容寻址）
   * thumbnailData：前端引擎内生成/指定区域的缩略图（base64 dataURL），
   * 后端落附件缩略图区（thumbnailPath）供富文本卡片显示。
   * region：指定区域坐标（"x1,y1,x2,y2"，分享图纸同款编码）；非空时查看链接带
   * ?region=，打开图纸自动定位到该区域。
   */
  const registerDrawing = useCallback(
    async (params: {
      nodeId?: string;
      fileHash?: string;
      fileName?: string;
      thumbnailData?: string;
      region?: string;
    }): Promise<FeedbackAttachmentDto> => {
      const res = await feedbackAttachmentControllerRegisterDrawing({
        throwOnError: true,
        body: { ...params, kind: 'reference' },
      });
      return res.data as FeedbackAttachmentDto;
    },
    []
  );

  return {
    uploadFileAttachment,
    uploadDrawingFile,
    registerDrawing,
  };
}
