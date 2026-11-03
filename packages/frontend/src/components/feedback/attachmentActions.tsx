import React, { useCallback, useState } from 'react';
import { t } from '@/languages';
import { ImagePreviewModal } from '@/components/modals/ImagePreviewModal';
import { feedbackAttachmentAdminControllerDownload } from '@/api-sdk';
import type { FeedbackAttachmentDto } from '@/api-sdk';
import { getErrorMessage } from '@/utils/errorHandler';
import { triggerBlobDownload, triggerUrlDownload } from '@/utils/download';
import { useNotification } from '@/contexts/NotificationContext';
import { buildDrawingEditorUrl } from './feedbackDrawingUrl';

/**
 * 反馈附件「查看/下载」动作的唯一出口（管理端/我的反馈共用）。
 *
 * 动作矩阵（权限由后端 DTO 的 URL 有无承载，前端不重复判权）：
 * - IMAGE（FILE）：查看=图片预览；下载
 * - DOCUMENT（FILE）：下载（无文档预览组件）
 * - DRAWING（FILE，上传图纸）：下载
 * - DRAWING（REFERENCE，引用图纸）：查看=新标签页打开 CAD 编辑器；不下载
 * - 无 URL（提交者的图纸/引用）：无动作
 */

/** 相对 URL → 绝对 URL（后端 DTO 返回带 /api/v1 前缀的相对路径） */
export function toAbsoluteUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url) || url.startsWith('blob:')) return url;
  return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** 前端去重：按内容 MD5 在已有附件中找同内容附件（contentHash 命中 → 直接引用，不再上传） */
export function findDuplicateByContentHash(
  attachments: FeedbackAttachmentDto[],
  hash: string
): FeedbackAttachmentDto | null {
  return attachments.find((a) => a.contentHash === hash) ?? null;
}

/** 是否有「查看」动作：图片可预览；引用图纸可进编辑器；上传图纸/文档不可查看 */
export function canViewAttachment(att: FeedbackAttachmentDto): boolean {
  if (!att.viewUrl) return false;
  if (att.type === 'IMAGE') return true;
  if (att.type === 'DRAWING' && att.kind === 'REFERENCE') return true;
  return false;
}

/** 是否有「下载」动作：引用图纸只查看不下载；其余有任一 URL 即可下载 */
export function canDownloadAttachment(att: FeedbackAttachmentDto): boolean {
  if (att.type === 'DRAWING' && att.kind === 'REFERENCE') return false;
  return Boolean(att.downloadUrl || att.viewUrl);
}

