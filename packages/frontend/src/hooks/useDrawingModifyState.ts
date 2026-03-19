import { useRef, useEffect, useCallback } from 'react';
import { mxcadManager } from '../services/mxcadManager';

/**
 * 图纸修改状态检测 Hook
 * 使用 MxCAD API 检测图纸是否有未保存的修改
 */
export function useDrawingModifyState() {
  const isModified = useRef(false);

  useEffect(() => {
    const mxcadView = mxcadManager.getCurrentView();
    if (!mxcadView?.mxcad) return;

    const handler = () => {
      isModified.current = true;
    };

    // 监听数据库修改事件
    mxcadView.mxcad.on('databaseModify', handler);

    // 组件卸载时清理事件监听，防止内存泄漏
    return () => {
      mxcadView.mxcad.off('databaseModify', handler);
    };
  }, []);

  // 重置修改状态（在保存或打开新图纸后调用）
  const resetModified = useCallback(() => {
    isModified.current = false;
  }, []);

  return {
    isModified,
    resetModified,
  };
}
