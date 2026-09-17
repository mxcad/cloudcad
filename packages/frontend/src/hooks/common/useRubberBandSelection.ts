import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Z_LAYERS } from '../../constants/layers';

interface RubberBandState {
  startVX: number;
  startVY: number;
  currentVX: number;
  currentVY: number;
  startScrollLeft: number;
  startScrollTop: number;
}

interface UseRubberBandSelectionOptions {
  onRubberBandSelect?: (nodeIds: string[]) => void;
}

/**
 * 橡皮框多选 Hook
 *
 * 在文件列表容器上启用鼠标拖拽框选功能。
 * 被选中的子元素需要包含 data-node-id 属性。
 */
export function useRubberBandSelection({
  onRubberBandSelect,
}: UseRubberBandSelectionOptions = {}) {
  const [rubberBand, setRubberBand] = useState<RubberBandState | null>(null);
  const rubberBandRef = useRef<RubberBandState | null>(null);
  const rubberBandJustEndedRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef<number | null>(null);
  const lastSelectTimeRef = useRef(0);
  const onRubberBandSelectRef = useRef(onRubberBandSelect);
  onRubberBandSelectRef.current = onRubberBandSelect;

  rubberBandRef.current = rubberBand;

  const setRubberBandJustEnded = useCallback(() => {
    rubberBandJustEndedRef.current = true;
    setTimeout(() => {
      rubberBandJustEndedRef.current = false;
    }, 0);
  }, []);

  const cancelAutoScroll = useCallback(() => {
    if (autoScrollRef.current !== null) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, []);

  const applyRubberBandSelection = useCallback(
    (
      startVX: number,
      startVY: number,
      currVX: number,
      currVY: number,
      startSL: number,
      startST: number
    ) => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const cr = container.getBoundingClientRect();
      const curSL = container.scrollLeft;
      const curST = container.scrollTop;

      const scx = startVX - cr.left + startSL;
      const scy = startVY - cr.top + startST;
      const ccx = currVX - cr.left + curSL;
      const ccy = currVY - cr.top + curST;

      const x1 = Math.min(scx, ccx);
      const y1 = Math.min(scy, ccy);
      const x2 = Math.max(scx, ccx);
      const y2 = Math.max(scy, ccy);

      if (Math.abs(x2 - x1) < 5 && Math.abs(y2 - y1) < 5) return;

      const items = container.querySelectorAll('[data-node-id]');
      const ids: string[] = [];
      items.forEach((item) => {
        const rect = item.getBoundingClientRect();
        const iL = rect.left - cr.left + curSL;
        const iR = rect.right - cr.left + curSL;
        const iT = rect.top - cr.top + curST;
        const iB = rect.bottom - cr.top + curST;
        if (iL < x2 && iR > x1 && iT < y2 && iB > y1) {
          const id = item.getAttribute('data-node-id');
          if (id) ids.push(id);
        }
      });
      onRubberBandSelectRef.current?.(ids);
    },
    []
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    rubberBandJustEndedRef.current = false;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-drag-handle]')) return;
    if (target.closest('[role="menu"], [data-menu-content]')) return;
    // 可交互控件让位：checkbox/输入框等需要正常获得焦点与点击，preventDefault 会破坏
    if (target.closest('input, textarea, select, [contenteditable="true"]'))
      return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    // 滚动条区域让位：preventDefault 会阻止滚动条拖动
    const cr = container.getBoundingClientRect();
    const hasVScroll = container.scrollHeight > container.clientHeight;
    const hasHScroll = container.scrollWidth > container.clientWidth;
    if (hasVScroll && e.clientX >= cr.left + container.clientWidth) return;
    if (hasHScroll && e.clientY >= cr.top + container.clientHeight) return;

    // 阻止浏览器默认行为（文本选择 / 原生元素/图片拖拽），
    // 统一根治「框选拖动其他元素」（ADR-0052 §3）
    e.preventDefault();

    // preventDefault 同时阻止了默认焦点转移：若此前焦点在输入框（搜索框/重命名等），
    // 点击列表后焦点会滞留 input，导致全局快捷键（Ctrl+Z/Y、Delete、F2 等）被
    // useSelectionShortcuts 的 isInputFocused() 让位拦截而全部失效。
    // 手动失焦恢复"点击列表离开输入框"的浏览器默认语义（不影响框选/拖拽，仅焦点变化）。
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active !== document.body &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.isContentEditable)
    ) {
      active.blur();
    }

    setRubberBand({
      startVX: e.clientX,
      startVY: e.clientY,
      currentVX: e.clientX,
      currentVY: e.clientY,
      startScrollLeft: container.scrollLeft,
      startScrollTop: container.scrollTop,
    });
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!rubberBandRef.current) return;

      const container = scrollContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseY = e.clientY;
      const EDGE = 40;
      const MAX_SPEED = 12;

      let direction = 0;
      let speed = 0;

      if (mouseY >= rect.top && mouseY < rect.top + EDGE) {
        direction = -1;
        speed = 1 + ((EDGE - (mouseY - rect.top)) / EDGE) * (MAX_SPEED - 1);
      } else if (mouseY > rect.bottom - EDGE && mouseY <= rect.bottom) {
        direction = 1;
        speed = 1 + ((EDGE - (rect.bottom - mouseY)) / EDGE) * (MAX_SPEED - 1);
      }

      cancelAutoScroll();

      if (direction !== 0) {
        const scroll = () => {
          if (!container) return;
          container.scrollTop += direction * Math.round(speed);
          autoScrollRef.current = requestAnimationFrame(scroll);
        };
        autoScrollRef.current = requestAnimationFrame(scroll);
      }

      setRubberBand((prev) =>
        prev
          ? {
              ...prev,
              currentVX: e.clientX,
              currentVY: e.clientY,
            }
          : null
      );

      const now = Date.now();
      if (now - lastSelectTimeRef.current > 40) {
        lastSelectTimeRef.current = now;
        const rb = rubberBandRef.current;
        if (rb) {
          applyRubberBandSelection(
            rb.startVX,
            rb.startVY,
            e.clientX,
            e.clientY,
            rb.startScrollLeft,
            rb.startScrollTop
          );
        }
      }
    },
    [cancelAutoScroll, applyRubberBandSelection]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      cancelAutoScroll();
      const rb = rubberBandRef.current;
      if (rb) {
        applyRubberBandSelection(
          rb.startVX,
          rb.startVY,
          rb.currentVX,
          rb.currentVY,
          rb.startScrollLeft,
          rb.startScrollTop
        );
        const dx = Math.abs(rb.currentVX - rb.startVX);
        const dy = Math.abs(rb.currentVY - rb.startVY);
        if (dx >= 5 || dy >= 5) {
          setRubberBandJustEnded();
        }
      }
      setRubberBand(null);
    },
    [cancelAutoScroll, applyRubberBandSelection, setRubberBandJustEnded]
  );

  const handleMouseLeave = useCallback(() => {
    cancelAutoScroll();
  }, [cancelAutoScroll]);

  useEffect(() => {
    if (!rubberBand) return;
    const onWindowMouseUp = () => {
      cancelAutoScroll();
      const rb = rubberBandRef.current;
      if (rb) {
        applyRubberBandSelection(
          rb.startVX,
          rb.startVY,
          rb.currentVX,
          rb.currentVY,
          rb.startScrollLeft,
          rb.startScrollTop
        );
        const dx = Math.abs(rb.currentVX - rb.startVX);
        const dy = Math.abs(rb.currentVY - rb.startVY);
        if (dx >= 5 || dy >= 5) {
          setRubberBandJustEnded();
        }
      }
      setRubberBand(null);
    };
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      window.removeEventListener('mouseup', onWindowMouseUp);
      cancelAutoScroll();
    };
  }, [
    rubberBand,
    cancelAutoScroll,
    applyRubberBandSelection,
    setRubberBandJustEnded,
  ]);

  const rubberBandOverlay = rubberBand
    ? (() => {
        const c = scrollContainerRef.current;
        if (!c) return null;
        const cr = c.getBoundingClientRect();
        const scx = rubberBand.startVX - cr.left + rubberBand.startScrollLeft;
        const scy = rubberBand.startVY - cr.top + rubberBand.startScrollTop;
        const ccx = rubberBand.currentVX - cr.left + c.scrollLeft;
        const ccy = rubberBand.currentVY - cr.top + c.scrollTop;
        const left = Math.min(scx, ccx);
        const top = Math.min(scy, ccy);
        const width = Math.abs(ccx - scx);
        const height = Math.abs(ccy - scy);
        return React.createElement('div', {
          className: 'rubber-band-overlay',
          style: {
            position: 'absolute',
            left,
            top,
            width,
            height,
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.5)',
            pointerEvents: 'none',
            zIndex: Z_LAYERS.OVERLAY,
            borderRadius: '4px',
          },
        });
      })()
    : null;

  return {
    scrollContainerRef,
    rubberBand,
    rubberBandRef,
    rubberBandJustEndedRef,
    isRubberBanding: rubberBand !== null,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    rubberBandOverlay,
  };
}
