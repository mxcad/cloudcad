import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CSS_CLASSES } from '../../services/mxcadManager/mxcadTypes';

interface DropIndicatorProps {
  visible: boolean;
  fileCount?: number;
}

/**
 * 拖拽提示层组件
 * 
 * 当用户拖拽文件到 mxcad-app 容器上方时显示，
 * 提示松开即可打开图纸。
 */
export const DropIndicator: React.FC<DropIndicatorProps> = ({ visible, fileCount = 1 }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const globalContainer = document.getElementById(CSS_CLASSES.GLOBAL_CONTAINER);
    if (!globalContainer || containerRef.current) return;

    // 创建 portal 容器并设置定位
    const portalDiv = document.createElement('div');
    portalDiv.className = 'drop-indicator-portal';
    portalDiv.style.position = 'relative';
    globalContainer.appendChild(portalDiv);
    
    containerRef.current = portalDiv;
    portalRef.current = portalDiv;

    // 清理函数：移除 portal 容器
    return () => {
      if (portalRef.current && portalRef.current.parentNode) {
        portalRef.current.parentNode.removeChild(portalRef.current);
        containerRef.current = null;
        portalRef.current = null;
      }
    };
  }, []);

  if (!visible || !containerRef.current) return null;

  return createPortal(
    <div className="drop-indicator">
      <div className="drop-indicator-content">
        <svg className="drop-indicator-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p className="drop-indicator-text">
          {fileCount > 1
            ? `松开即可上传 ${fileCount} 个文件`
            : '松开即可打开图纸'}
        </p>
      </div>
    </div>,
    containerRef.current
  );
};
