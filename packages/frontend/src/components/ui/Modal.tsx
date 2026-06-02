import { X } from 'lucide-react';
import React from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Card } from './Card';
import { Input } from '@/components/ui/Input';
import { isTourModeActive } from '../../contexts/TourContext';
import { Z_LAYERS } from '@/constants/layers';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** z-index 层级，默认 10000（Z_LAYERS.MODAL） */
  zIndex?: number;
  /** 额外的 CSS 类名，应用于模态框内容容器 */
  className?: string;
  /** 额外的 CSS 类名，应用于内容滚动区域 */
  contentClassName?: string;
  /** 隐藏头部标题栏 */
  hideHeader?: boolean;
  /** 跳过卡片容器，直接渲染 children（全屏模式），同时隐式启用 hideHeader */
  hideCard?: boolean;
  /** 遮罩层额外的 CSS 类名 */
  overlayClassName?: string;
  /** 点击遮罩层是否可关闭，默认 true */
  closeOnOverlayClick?: boolean;
}

const sizeToMaxWidth: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
};

/** 尺寸对应的最大高度 */
const sizeToMaxHeight: Record<string, string> = {
  sm: 'max-h-[60vh]',
  md: 'max-h-[70vh]',
  lg: 'max-h-[75vh]',
  xl: 'max-h-[80vh]',
  full: 'max-h-[85vh]',
};

