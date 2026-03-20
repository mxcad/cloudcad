import X from 'lucide-react/dist/esm/icons/x';
import React from 'react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** z-index 层级，默认 50。CAD 编辑器环境下需要设置为更高值（如 10000） */
  zIndex?: number;
}

const sizeToMaxWidth: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
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
  zIndex = 50,
}) => {
  const effectiveMaxWidth =
    maxWidth || (size ? sizeToMaxWidth[size] : 'max-w-md');

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 modal-enter"
      style={{ zIndex }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 遮罩层 - 使用主题变量 */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ 
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(4px)',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      
      {/* 模态框内容 */}
      <div
        className={`relative w-full ${effectiveMaxWidth} overflow-hidden modal-content`}
        style={{ 
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div 
          className="flex items-center justify-between px-6 py-4"
          style={{ 
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <h3 
            className="text-lg font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all duration-200 hover:scale-110"
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
            <X size={20} />
          </button>
        </div>
        
        {/* 内容区域 */}
        <div 
          className="p-6"
          style={{ color: 'var(--text-secondary)' }}
        >
          {children}
        </div>
        
        {/* 底部 */}
        {footer && (
          <div 
            className="px-6 py-4 flex justify-end gap-3"
            style={{ 
              background: 'var(--bg-tertiary)',
              borderTop: '1px solid var(--border-default)',
            }}
          >
            {footer}
          </div>
        )}
      </div>

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
          <Button onClick={handleSubmit} disabled={!value.trim() || loading}>
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
        <input
          autoFocus
          type="text"
          className="w-full px-4 py-2.5 rounded-xl transition-all duration-200 outline-none"
          style={{ 
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--primary-500)';
            e.target.style.boxShadow = '0 0 0 3px var(--primary-100)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'var(--border-default)';
            e.target.style.boxShadow = 'none';
          }}
        />
      </form>
    </Modal>
  );
};

export default Modal;