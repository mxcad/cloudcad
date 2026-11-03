import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquareText } from 'lucide-react';
import { t } from '@/languages';
import { Z_LAYERS } from '@/constants/layers';
import { FeedbackSubmitModal } from './FeedbackSubmitModal';

/** 拖动位移小于该阈值视为「点击」，不进入拖动 */
const DRAG_THRESHOLD_PX = 5;
/** 视口边缘留白（px） */
const EDGE_MARGIN = 8;
/** 位置持久化键：记住用户拖到的位置 */
const POS_STORAGE_KEY = 'feedback-fab-position';

interface SavedPos {
  x: number;
  y: number;
}

function loadSavedPos(): SavedPos | null {
  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY);
    if (!raw) return null;
    const pos = JSON.parse(raw) as SavedPos;
    if (
      typeof pos.x !== 'number' ||
      typeof pos.y !== 'number' ||
      !Number.isFinite(pos.x) ||
      !Number.isFinite(pos.y)
    ) {
      return null;
    }
    return pos;
  } catch {
    return null;
  }
}

/**
 * 全局反馈悬浮按钮（PC 端）。
 *
 * - 单个「反馈」按钮，默认左下角；按钮本身可拖拽（按住拖动，松手即停），
 *   位移 < 阈值视为点击（打开提交弹窗）。无独立拖动图标。
 * - 拖拽位置持久化到 localStorage；经 createPortal(body) 渲染，position: fixed
 *   相对视口，不被 CAD 编辑器内 transform 祖先裁剪。
 * - 提交弹窗内「查询进度」入口打开独立的查询进度弹窗。
 */
export const FeedbackFab: React.FC = () => {
  const [open, setOpen] = useState(false);
  // 默认左下角；拖拽后改为视口绝对坐标
  const [pos, setPos] = useState<SavedPos | null>(null);
  const dragging = useRef(false);
  // 拖拽结束后的 pointerup 会落在按钮上再触发 onClick，需抑制「拖动后误开弹窗」
  const suppressClick = useRef(false);

  // 挂载时恢复持久化位置，并 clamp 到视口内（窗口尺寸变化后可能越界）
  useEffect(() => {
    const saved = loadSavedPos();
    if (saved) {
      setPos({
        x: Math.min(
          Math.max(EDGE_MARGIN, saved.x),
          Math.max(EDGE_MARGIN, window.innerWidth - 96 - EDGE_MARGIN)
        ),
        y: Math.min(
          Math.max(EDGE_MARGIN, saved.y),
          Math.max(EDGE_MARGIN, window.innerHeight - 36 - EDGE_MARGIN)
        ),
      });
    }
  }, []);

  const beginDrag = useCallback((e: React.PointerEvent) => {
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      if (!moved) {
        if (
          Math.abs(ev.clientX - startX) < DRAG_THRESHOLD_PX &&
          Math.abs(ev.clientY - startY) < DRAG_THRESHOLD_PX
        ) {
          return;
        }
        moved = true;
        dragging.current = true;
      }
      const x = Math.min(
        Math.max(EDGE_MARGIN, ev.clientX - offsetX),
        Math.max(EDGE_MARGIN, window.innerWidth - rect.width - EDGE_MARGIN)
      );
      const y = Math.min(
        Math.max(EDGE_MARGIN, ev.clientY - offsetY),
        Math.max(EDGE_MARGIN, window.innerHeight - rect.height - EDGE_MARGIN)
      );
      setPos({ x, y });
    };

    const endDrag = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      // 拖动结束才写 localStorage，避免高频写
      if (dragging.current) {
        dragging.current = false;
        suppressClick.current = true;
        setPos((p) => {
          if (p) {
            try {
              localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(p));
            } catch {
              /* localStorage 不可用（隐私模式），忽略 */
            }
          }
          return p;
        });
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }, []);

  const fabStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : { left: 20, bottom: 20 };

  return createPortal(
    <>
      <button
        type="button"
        onPointerDown={beginDrag}
        onClick={() => {
          // 刚拖完的 pointerup 再触发 onClick：不打开弹窗
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          setOpen(true);
        }}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium shadow-lg text-white select-none cursor-grab active:cursor-grabbing fixed"
        style={{
          backgroundColor: 'var(--primary-500)',
          zIndex: Z_LAYERS.CONVERSION_PANEL + 1000,
          touchAction: 'none',
          ...fabStyle,
        }}
        title={t('提交反馈')}
        aria-label={t('提交反馈')}
      >
        <MessageSquareText size={16} />
        {t('反馈')}
      </button>

      <FeedbackSubmitModal isOpen={open} onClose={() => setOpen(false)} />
    </>,
    document.body
  );
};
