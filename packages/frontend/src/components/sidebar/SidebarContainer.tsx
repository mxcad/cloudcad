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
import { FolderOpen } from 'lucide-react';
import { FileText } from 'lucide-react';
import { Layers } from 'lucide-react';
import { LayoutTemplate } from 'lucide-react';
import { SidebarTab, DrawingsSubTab } from '../../types/sidebar';
import { useSidebarSettings } from '../../hooks/useSidebarSettings';
import {
  mxcadManager,
  isDocumentModified,
  checkAndConfirmUnsavedChanges,
} from '../../services/mxcadManager';
import { isTourModeActive } from '../../contexts/TourContext';
import { useFileSystemNavigation } from './hooks/useFileSystemNavigation';
import { SidebarTabBar } from './SidebarTabBar';
import { SidebarTrigger } from './SidebarTrigger';
import { ProjectDrawingsPanel } from '../ProjectDrawingsPanel';
import { CollaborateSidebar } from '../CollaborateSidebar';
import { Button, Tab } from '../ui';
import { FileSystemNode } from '../../types/filesystem';
import { useAuth } from '../../contexts/AuthContext';
import { LoginPrompt } from '../auth/LoginPrompt';
import styles from './sidebar.module.css';

/** 插入文件的参数类型 */
export interface InsertFileParams {
  nodeId: string;
  filename: string;
}

const SUB_TABS: { id: DrawingsSubTab; label: string; icon: React.ElementType }[] = [
  { id: 'drawings-gallery', label: '图纸库', icon: LayoutTemplate },
  { id: 'blocks-gallery', label: '图块库', icon: Layers },
  { id: 'my-project', label: '我的项目', icon: FolderOpen },
  { id: 'my-drawings', label: '我的图纸', icon: FileText },
];

interface SidebarContainerProps {
  /** 项目 ID */
  projectId: string;
  /** 插入文件回调（图库使用） */
  onInsertFile?: (file: InsertFileParams) => void | Promise<void>;
  /** 是否可见 - 用于 loading 期间隐藏但保持 DOM 布局稳定 */
  visible?: boolean;
  /** 是否处于加载状态 */
  loading?: boolean;
}

