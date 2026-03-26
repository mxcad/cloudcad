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
 * 3. 图纸打开处理（包含修改状态检查）
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import Box from 'lucide-react/dist/esm/icons/box';
import LayoutGrid from 'lucide-react/dist/esm/icons/layout-grid';
import ExternalLink from 'lucide-react/dist/esm/icons/external-link';
import { SidebarTab, DrawingsSubTab } from '../../types/sidebar';
import { useSidebarSettings } from '../../hooks/useSidebarSettings';
import {
  mxcadManager,
  openUploadedFile,
  isDocumentModified,
  showUnsavedChangesDialog,
  resetDocumentModified,
  checkAndConfirmUnsavedChanges,
} from '../../services/mxcadManager';
import { isTourModeActive } from '../../contexts/TourContext';
import { filesApi } from '../../services/filesApi';
import { projectsApi } from '../../services/projectsApi';
import { SidebarTabBar } from './SidebarTabBar';
import { SidebarTrigger } from './SidebarTrigger';
import { ProjectDrawingsPanel } from '../ProjectDrawingsPanel';
import { CADEditorSidebar } from '../CADEditorSidebar';
import { CollaborateSidebar } from '../CollaborateSidebar';
import { Tooltip } from '../ui/Tooltip';
import { FileSystemNode } from '../../types/filesystem';
import styles from './sidebar.module.css';

/** 插入文件的参数类型 */
export interface InsertFileParams {
  nodeId: string;
  filename: string;
}

interface SidebarContainerProps {
  /** 项目 ID */
  projectId: string;
  /** 插入文件回调（图库使用） */
  onInsertFile?: (file: InsertFileParams) => void | Promise<void>;
}

