import React from 'react';

interface CADErrorOverlayProps {
  error: string;
  isHomeMode: boolean;
  onGoBack: () => void;
}

/**
 * CAD 编辑器错误状态显示组件
 * 从 CADEditorDirect.tsx 提取的纯 UI 组件
 */
export const CADErrorOverlay: React.FC<CADErrorOverlayProps> = ({
  error,
  isHomeMode,
  onGoBack,
}) => (
  <div className="flex flex-col items-center justify-center h-full">
    <div className="text-red-500 text-lg mb-4">{error}</div>
    <button
      onClick={onGoBack}
      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
    >
      {isHomeMode ? '刷新页面' : '返回项目列表'}
    </button>
  </div>
);