export const SidebarContainer: React.FC<SidebarContainerProps> = ({
  projectId,
  onInsertFile,
  loading: isLoading = false,
}) => {
  // ==================== Hooks ====================
  const { isAuthenticated } = useAuth();
  const { personalSpaceId, handleDrawingOpen: navigationOpen } = useFileSystemNavigation(isAuthenticated);

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
  const [activeDrawingsSubTab, setActiveDrawingsSubTab] =
    useState<DrawingsSubTab>(
      settings.rememberState && settings.lastDrawingsSubTab
        ? settings.lastDrawingsSubTab
        : settings.defaultDrawingsSubTab
    );

  // 宽度调整状态
  const [isResizing, setIsResizing] = useState(false);

  // 跟踪组件是否已完成首次挂载，用于禁止初始过渡动画
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // 通过 requestAnimationFrame 确保在首次绘制后标记为已挂载
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // 当前打开的文件 ID
  const [currentOpenFileId, setCurrentOpenFileId] = useState<string | null>(
    null
  );

  // 当前打开文件的父目录 ID
  const [currentOpenFileParentId, setCurrentOpenFileParentId] = useState<
    string | null
  >(null);

  // 文档修改状态
  const [isModified, setIsModified] = useState(false);

  // 登录提示状态
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [loginPromptAction, setLoginPromptAction] = useState<string>('');

  // 当前文件是否属于公开资源库
  const [isLibraryFile, setIsLibraryFile] = useState(false);

  // ==================== Refs ====================

  const containerRef = useRef<HTMLDivElement>(null);

  // ==================== Effects ====================

  // 引导模式下默认关闭侧边栏
  useEffect(() => {
    if (isTourModeActive()) {
      setIsVisible(false);
    }
  }, [setIsVisible]);

  // 监听当前打开的文件和修改状态
  useEffect(() => {
    const updateFileInfo = () => {
      const fileInfo = mxcadManager.getCurrentFileInfo();
      setCurrentOpenFileId(fileInfo?.fileId || null);
      setCurrentOpenFileParentId(fileInfo?.parentId || null);
      setIsModified(isDocumentModified());
      
      // 检查当前文件是否属于公开资源库
      const isLib = fileInfo?.libraryKey === 'drawing' || fileInfo?.libraryKey === 'block';
      setIsLibraryFile(isLib);
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
    mxcadManager.adjustContainerPosition(
      settings.isVisible ? settings.width : 48
    );
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

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const handleMouseMove = (e: MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const newWidth = e.clientX - rect.left;
        // 限制宽度范围
        const clampedWidth = Math.max(320, Math.min(600, newWidth));
        setWidth(clampedWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [setWidth]
  );

  // ==================== 图纸打开处理 ====================

  const handleDrawingOpen = useCallback(async (node: FileSystemNode, libraryType?: 'drawing' | 'block') => {
    // 先检查当前文档是否有未保存的修改
    const canProceed = await checkAndConfirmUnsavedChanges();
    if (!canProceed) {
      return;
    }

    await navigationOpen(node, libraryType);
  }, [navigationOpen]);

  // 处理登录提示的登录按钮
  const handleLoginClick = async () => {
    // 隐藏 CAD 编辑器，避免遮挡登录页面
    const { mxcadManager } = await import('../../services/mxcadManager');
    mxcadManager.showMxCAD(false);

    // 保存当前路径，登录后返回
    const navigate = (window as { __mxcadNavigate__?: (path: string) => void }).__mxcadNavigate__;
    if (navigate) {
      navigate('/login');
    } else {
      window.location.href = '/login';
    }
  };

  // 处理登录提示的关闭
  const handleLoginPromptClose = () => {
    setShowLoginPrompt(false);
  };

  // 检查登录状态，未登录时显示登录提示
  const checkLoginAndShowPrompt = (action: string) => {
    if (!isAuthenticated) {
      setLoginPromptAction(action);
      setShowLoginPrompt(true);
      return false;
    }
    return true;
  };

  // ==================== 渲染内容 ====================

  const renderContent = () => {
    switch (activeTab) {
      case 'drawings':
        return (
          <div className={styles.drawingsPanel}>
            {/* 子 Tab 切换 */}
            <div className={styles.subTabBar}>
              {SUB_TABS.map((tab) => (
                <Tab
                  key={tab.id}
                  active={activeDrawingsSubTab === tab.id}
                  tabVariant="primary"
                  icon={tab.icon}
                  onClick={() => handleDrawingsSubTabChange(tab.id)}
                  aria-label={tab.label}
                >
                  {tab.label}
                </Tab>
              ))}
            </div>
            {/* 子 Tab 内容 */}
            <div className={styles.subTabContent}>
              <div className={`${styles.subTabPanel} ${activeDrawingsSubTab === 'drawings-gallery' ? styles.active : ''}`}>
                <ProjectDrawingsPanel
                  key="drawings-gallery"
                  libraryType="drawing"
                  onDrawingOpen={handleDrawingOpen}
                  currentOpenFileId={currentOpenFileId}
                  isModified={isModified}
                  doubleClickToOpen={true}
                  visible={activeDrawingsSubTab === 'drawings-gallery'}
                />
              </div>
              <div className={`${styles.subTabPanel} ${activeDrawingsSubTab === 'blocks-gallery' ? styles.active : ''}`}>
                <ProjectDrawingsPanel
                  key="blocks-gallery"
                  libraryType="block"
                  onDrawingOpen={handleDrawingOpen}
                  currentOpenFileId={currentOpenFileId}
                  isModified={isModified}
                  visible={activeDrawingsSubTab === 'blocks-gallery'}
                />
              </div>
              <div className={`${styles.subTabPanel} ${activeDrawingsSubTab === 'my-project' ? styles.active : ''}`}>
                {isAuthenticated ? (
                  <ProjectDrawingsPanel
                    key="my-project"
                    projectId={isLibraryFile ? '' : projectId}
                    onDrawingOpen={handleDrawingOpen}
                    currentOpenFileId={currentOpenFileId}
                    isModified={isModified}
                    parentId={isLibraryFile ? null : currentOpenFileParentId}
                    personalSpaceId={personalSpaceId}
                    visible={activeDrawingsSubTab === 'my-project'}
                  />
                ) : (
                  <div className={styles.loginPromptContainer}>
                    <div className={styles.loginPromptContent}>
                      <div className={styles.loginPromptIcon}>
                        <FolderOpen size={40} />
                      </div>
                      <h3 className={styles.loginPromptTitle}>登录以访问我的项目</h3>
                      <p className={styles.loginPromptDescription}>
                        登录后可以查看和管理您的项目
                      </p>
                      <Button variant="primary" size="sm" onClick={handleLoginClick} className={styles.loginPromptButton}>
                        立即登录
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className={`${styles.subTabPanel} ${activeDrawingsSubTab === 'my-drawings' ? styles.active : ''}`}>
                {isAuthenticated ? (
                  <ProjectDrawingsPanel
                    key="my-drawings"
                    projectId={personalSpaceId || ''}
                    onDrawingOpen={handleDrawingOpen}
                    isPersonalSpace={true}
                    currentOpenFileId={currentOpenFileId}
                    isModified={isModified}
                    parentId={currentOpenFileParentId}
                    visible={activeDrawingsSubTab === 'my-drawings'}
                  />
                ) : (
                  <div className={styles.loginPromptContainer}>
                    <div className={styles.loginPromptContent}>
                      <div className={styles.loginPromptIcon}>
                        <FileText size={40} />
                      </div>
                      <h3 className={styles.loginPromptTitle}>登录以访问我的图纸</h3>
                      <p className={styles.loginPromptDescription}>
                        登录后可以查看和管理您的私人图纸
                      </p>
                      <Button variant="primary" size="sm" onClick={handleLoginClick} className={styles.loginPromptButton}>
                        立即登录
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      case 'collaborate':
        // 协同 tab 未登录时显示登录提示
        if (!isAuthenticated) {
          return (
            <div className={styles.loginPromptContainer}>
              <div className={styles.loginPromptContent}>
                <div className={styles.loginPromptIcon}>
                  <FolderOpen size={40} />
                </div>
                <h3 className={styles.loginPromptTitle}>登录以使用完整功能</h3>
                <p className={styles.loginPromptDescription}>
                  登录后可以使用我的图纸、我的项目、协同等功能
                </p>
                <Button variant="primary" size="sm" onClick={handleLoginClick} className={styles.loginPromptButton}>
                  立即登录
                </Button>
              </div>
            </div>
          );
        }
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
      style={{
        width: isVisible ? settings.width : 48,
        transition: isResizing || !mounted ? 'none' : undefined,
      }}
    >
      {isLoading ? (
        /* 加载骨架屏 */
        <div className={styles.skeletonContainer}>
          <div className={styles.skeletonTabBar}>
            <div className={styles.skeletonTab} />
            <div className={styles.skeletonTab} />
          </div>
          <div className={styles.skeletonList}>
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className={styles.skeletonItem}>
                <div className={styles.skeletonIcon} />
                <div className={styles.skeletonText}>
                  <div className={styles.skeletonLine} style={{width: '60%'}} />
                  <div className={styles.skeletonLine} style={{width: '35%'}} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : isVisible ? (
        <>
          {/* Tab 栏 */}
          <SidebarTabBar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onCloseClick={handleHideSidebar}
            isExpanded={isVisible}
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
          onExpandClick={() => setIsVisible(true)}
        />
      )}
    </div>
  );
};

export default SidebarContainer;