/**
 * Modal 组件 - CloudCAD
 *
 * 设计特色：
 * - 支持主题变量适配深色/亮色主题
 * - 毛玻璃遮罩效果
 * - 流畅的进入/退出动画
 * - 响应式尺寸支持
 * - 头部拖拽移动（含视口边界约束）
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth,
  size,
  zIndex = Z_LAYERS.MODAL,
  className,
  contentClassName,
  hideHeader,
  hideCard,
  overlayClassName,
  closeOnOverlayClick = true,
}) => {
  const defaultMaxWidth = 'max-w-md';
  const hasCustomWidth =
    maxWidth || size || (className && /max-w-/.test(className));
  const effectiveMaxWidth = hasCustomWidth
    ? maxWidth || (size ? sizeToMaxWidth[size] : '')
    : defaultMaxWidth;
  const effectiveMaxHeight = size ? sizeToMaxHeight[size] : 'max-h-[70vh]';

  const cardRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStart = React.useRef({ x: 0, y: 0 });
  const dragOffset = React.useRef({ x: 0, y: 0 });
  const hasHeader = !hideHeader && !hideCard;

  React.useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  React.useEffect(() => {
    if (isOpen && cardRef.current) {
      cardRef.current.style.transform = '';
      dragOffset.current = { x: 0, y: 0 };
    }
  }, [isOpen]);

  const handleHeaderMouseDown = React.useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const el = cardRef.current;
    if (!el) return;

    const transform = el.style.transform;
    let currentX = 0;
    let currentY = 0;
    if (transform) {
      const m3d = transform.match(/translate3d\(([^,]+),\s*([^,]+),\s*([^)]+)\)/);
      if (m3d) {
        currentX = parseFloat(m3d[1] ?? '0');
        currentY = parseFloat(m3d[2] ?? '0');
      } else {
        const m2d = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (m2d) {
          currentX = parseFloat(m2d[1] ?? '0');
          currentY = parseFloat(m2d[2] ?? '0');
        }
      }
    }

    dragOffset.current = { x: currentX, y: currentY };
    dragStart.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
  }, []);

  const parseTransform = (el: HTMLElement) => {
    const t = el.style.transform;
    if (!t) return { dx: 0, dy: 0 };
    const m3d = t.match(/translate3d\(([^,]+),\s*([^,]+),\s*([^)]+)\)/);
    if (m3d) return { dx: parseFloat(m3d[1] ?? '0'), dy: parseFloat(m3d[2] ?? '0') };
    const m2d = t.match(/translate\(([^,]+),\s*([^)]+)\)/);
    if (m2d) return { dx: parseFloat(m2d[1] ?? '0'), dy: parseFloat(m2d[2] ?? '0') };
    return { dx: 0, dy: 0 };
  };

  React.useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const el = cardRef.current;
      if (!el) return;

      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;

      let newDx = dragOffset.current.x + dx;
      let newDy = dragOffset.current.y + dy;

      const { dx: curDx, dy: curDy } = parseTransform(el);
      const rect = el.getBoundingClientRect();
      const baseLeft = rect.left - curDx;
      const baseTop = rect.top - curDy;

      let newLeft = baseLeft + newDx;
      let newTop = baseTop + newDy;

      const viewW = window.innerWidth;
      const viewH = window.innerHeight;
      const w = rect.width;
      const h = rect.height;
      const minVisible = 40;

      if (w <= viewW) {
        newLeft = Math.max(0, Math.min(newLeft, viewW - w));
      } else {
        newLeft = Math.max(-(w - minVisible), Math.min(newLeft, viewW - minVisible));
      }
      if (h <= viewH) {
        newTop = Math.max(0, Math.min(newTop, viewH - h));
      } else {
        newTop = Math.max(-(h - minVisible), Math.min(newTop, viewH - minVisible));
      }

      newDx = newLeft - baseLeft;
      newDy = newTop - baseTop;

      el.style.transform = `translate3d(${Math.round(newDx)}px, ${Math.round(newDy)}px, 0)`;
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      const el = cardRef.current;
      if (el) {
        const { dx, dy } = parseTransform(el);
        dragOffset.current = { x: dx, y: dy };
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isOpen) return null;

  const renderOverlay = () => (
    <div
      className={`absolute inset-0 transition-opacity duration-300${overlayClassName ? ` ${overlayClassName}` : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!closeOnOverlayClick) return;
        if (isTourModeActive()) return;
        onClose();
      }}
    />
  );

  const renderCard = () => (
    <Card
      ref={cardRef}
      variant="elevated"
      className={`relative w-full ${effectiveMaxWidth} ${effectiveMaxHeight} overflow-hidden flex flex-col modal-content${className ? ` ${className}` : ''}`}
      style={{
        zIndex: zIndex + 1,
        background: 'var(--modal-bg)',
        ...(isDragging ? { userSelect: 'none' } : {}),
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {!hideHeader && (
        <Card.Header
          onMouseDown={handleHeaderMouseDown}
          style={{
            background: 'var(--modal-header-bg)',
            cursor: hasHeader ? 'grab' : undefined,
          }}
        >
          <Card.Title as="h3">{title}</Card.Title>
          <button
            data-tour="modal-close-btn"
            onClick={onClose}
            className="p-1 rounded-lg transition-all duration-200 hover:scale-110"
            style={{
              color: 'var(--text-muted)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-tertiary)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            <X size={18} />
          </button>
        </Card.Header>
      )}

      <Card.Body
        className={`overflow-y-auto flex-1${contentClassName ? ` ${contentClassName}` : ''}`}
      >
        {children}
      </Card.Body>

      {footer && (
        <Card.Footer padding="sm" style={{ background: 'var(--bg-tertiary)' }}>
          {footer}
        </Card.Footer>
      )}

      {isDragging && <style>{`body { user-select: none !important; }`}</style>}
    </Card>
  );

  const modalContent = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 modal-enter"
      style={{ zIndex: zIndex }}
      onClick={(e) => e.stopPropagation()}
    >
      {renderOverlay()}

      {hideCard ? children : renderCard()}

      <style>{`
        .modal-enter {
          animation: modalFadeIn 0.2s ease-out;
        }
        
        .modal-content {
          animation: modalScaleIn 0.25s ease-out;
        }
        
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes modalScaleIn {
          from { 
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to { 
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );

  return createPortal(modalContent, document.body);
};

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  label: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
  loading?: boolean;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  onClose,
  title,
  label,
  defaultValue = '',
  onSubmit,
  loading,
}) => {
  const [value, setValue] = React.useState(defaultValue);

  React.useEffect(() => {
    if (isOpen) setValue(defaultValue);
  }, [isOpen, defaultValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(value);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!(value || '').trim() || loading}
          >
            {loading ? '提交中...' : '确定'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <label
          className="block text-sm font-medium mb-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          {label}
        </label>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </form>
    </Modal>
  );
};

export default Modal;
