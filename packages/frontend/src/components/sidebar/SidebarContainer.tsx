///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * SidebarContainer - 侧边栏核心容器组件
 *
 * 负责：
 * 1. 统一管理侧边栏状态和宽度
 * 2. Tab 切换逻辑
 * 3. 三种显示模式（手动控制、自动隐藏、可收起）
 * 4. 图纸打开方式处理
 * 5. 确认对话框
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { SidebarTab, DrawingOpenMode } from '../../types/sidebar';
import { useSidebarSettings } from '../../hooks/useSidebarSettings';
import { useDrawingModifyState } from '../../hooks/useDrawingModifyState';
import { mxcadManager } from '../../services/mxcadManager';
import { SidebarTabBar } from './SidebarTabBar';
import { SidebarTrigger } from './SidebarTrigger';
import { SidebarSettingsModal } from './SidebarSettingsModal';
import { ProjectDrawingsPanel } from '../ProjectDrawingsPanel';
import { CADEditorSidebar } from '../CADEditorSidebar';
import { CollaborateSidebar } from '../CollaborateSidebar';
import { FileSystemNode } from '../../types/filesystem';
import styles from './sidebar.module.css';

/** 自动隐藏模式的悬停延迟（毫秒） */
const AUTO_HIDE_DELAY = 300;

/** 确认对话框动作类型 */
type ConfirmAction = 'discard' | 'save' | 'cancel';

/** 待处理的图纸信息 */
interface PendingDrawing {
  node: FileSystemNode;
  openMode: DrawingOpenMode;
}

interface SidebarContainerProps {
  /** 项目 ID */
  projectId: string;
  /** 插入文件回调（图库使用） */
  onInsertFile?: (file: FileSystemNode) => void;
}

