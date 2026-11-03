import React, { useEffect, useMemo, useRef } from 'react';
import { t } from '@/languages';
import { sanitizeRichText } from './sanitizeRichText';
import { RICHTEXT_CSS } from './richtextStyles';
import { buildDrawingEditorUrl } from '@/components/feedback/feedbackDrawingUrl';
import type { FeedbackAttachmentDto } from '@/api-sdk';

/**
 * 富文本安全渲染（PC 端唯一出口）。
 *
 * 输入为受控编辑器产物 HTML（见 RichtextEditor），渲染前经白名单净化；
 * 之后按 `data-att-id` 从附件映射水合真实资源：
 *  - `<img data-att-id>`：回填缩略图/下载 URL；
 *  - `.fb-att-card` 附件卡片：图纸有缩略图 → 缩略图 + 悬浮查看/下载；否则回填下载链接。
 *
 * 任意页面可复用（反馈查询、反馈详情、公告详情等）。
 */

export interface RichContentViewProps {
  html: string;
  /** 附件 id → 附件投影（水合 URL 用） */
  attachmentsById?: Record<string, FeedbackAttachmentDto>;
  className?: string;
}

export const RichContentView: React.FC<RichContentViewProps> = ({
  html,
  attachmentsById,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sanitized = useMemo(() => sanitizeRichText(html), [html]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const map = attachmentsById ?? {};
    // 图片：回填 src（缩略图优先 → 查看 URL → 下载 URL）
    for (const img of Array.from(root.querySelectorAll<HTMLImageElement>('img[data-att-id]'))) {
      if (img.getAttribute('src')) continue;
      const att = map[img.getAttribute('data-att-id') as string];
      const url = att?.thumbnailUrl || att?.viewUrl || att?.downloadUrl;
      if (url) img.src = url;
    }
    // 附件卡片：
    //  - REFERENCE（引用图纸）：只读卡片，仅「查看」——打开 CAD 编辑器并定位到框选区域
    //    （分享图纸同款）；无源节点回落 viewUrl，仍无则提示「仅管理员可查看」不可点。
    //  - DRAWING 有缩略图：缩略图卡片（缩略图 + 文件名 + 悬浮查看/下载，下载仅管理员有 downloadUrl）。
    //  - 其余（无缩略图图纸/文档/图片）：回填「打开附件」（viewUrl 优先 → downloadUrl）。
    for (const card of Array.from(
      root.querySelectorAll<HTMLElement>('.fb-att-card[data-att-id]')
    )) {
      const att = map[card.getAttribute('data-att-id') as string];
      if (!att) continue;
      if (att.type === 'DRAWING' && att.kind === 'REFERENCE') {
        // 引用图纸：查看 → 打开 CAD 编辑器（nodeId/fileHash）并定位到框选区域
        const openUrl = buildDrawingEditorUrl(att) ?? att.viewUrl;
        if (openUrl && !card.querySelector('a')) {
          const link = document.createElement('a');
          link.href = openUrl;
          link.target = '_blank';
          link.rel = 'noreferrer';
          link.textContent = t('查看');
          link.className = 'fb-att-card-link';
          card.appendChild(link);
        } else if (!openUrl) {
          const hint = document.createElement('span');
          hint.textContent = t('仅管理员可查看');
          hint.className = 'fb-att-card-hint';
          card.appendChild(hint);
        }
        continue;
      }
      if (att.type === 'DRAWING' && att.thumbnailUrl && !card.querySelector('.fb-att-card-thumb')) {
        card.classList.add('fb-att-card-with-thumb');
        const wrap = document.createElement('span');
        wrap.className = 'fb-att-card-thumb-wrap';
        const img = document.createElement('img');
        img.src = att.thumbnailUrl;
        img.alt = att.fileName || '图纸';
        img.className = 'fb-att-card-thumb';
        img.loading = 'lazy';
        const actions = document.createElement('span');
        actions.className = 'fb-att-card-actions';
        const view = document.createElement('a');
        view.href = att.thumbnailUrl;
        view.target = '_blank';
        view.rel = 'noreferrer';
        view.textContent = t('查看');
        view.className = 'fb-att-card-action';
        actions.appendChild(view);
        if (att.downloadUrl) {
          const dl = document.createElement('a');
          dl.href = att.downloadUrl;
          dl.target = '_blank';
          dl.rel = 'noreferrer';
          dl.textContent = t('下载');
          dl.className = 'fb-att-card-action';
          actions.appendChild(dl);
        }
        wrap.appendChild(img);
        wrap.appendChild(actions);
        card.insertBefore(wrap, card.firstChild);
        continue;
      }
      // 无缩略图图纸：查看(viewUrl) + 下载(downloadUrl，仅管理员) 双链接
      if (att.type === 'DRAWING') {
        if (att.viewUrl && !card.querySelector('.fb-att-card-link[data-kind="view"]')) {
          const link = document.createElement('a');
          link.href = att.viewUrl;
          link.target = '_blank';
          link.rel = 'noreferrer';
          link.textContent = t('查看');
          link.className = 'fb-att-card-link';
          link.setAttribute('data-kind', 'view');
          card.appendChild(link);
        }
        if (att.downloadUrl && !card.querySelector('.fb-att-card-link[data-kind="download"]')) {
          const dl = document.createElement('a');
          dl.href = att.downloadUrl;
          dl.target = '_blank';
          dl.rel = 'noreferrer';
          dl.textContent = t('下载');
          dl.className = 'fb-att-card-link';
          dl.setAttribute('data-kind', 'download');
          card.appendChild(dl);
        }
        continue;
      }
      // 图片/文档：打开附件（viewUrl 优先 → downloadUrl）
      const openUrl = att.viewUrl || att.downloadUrl;
      if (openUrl && !card.querySelector('a')) {
        const link = document.createElement('a');
        link.href = openUrl;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = t('打开附件');
        link.className = 'fb-att-card-link';
        card.appendChild(link);
      }
    }
  }, [sanitized, attachmentsById]);

  return (
    <>
      <style>{RICHTEXT_CSS}</style>
      <div
        ref={containerRef}
        className={`rt-content ${className ?? ''}`}
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    </>
  );
};

export default RichContentView;
