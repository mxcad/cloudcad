import { X } from 'lucide-react';
import React from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Card } from './Card';
import { Input } from '@/components/ui/Input';
import { isTourModeActive } from '../../contexts/TourContext';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** z-index 层级，默认 10002（高于 Toast 的 10001）。CAD 编辑器环境下可能需要更高值 */
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
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth,
  size,
  zIndex = 9999,
  className,
  contentClassName,
  hideHeader,
  hideCard,
  overlayClassName,
  closeOnOverlayClick = true,
}) => {
  const defaultMaxWidth = 'max-w-md';
  const hasCustomWidth =
    maxWidth ||
    size ||
    (className && /max-w-/.test(className));
  const effectiveMaxWidth = hasCustomWidth
    ? (maxWidth || (size ? sizeToMaxWidth[size] : ''))
    : defaultMaxWidth;
  const effectiveMaxHeight = size ? sizeToMaxHeight[size] : 'max-h-[70vh]';

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
      variant="elevated"
      className={`relative w-full ${effectiveMaxWidth} ${effectiveMaxHeight} overflow-hidden flex flex-col modal-content${className ? ` ${className}` : ''}`}
      style={{ zIndex: zIndex + 1 }}
      onClick={(e) => e.stopPropagation()}
    >
      {!hideHeader && (
        <Card.Header>
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

      <Card.Body className={`overflow-y-auto flex-1${contentClassName ? ` ${contentClassName}` : ''}`}>
        {children}
      </Card.Body>

      {footer && (
        <Card.Footer padding="sm" style={{ background: 'var(--bg-tertiary)' }}>{footer}</Card.Footer>
      )}
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
          <Button onClick={handleSubmit} disabled={!(value || '').trim() || loading}>
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
