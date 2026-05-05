///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router-dom';
import { handleError } from '@/utils/errorHandler';

interface UseHomeInitializerOptions {
  isHomeMode: boolean;
  isActive: boolean;
  onLoadingChange: (loading: boolean) => void;
  onErrorChange: (error: string | null) => void;
  onInitComplete: () => void;
  onInitThemeSync: () => Promise<void>;
}

interface UseHomeInitializerReturn {
  isInitializedRef: React.MutableRefObject<boolean>;
}

/**
 * 主页模式初始化 hook —— 从 CADEditorDirect.tsx 提取
 *
 * 负责 / 路由下 CAD 编辑器的初始化：
 * - 加载空白编辑器（无需文件）
 * - 防止重复初始化
 * - 设置 MxCAD 配置和主题同步
 */
export function useHomeInitializer(
  options: UseHomeInitializerOptions,
): UseHomeInitializerReturn {
  const {
    isHomeMode,
    isActive,
    onLoadingChange,
    onErrorChange,
    onInitComplete,
    onInitThemeSync,
  } = options;

  const navigate = useNavigate();
  const isInitializedRef = useRef(false);

  const initKey = 'mxcad_home_init_started';

  const initHome = useCallback(async () => {
    // Check global guard
    if (typeof window !== 'undefined' && (window as unknown as Record<string, boolean>)[initKey]) {
      return;
    }
    (window as unknown as Record<string, boolean>)[initKey] = true;

    onLoadingChange(true);
    onErrorChange(null);

    try {
      const { mxcadManager } = await import('@/services/mxcadManager');

      if (mxcadManager.isCreated()) {
        mxcadManager.showMxCAD(true);
        isInitializedRef.current = true;
        onInitComplete();
        onLoadingChange(false);
        return;
      }

      // @ts-expect-error - mxcad-app has no type definitions
      await import('mxcad-app/style');

      const { setNavigateFunction } = await import('@/services/mxcadManager');
      setNavigateFunction(navigate);

      const { mxcadApp } = await import('mxcad-app');
      const configUrl = window.location.origin;
      mxcadApp.setStaticAssetPath('/mxcadAppAssets/');
      mxcadApp.initConfig({
        uiConfig: `${configUrl}/ini/myUiConfig.json`,
        sketchesUiConfig: `${configUrl}/ini/mySketchesAndNotesUiConfig.json`,
        serverConfig: `${configUrl}/ini/myServerConfig.json`,
        quickCommandConfig: `${configUrl}/ini/myQuickCommand.json`,
        themeConfig: `${configUrl}/ini/myVuetifyThemeConfig.json`,
      });

      await mxcadManager.initializeMxCADView();
      mxcadManager.showMxCAD(true);

      await onInitThemeSync();

      isInitializedRef.current = true;
      onInitComplete();
      onLoadingChange(false);
    } catch (error: unknown) {
      handleError(error, 'CADEditorDirect:initHome');
      (window as unknown as Record<string, boolean>)[initKey] = false;
      onErrorChange('CAD 编辑器初始化失败，请刷新页面重试');
      onLoadingChange(false);
    }
  }, [navigate, onLoadingChange, onErrorChange, onInitComplete, onInitThemeSync, initKey]);

  useEffect(() => {
    if (!isHomeMode || !isActive) return;

    const timer = setTimeout(() => {
      void initHome();
    }, 300);

    return () => clearTimeout(timer);
  }, [isHomeMode, isActive, initHome]);

  return { isInitializedRef };
}
