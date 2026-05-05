import React from 'react';

/**
 * CAD 编辑器加载状态显示组件
 * 从 CADEditorDirect.tsx 提取的纯 UI 组件
 */
export const CADLoadingOverlay: React.FC = () => (
  <div
    className="flex flex-col items-center justify-center h-full"
    style={{
      backgroundColor: 'var(--bg-primary)',
    }}
  >
    <div
      className="animate-spin rounded-full h-8 w-8"
      style={{
        border: `2px solid var(--border-strong)`,
        borderTopColor: 'var(--accent-600)',
      }}
    />
    <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>
      正在加载 CAD 编辑器...
    </p>
  </div>
);