export const SidebarContainer: React.FC<SidebarContainerProps> = ({
  projectId,
  onInsertFile,
}) => {
  // ==================== Hooks ====================

  const {
    settings,
    setWidth,
    setIsVisible,
    setLastActiveTab,
    setLastDrawingsSubTab,
  } = useSidebarSettings();

  // ==================== State ====================

  // 当前激活的 Tab
  const [activeTab, setActiveTab] = useState<SidebarTab>(
    settings.rememberState && settings.lastActiveTab
      ? settings.lastActiveTab
      : settings.defaultTab
  );

  // 当前激活的图纸子 Tab
  const [activeDrawingsSubTab, setActiveDrawingsSubTab] = useState<DrawingsSubTab>(
    settings.rememberState && settings.lastDrawingsSubTab
      ? settings.lastDrawingsSubTab
      : settings.defaultDrawingsSubTab
  );

  // 宽度调整状态
  const [isResizing, setIsResizing] = useState(false);

  // 私人空间 ID
  const [personalSpaceId, setPersonalSpaceId] = useState<string | null>(null);

  // 当前打开的文件 ID
  const [currentOpenFileId, setCurrentOpenFileId] = useState<string | null>(null);

  // 当前打开文件的父目录 ID
  const [currentOpenFileParentId, setCurrentOpenFileParentId] = useState<string | null>(null);

  // 文档修改状态
  const [isModified, setIsModified] = useState(false);

  // ==================== Refs ====================

  const containerRef = useRef<HTMLDivElement>(null);

  // ==================== Effects ====================

  // 引导模式下默认关闭侧边栏
  useEffect(() => {
    if (isTourModeActive()) {
      setIsVisible(false);
    }
  }, [setIsVisible]);

  // 获取私人空间 ID
  useEffect(() => {
    projectsApi.getPersonalSpace().then((res) => {
      if (res.data?.id) {
        setPersonalSpaceId(res.data.id);
      }
    }).catch(console.error);
  }, []);

  // 监听当前打开的文件和修改状态
  useEffect(() => {
    const updateFileInfo = () => {
      const fileInfo = mxcadManager.getCurrentFileInfo();
      setCurrentOpenFileId(fileInfo?.fileId || null);
      setCurrentOpenFileParentId(fileInfo?.parentId || null);
      setIsModified(isDocumentModified());
    };

    // 初始更新
    updateFileInfo();

    // 监听文件打开事件
    const handleFileOpened = () => {
      updateFileInfo();
    };

    // 监听文档修改事件
    const handleDatabaseModify = () => {
      setIsModified(true);
    };

    window.addEventListener('mxcad-file-opened', handleFileOpened);
    window.addEventListener('mxcad-database-modify', handleDatabaseModify);

    // 定期轮询修改状态（作为后备机制）
    const intervalId = setInterval(() => {
      setIsModified(isDocumentModified());
    }, 1000);

    return () => {
      window.removeEventListener('mxcad-file-opened', handleFileOpened);
      window.removeEventListener('mxcad-database-modify', handleDatabaseModify);
      clearInterval(intervalId);
    };
  }, []);

  // 宽度变化时更新 CAD 容器位置
  useEffect(() => {
    // 侧边栏关闭时保留 48px 窄条，CAD 编辑器需要让出这部分空间
    mxcadManager.adjustContainerPosition(settings.isVisible ? settings.width : 48);
  }, [settings.width, settings.isVisible]);

  // 监听 mxcad-open-sidebar 事件（Mx_ShowSidebar 和 Mx_ShowCollaborate 命令触发）
  useEffect(() => {
    const handleOpenSidebar = (event: CustomEvent<{ type: SidebarTab }>) => {
      const { type } = event.detail;
      // 切换到对应的 Tab 并显示侧边栏
      setActiveTab(type);
      setIsVisible(true);
      if (settings.rememberState) {
        setLastActiveTab(type);
      }
    };

    window.addEventListener(
      'mxcad-open-sidebar',
      handleOpenSidebar as EventListener
    );

    return () => {
      window.removeEventListener(
        'mxcad-open-sidebar',
        handleOpenSidebar as EventListener
      );
    };
  }, [settings.rememberState, setIsVisible, setLastActiveTab]);

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

  const handleDrawingsSubTabChange = useCallback(
    (subTab: DrawingsSubTab) => {
      setActiveDrawingsSubTab(subTab);
      if (settings.rememberState) {
        setLastDrawingsSubTab(subTab);
      }
    },
    [settings.rememberState, setLastDrawingsSubTab]
  );

  // ==================== 显示模式处理 ====================

  const handleHideSidebar = useCallback(() => {
    setIsVisible(false);
  }, [setIsVisible]);

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
      const clampedWidth = Math.max(300, Math.min(600, newWidth));
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

  const handleDrawingOpen = useCallback(async (node: FileSystemNode) => {
    try {
      // 先检查当前文档是否有未保存的修改
      const canProceed = await checkAndConfirmUnsavedChanges();
      if (!canProceed) {
        // 用户取消或保存失败，不继续打开新文件
        return;
      }

      // 获取文件信息
      const fileResponse = await filesApi.get(node.id);
      const file = fileResponse.data as {
        fileHash?: string;
        path?: string;
        parentId?: string | null;
        id?: string;
        isRoot?: boolean;
        name?: string;
      };

      if (!file.fileHash) {
        console.error('文件尚未转换完成');
        return;
      }

      // 获取项目根节点 ID
      let targetProjectId: string | null | undefined = file.parentId || null;
      if (!file.isRoot && file.parentId) {
        try {
          if (!file.id) throw new Error('节点ID缺失');
          const rootResponse = await filesApi.getRoot(file.id);
          if (rootResponse.data?.id) {
            targetProjectId = rootResponse.data.id;
          }
        } catch (error) {
          console.error('获取根节点失败:', error);
        }
      } else if (file.isRoot) {
        targetProjectId = file.id;
      }

      // 调用 openUploadedFile 打开文件
      await openUploadedFile(node.id, file.parentId || targetProjectId || '');
    } catch (error) {
      console.error('打开图纸失败:', error);
    }
  }, []);

  // ==================== 图库插入文件处理 ====================

  const handleGalleryInsertFile = useCallback(
    (file: Pick<{ nodeId: string; filename: string }, 'nodeId' | 'filename'>) => {
      if (onInsertFile) {
        onInsertFile({
          nodeId: file.nodeId,
          filename: file.filename,
        });
      }
    },
    [onInsertFile]
  );

  // ==================== 渲染内容 ====================

  const renderContent = () => {
    switch (activeTab) {
      case 'drawings':
        return (
          <div className={styles.drawingsPanel}>
            {/* 子 Tab 切换 */}
            <div className={styles.subTabBar}>
              <Tooltip content="我的项目" position="bottom" delay={100}>
                <button
                  className={`${styles.subTab} ${activeDrawingsSubTab === 'my-project' ? styles.active : ''}`}
                  onClick={() => handleDrawingsSubTabChange('my-project')}
                  aria-label="我的项目"
                >
                  <FolderOpen size={14} />
                  <span>我的项目</span>
                </button>
              </Tooltip>
              <Tooltip content="我的图纸" position="bottom" delay={100}>
                <button
                  className={`${styles.subTab} ${activeDrawingsSubTab === 'my-drawings' ? styles.active : ''}`}
                  onClick={() => handleDrawingsSubTabChange('my-drawings')}
                  aria-label="我的图纸"
                >
                  <FileText size={14} />
                  <span>我的图纸</span>
                </button>
              </Tooltip>
              <Tooltip content="图纸库" position="bottom" delay={100}>
                <button
                  className={`${styles.subTab} ${activeDrawingsSubTab === 'drawings-gallery' ? styles.active : ''}`}
                  onClick={() => handleDrawingsSubTabChange('drawings-gallery')}
                  aria-label="图纸库"
                >
                  <Box size={14} />
                  <span>图纸库</span>
                </button>
              </Tooltip>
              <Tooltip content="图块库" position="bottom" delay={100}>
                <button
                  className={`${styles.subTab} ${activeDrawingsSubTab === 'blocks-gallery' ? styles.active : ''}`}
                  onClick={() => handleDrawingsSubTabChange('blocks-gallery')}
                  data-tour="sidebar-blocks-btn"
                  aria-label="图块库"
                >
                  <LayoutGrid size={14} />
                  <span>图块库</span>
                </button>
              </Tooltip>
            </div>
            {/* 子 Tab 内容 */}
            <div className={styles.subTabContent}>
              {activeDrawingsSubTab === 'my-project' && (
                <ProjectDrawingsPanel
                  key="my-project"
                  projectId={projectId}
                  onDrawingOpen={handleDrawingOpen}
                  currentOpenFileId={currentOpenFileId}
                  isModified={isModified}
                  parentId={currentOpenFileParentId}
                  personalSpaceId={personalSpaceId}
                />
              )}
              {activeDrawingsSubTab === 'my-drawings' && (
                <ProjectDrawingsPanel
                  key="my-drawings"
                  projectId={personalSpaceId || ''}
                  onDrawingOpen={handleDrawingOpen}
                  isPersonalSpace={true}
                  currentOpenFileId={currentOpenFileId}
                  isModified={isModified}
                  parentId={currentOpenFileParentId}
                />
              )}
              {(activeDrawingsSubTab === 'drawings-gallery' || activeDrawingsSubTab === 'blocks-gallery') && (
                <div data-tour="gallery-panel">
                  <CADEditorSidebar
                    key="gallery"
                    defaultGalleryType={activeDrawingsSubTab === 'blocks-gallery' ? 'blocks' : 'drawings'}
                    onInsertFile={handleGalleryInsertFile}
                    showHeader={false}
                  />
                </div>
              )}
            </div>
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

  const isVisible = settings.isVisible;

  return (
    <div
      ref={containerRef}
      className={`${styles.sidebarContainer} ${!isVisible ? styles.collapsed : ''}`}
      style={{ width: isVisible ? settings.width : 48 }}
    >
      {isVisible ? (
        <>
          {/* Tab 栏 */}
          <SidebarTabBar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onCloseClick={handleHideSidebar}
          />

          {/* 内容区域 */}
          <div className={styles.content}>{renderContent()}</div>

          {/* 宽度调整手柄 */}
          <div
            className={`${styles.resizeHandle} ${isResizing ? styles.active : ''}`}
            onMouseDown={handleResizeMouseDown}
          />
        </>
      ) : (
        /* 收缩状态：显示触发条 */
        <SidebarTrigger
          activeTab={activeTab}
          activeDrawingsSubTab={activeDrawingsSubTab}
          onTabClick={(tab, subTab) => {
            if (subTab) {
              setActiveDrawingsSubTab(subTab);
            }
            handleTriggerClick(tab);
          }}
        />
      )}
    </div>
  );
};

export default SidebarContainer;
