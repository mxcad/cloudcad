import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import X from 'lucide-react/dist/esm/icons/x';
import ZoomIn from 'lucide-react/dist/esm/icons/zoom-in';
import ZoomOut from 'lucide-react/dist/esm/icons/zoom-out';
import RotateCw from 'lucide-react/dist/esm/icons/rotate-cw';

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  alt?: string;
}

/**
 * 图片预览模态框
 * 支持缩放、旋转、全屏预览
 */
export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  isOpen,
  onClose,
  src,
  alt = '图片预览',
}) => {
  const [scale, setScale] = React.useState(1);
  const [rotation, setRotation] = React.useState(0);

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setRotation(0);
    }
  }, [isOpen]);

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.5, 3));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.5, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleReset = () => {
    setScale(1);
    setRotation(0);
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 背景遮罩 - 关闭模态框 */}
      <div
        className="absolute inset-0 bg-black/90 cursor-zoom-out"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />

      {/* 工具栏 */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleZoomIn();
          }}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          title="放大"
        >
          <ZoomIn size={20} className="text-white" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleZoomOut();
          }}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          title="缩小"
        >
          <ZoomOut size={20} className="text-white" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRotate();
          }}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          title="旋转"
        >
          <RotateCw size={20} className="text-white" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleReset();
          }}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          title="重置"
        >
          <span className="text-white text-sm font-medium">重置</span>
        </button>
      </div>

      {/* 关闭按钮 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors z-10"
      >
        <X size={24} className="text-white" />
      </button>

      {/* 图片容器 */}
      <div className="relative max-w-[90vw] max-h-[85vh]">
        <img
          src={src}
          alt={alt}
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            transition: 'transform 0.2s ease-out',
            maxWidth: '90vw',
            maxHeight: '80vh',
          }}
          className="object-contain cursor-zoom-in"
          onClick={(e) => {
            e.stopPropagation();
            handleZoomIn();
          }}
        />
      </div>

      {/* 提示信息 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
        点击图片放大，点击遮罩或按 ESC 关闭
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default ImagePreviewModal;