export const SidebarContainer: React.FC<SidebarContainerProps> = ({
  projectId,
  onInsertFile,
}) => {
  // ==================== Hooks ====================

  const {
    settings,
    updateSettings,
    resetSettings,
    setWidth,
    setIsVisible,
    setLastActiveTab,
  } = useSidebarSettings();

  const { isModified, resetModified } = useDrawingModifyState();

  // ==================== State ====================

  // 当前激活的 Tab
  const [activeTab, setActiveTab] = useState<SidebarTab>(
    settings.rememberState && settings.lastActiveTab
      ? settings.lastActiveTab
      : settings.defaultTab
  );

  // 设置弹窗
  const [showSettings, setShowSettings] = useState(false);

  // 宽度调整状态
  const [isResizing, setIsResizing] = useState(false);

  // 自动隐藏模式的悬停状态
  const [isHovering, setIsHovering] = useState(false);

  // 待处理的图纸（用于确认对话框）
  const [pendingDrawing, setPendingDrawing] = useState<PendingDrawing | null>(null);

  // 确认对话框
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // ==================== Refs ====================

  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ==================== 计算属性 ====================

  /** 是否可见 */
  const isVisible = useMemo(() => {
    switch (settings.displayMode) {
      case 'manual':
        return settings.isVisible;
      case 'auto-hide':
        return isHovering || settings.isVisible;
      case 'collapse':
        return settings.isVisible;
      default:
        return settings.isVisible;
    }
  }, [settings.displayMode, settings.isVisible, isHovering]);

  /** 是否显示触发条（收起状态） */
  const showTrigger = useMemo(() => {
    switch (settings.displayMode) {
      case 'manual':
        return !settings.isVisible;
      case 'auto-hide':
        return !isHovering && !settings.isVisible;
      case 'collapse':
        return !settings.isVisible;
      default:
        return !settings.isVisible;
    }
  }, [settings.displayMode, settings.isVisible, isHovering]);

  // ==================== Effects ====================

  // 宽度变化时更新 CAD 容器位置
  useEffect(() => {
    mxcadManager.adjustContainerPosition(isVisible ? settings.width : 0);
  }, [settings.width, isVisible]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
      }
    };
  }, []);

  // ==================== Tab 切换处理 ====================

  const handleTabChange = useCallback(
    (tab: SidebarTab) => {
      setActiveTab(tab);
      if (settings.rememberState) {
        setLastActiveTab(tab);
      }
    },
    [settings.rememberState, setLastActiveTab]
  );

  // ==================== 显示模式处理 ====================

  const handleShowSidebar = useCallback(() => {
    setIsVisible(true);
  }, [setIsVisible]);

  const handleHideSidebar = useCallback(() => {
    setIsVisible(false);
  }, [setIsVisible]);

  // 自动隐藏模式的悬停处理
  const handleMouseEnter = useCallback(() => {
    if (settings.displayMode !== 'auto-hide') return;

    // 清除离开定时器
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }

    // 设置悬停定时器
    if (!hoverTimeoutRef.current) {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsHovering(true);
        hoverTimeoutRef.current = null;
      }, AUTO_HIDE_DELAY);
    }
  }, [settings.displayMode]);

  const handleMouseLeave = useCallback(() => {
    if (settings.displayMode !== 'auto-hide') return;

    // 清除悬停定时器
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // 设置离开定时器
    if (!leaveTimeoutRef.current) {
      leaveTimeoutRef.current = setTimeout(() => {
        setIsHovering(false);
        leaveTimeoutRef.current = null;
      }, AUTO_HIDE_DELAY);
    }
  }, [settings.displayMode]);

  // 触发条点击处理
  const handleTriggerClick = useCallback(
    (tab: SidebarTab) => {
      setActiveTab(tab);
      setIsVisible(true);
    },
    [setIsVisible]
  );

  // ==================== 宽度调整处理 ====================

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      // 限制宽度范围
      const clampedWidth = Math.max(200, Math.min(600, newWidth));
      setWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [setWidth]);

  // ==================== 图纸打开处理 ====================

  const handleDrawingOpen = useCallback(
    (node: FileSystemNode, openMode: DrawingOpenMode) => {
      // 根据打开方式处理
      switch (openMode) {
        case 'direct':
          // 直接打开，不做任何检查
          openDrawingDirectly(node);
          break;
        case 'confirm':
          // 检查是否有修改
          if (isModified.current) {
            // 显示确认对话框
            setPendingDrawing({ node, openMode: 'confirm' });
            setShowConfirmDialog(true);
          } else {
            // 没有修改，直接打开
            openDrawingDirectly(node);
          }
          break;
        case 'new-tab':
          // 在新标签页打开
          openDrawingInNewTab(node);
          break;
        default:
          openDrawingDirectly(node);
      }
    },
    [isModified]
  );

  /** 直接打开图纸 */
  const openDrawingDirectly = useCallback((node: FileSystemNode) => {
    // TODO: 实现直接打开图纸逻辑
    // 这将由 CADEditorDirect 组件处理
    console.log('打开图纸:', node.name);
    resetModified();
  }, [resetModified]);

  /** 在新标签页打开图纸 */
  const openDrawingInNewTab = useCallback((node: FileSystemNode) => {
    // TODO: 实现新标签页打开逻辑
    console.log('在新标签页打开图纸:', node.name);
  }, []);

  // ==================== 确认对话框处理 ====================

  const handleConfirmAction = useCallback(
    (action: ConfirmAction) => {
      switch (action) {
        case 'discard':
          // 不保存，直接打开
          if (pendingDrawing) {
            openDrawingDirectly(pendingDrawing.node);
          }
          break;
        case 'save':
          // 保存后打开
          // TODO: 实现保存逻辑
          console.log('保存当前图纸');
          if (pendingDrawing) {
            openDrawingDirectly(pendingDrawing.node);
          }
          break;
        case 'cancel':
          // 取消，不做任何操作
          break;
      }

      setShowConfirmDialog(false);
      setPendingDrawing(null);
    },
    [pendingDrawing, openDrawingDirectly]
  );

  // ==================== 设置弹窗处理 ====================

  const handleSettingsClick = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleSettingsClose = useCallback(() => {
    setShowSettings(false);
  }, []);

  const handleSettingsUpdate = useCallback(
    (updates: Partial<typeof settings>) => {
      updateSettings(updates);
    },
    [updateSettings]
  );

  const handleSettingsReset = useCallback(() => {
    resetSettings();
  }, [resetSettings]);

  // ==================== 图库插入文件处理 ====================

  const handleGalleryInsertFile = useCallback(
    (file: Pick<{ nodeId: string; filename: string }, 'nodeId' | 'filename'>) => {
      if (onInsertFile) {
        // 转换为 FileSystemNode 格式
        const node: Partial<FileSystemNode> = {
          id: file.nodeId,
          name: file.filename,
        };
        onInsertFile(node as FileSystemNode);
      }
    },
    [onInsertFile]
  );

  // ==================== 渲染内容 ====================

  const renderContent = () => {
    switch (activeTab) {
      case 'project':
        return (
          <ProjectDrawingsPanel
            projectId={projectId}
            openMode={settings.openMode}
            onDrawingOpen={handleDrawingOpen}
            onDrawingModified={() => isModified.current}
          />
        );
      case 'gallery':
        return (
          <div className={styles.content}>
            <CADEditorSidebar onInsertFile={handleGalleryInsertFile} />
          </div>
        );
      case 'collaborate':
        return (
          <div className={styles.content}>
            <CollaborateSidebar />
          </div>
        );
      default:
        return null;
    }
  };

  // ==================== 渲染 ====================

  return (
    <>
      {/* 侧边栏容器 */}
      <div
        ref={containerRef}
        className={`${styles.sidebarContainer} ${!isVisible ? styles.collapsed : ''}`}
        style={{ width: isVisible ? settings.width : 0 }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Tab 栏 */}
        {isVisible && (
          <SidebarTabBar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onSettingsClick={handleSettingsClick}
            onCloseClick={handleHideSidebar}
          />
        )}

        {/* 内容区域 */}
        {isVisible && <div className={styles.content}>{renderContent()}</div>}

        {/* 宽度调整手柄 */}
        {isVisible && (
          <div
            className={`${styles.resizeHandle} ${isResizing ? styles.active : ''}`}
            onMouseDown={handleResizeMouseDown}
          />
        )}
      </div>

      {/* 触发条（收起状态显示） */}
      {showTrigger && (
        <SidebarTrigger
          activeTab={activeTab}
          onTabClick={handleTriggerClick}
          onSettingsClick={handleSettingsClick}
        />
      )}

      {/* 设置弹窗 */}
      {showSettings && (
        <SidebarSettingsModal
          settings={settings}
          onUpdateSettings={handleSettingsUpdate}
          onReset={handleSettingsReset}
          onClose={handleSettingsClose}
        />
      )}

      {/* 确认对话框 */}
      {showConfirmDialog && (
        <div className={styles.settingsOverlay}>
          <div className={styles.settingsModal}>
            <div className={styles.confirmDialog}>
              <AlertCircle size={48} className={styles.confirmIcon} />
              <p className={styles.confirmMessage}>
                当前图纸已修改，是否保存？
              </p>
              <div className={styles.confirmActions}>
                <button
                  className={styles.danger}
                  onClick={() => handleConfirmAction('discard')}
                >
                  不保存
                </button>
                <button
                  className={styles.secondary}
                  onClick={() => handleConfirmAction('cancel')}
                >
                  取消
                </button>
                <button
                  className={styles.primary}
                  onClick={() => handleConfirmAction('save')}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SidebarContainer;
