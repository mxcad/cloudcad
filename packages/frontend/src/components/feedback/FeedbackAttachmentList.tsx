import React from 'react';
import { Download, Eye } from 'lucide-react';
import { t } from '@/languages';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import type { FeedbackAttachmentDto } from '@/api-sdk';
import {
  canDownloadAttachment,
  canViewAttachment,
  useAttachmentActions,
} from './attachmentActions';

interface FeedbackAttachmentListProps {
  attachments: FeedbackAttachmentDto[];
  /** 紧凑模式（表格单元格内）：纯展示，动作由所在表格的「操作」列承载 */
  compact?: boolean;
  /**
   * 查看/下载前 viewUrl 签名 token 临近过期（<60s）时回调重取新 DTO；
   * 不传则直接用旧链接（尽力而为，后端校验兜底）。
   */
  onStaleView?: (attachmentId: string) => Promise<FeedbackAttachmentDto | null>;
}

const TYPE_LABEL: Record<string, string> = {
  IMAGE: '图片',
  DOCUMENT: '文档',
  DRAWING: '图纸',
};

const KIND_LABEL: Record<string, string> = {
  FILE: '副本',
  REFERENCE: '引用',
};

function formatSize(size: number | null): string {
  if (!size) return '';
  const mb = size / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)}MB`;
  const kb = size / 1024;
  return `${kb.toFixed(0)}KB`;
}

/**
 * 反馈附件展示——我的反馈 / 匿名查询 / 管理端详情共用。
 *
 * 缩略图（图片/图纸 thumbnailUrl）优先，文档显示类型徽标。
 * 动作（非紧凑）：图片=查看(预览)+下载；文档/上传图纸=下载；
 * 引用图纸=查看(新标签页打开 CAD 编辑器)；无 URL（提交者的图纸/引用）=纯徽标无动作。
 * 权限门禁由后端 DTO 的 URL 有无承载，前端不重复判权。
 */
export const FeedbackAttachmentList: React.FC<FeedbackAttachmentListProps> = ({
  attachments,
  compact = false,
  onStaleView,
}) => {
  const { handleView, handleDownload, previewModal } = useAttachmentActions({
    onStaleView,
  });

  if (!attachments?.length) {
    return (
      <span className="text-xs text-[var(--text-secondary)]">
        {t('无附件')}
      </span>
    );
  }

  return (
    <>
      <div className={compact ? 'flex flex-wrap gap-1.5' : 'flex flex-wrap gap-2'}>
        {attachments.map((att) => {
          const label =
            att.fileName ||
            `${t(TYPE_LABEL[att.type] ?? '附件')}${KIND_LABEL[att.kind] ? `（${t(KIND_LABEL[att.kind] ?? '')}）` : ''}`;
          const isImage =
            att.type === 'IMAGE' && (att.thumbnailUrl || att.viewUrl || att.downloadUrl);
          const thumb = isImage ? (att.thumbnailUrl || att.viewUrl || att.downloadUrl) : null;
          const inner = (
            <>
              {thumb ? (
                <img
                  src={thumb}
                  alt={label}
                  className={compact ? 'h-5 w-5 rounded object-cover' : 'h-10 w-10 rounded object-cover'}
                />
              ) : (
                <span
                  className={
                    compact
                      ? 'flex h-5 w-5 items-center justify-center rounded bg-[var(--bg-secondary)] text-[10px]'
                      : 'flex h-10 w-10 items-center justify-center rounded bg-[var(--bg-secondary)] text-xs'
                  }
                >
                  {att.type === 'DRAWING' ? 'DWG' : att.type === 'DOCUMENT' ? 'DOC' : 'IMG'}
                </span>
              )}
              {!compact && (
                <span className="max-w-[160px] truncate">
                  {label}
                  {att.size ? (
                    <span className="ml-1 text-xs text-[var(--text-secondary)]">
                      {formatSize(att.size)}
                    </span>
                  ) : null}
                </span>
              )}
            </>
          );
          const cls = compact
            ? 'inline-flex items-center gap-1 rounded border border-[var(--border-default)] px-1.5 py-0.5 text-xs text-[var(--text-primary)]'
            : 'inline-flex items-center gap-2 rounded-lg border border-[var(--border-default)] p-2 text-sm text-[var(--text-primary)]';
          // 动作按钮：按「URL 有无 + type/kind」矩阵渲染；无 URL 时纯徽标无触发
          const canView = !compact && canViewAttachment(att);
          const canDownload = !compact && canDownloadAttachment(att);
          const actions =
            canView || canDownload ? (
              <span className="flex items-center gap-1">
                {canView && (
                  <Tooltip
                    content={att.type === 'DRAWING' ? t('在 CAD 编辑器中打开') : t('查看')}
                  >
                    <Button
                      variant="icon"
                      size="xs"
                      icon={Eye}
                      aria-label={t('查看')}
                      onClick={() => void handleView(att)}
                    />
                  </Tooltip>
                )}
                {canDownload && (
                  <Tooltip content={t('下载')}>
                    <Button
                      variant="icon"
                      size="xs"
                      icon={Download}
                      aria-label={t('下载')}
                      onClick={() => void handleDownload(att)}
                    />
                  </Tooltip>
                )}
              </span>
            ) : null;
          return (
            <span key={att.id} title={label} className={cls}>
              {inner}
              {actions}
            </span>
          );
        })}
      </div>
      {previewModal}
    </>
  );
};

export default FeedbackAttachmentList;