/** 从 viewUrl 的签名 token（`${exp}.${hmac}`）解析过期时间（ms）；解析不到返回 null */
export function parseViewTokenExpMs(
  viewUrl: string | null | undefined
): number | null {
  if (!viewUrl) return null;
  try {
    const token = new URL(viewUrl, window.location.origin).searchParams.get(
      'token'
    );
    if (!token) return null;
    const exp = Number(token.split('.')[0]);
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** 查看链接是否临近失效（剩余 <60s）；token 解析不到时视为新鲜（以后端校验为准） */
export function isViewUrlStale(
  att: FeedbackAttachmentDto,
  nowMs = Date.now()
): boolean {
  const exp = parseViewTokenExpMs(att.viewUrl);
  if (exp === null) return false;
  return exp - nowMs < 60_000;
}

/**
 * 引用图纸「查看」：新标签页打开 CAD 编辑器。
 * 优先走编辑器原生打开管线（nodeId/hash + 框选区域定位，与分享图纸同模式，无 token TTL 问题）；
 * 无 nodeId 且无 fileHash 时回落 viewUrl 直链（fileUrl 参数）。
 */
export function openReferenceDrawing(att: FeedbackAttachmentDto): void {
  const url = buildDrawingEditorUrl(att) ?? toAbsoluteUrl(att.viewUrl);
  if (!url) return;
  window.open(url, '_blank', 'noopener');
}

/**
 * 下载附件：有 downloadUrl（管理端点）→ SDK 取 Blob（自动带 Bearer，文件名可靠）；
 * 仅 viewUrl（签名 token 直链）→ 锚点直下。失败抛错（携带后端文案），由调用方提示。
 */
export async function downloadAttachment(
  att: FeedbackAttachmentDto
): Promise<void> {
  const fileName = att.fileName || undefined;
  if (att.downloadUrl) {
    const res = await feedbackAttachmentAdminControllerDownload({
      throwOnError: true,
      path: { id: att.id },
    });
    if (!(res.data instanceof Blob)) {
      throw new Error(t('下载失败'));
    }
    triggerBlobDownload(res.data, fileName ?? `attachment-${att.id}`);
    return;
  }
  const url = toAbsoluteUrl(att.viewUrl);
  if (!url) throw new Error(t('下载失败'));
  triggerUrlDownload(url, fileName);
}

/** 下载失败提示（统一出口：透传后端文案） */
export function getDownloadErrorMessage(err: unknown): string {
  return getErrorMessage(err) || t('下载失败');
}

interface AttachmentPreviewTarget {
  src: string;
  alt: string;
}

/** 图片预览态 + 弹框元素（附件列表与管理端面板共用，避免各写一份 Modal 接线） */
export function useAttachmentPreview() {
  const [target, setTarget] = useState<AttachmentPreviewTarget | null>(null);

  const openPreview = useCallback((src: string, alt?: string) => {
    setTarget({ src, alt: alt ?? '' });
  }, []);

  const closePreview = useCallback(() => setTarget(null), []);

  const previewModal = (
    <ImagePreviewModal
      isOpen={target !== null}
      src={target?.src ?? ''}
      alt={target?.alt || undefined}
      onClose={closePreview}
    />
  );

  return { openPreview, closePreview, previewModal };
}

/**
 * 附件「查看/下载」动作 hook（附件列表与管理端操作列共用，单一实现）。
 *
 * - 查看：IMAGE → 图片预览；DRAWING REFERENCE → 新标签页打开 CAD 编辑器
 * - 下载：downloadUrl → SDK 取 Blob；仅 viewUrl → 锚点直下；失败 toast 后端文案
 * - token 过期守卫：viewUrl 剩余 <60s 时经 onStaleView 重取新 DTO 再动作；
 *   重取失败 → toast 提示并继续用旧链接（尽力而为）
 */
export function useAttachmentActions(options: {
  onStaleView?: (attachmentId: string) => Promise<FeedbackAttachmentDto | null>;
} = {}) {
  const { showToast } = useNotification();
  const { openPreview, closePreview, previewModal } = useAttachmentPreview();
  const { onStaleView } = options;

  const resolveFresh = useCallback(
    async (att: FeedbackAttachmentDto): Promise<FeedbackAttachmentDto> => {
      if (!isViewUrlStale(att) || !onStaleView) return att;
      try {
        return (await onStaleView(att.id)) ?? att;
      } catch {
        showToast(t('预览链接可能已过期，请刷新列表后重试'), 'error');
        return att;
      }
    },
    [onStaleView, showToast]
  );

  const handleView = useCallback(
    async (att: FeedbackAttachmentDto): Promise<void> => {
      const fresh = await resolveFresh(att);
      if (!canViewAttachment(fresh)) return;
      if (fresh.type === 'IMAGE') {
        const src = toAbsoluteUrl(fresh.viewUrl);
        if (src) openPreview(src, fresh.fileName || undefined);
        return;
      }
      openReferenceDrawing(fresh);
    },
    [resolveFresh, openPreview]
  );

  const handleDownload = useCallback(
    async (att: FeedbackAttachmentDto): Promise<void> => {
      if (!canDownloadAttachment(att)) return;
      const fresh = await resolveFresh(att);
      try {
        await downloadAttachment(fresh);
      } catch (err) {
        showToast(getDownloadErrorMessage(err), 'error');
      }
    },
    [resolveFresh, showToast]
  );

  return { handleView, handleDownload, openPreview, closePreview, previewModal };
}
