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
import { useNavigate } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import { FileText } from 'lucide-react';
import { Layers } from 'lucide-react';
import { LayoutTemplate } from 'lucide-react';
import { SidebarTab, DrawingsSubTab } from '../../types/sidebar';
import { useSidebarSettings } from '../../hooks/useSidebarSettings';
import { isTourModeActive } from '../../utils/tourMode';
import { useDrawingOpener } from './hooks/useDrawingOpener';
import { useAutoSelectSubTab } from './hooks/useAutoSelectSubTab';
import { SidebarTabBar } from './SidebarTabBar';
import { SidebarTrigger } from './SidebarTrigger';
import { ProjectDrawingsPanel } from '../ProjectDrawingsPanel';
import { CollaborateSidebar } from '../CollaborateSidebar';
import { Button, Tab } from '../ui';
import { FileSystemNode } from '../../types/filesystem';
import { useAuth } from '../../contexts/AuthContext';
import { useRuntimeConfig } from '../../contexts/RuntimeConfigContext';
import { useDrawingSession } from '../../services/drawingSession';
import { isCollaborationAllowed } from '../../constants/appConfig';
import styles from './sidebar.module.css';
import { t } from '@/languages';

/** 插入文件的参数类型 */
export interface InsertFileParams {
  nodeId: string;
  filename: string;
}

function getSubTabs(): {
  id: DrawingsSubTab;
  label: string;
  icon: React.ElementType;
}[] {
  return [
    { id: 'drawings-gallery', label: t('图纸库'), icon: LayoutTemplate },
    { id: 'blocks-gallery', label: t('图块库'), icon: Layers },
    { id: 'my-project', label: t('我的项目'), icon: FolderOpen },
    { id: 'my-drawings', label: t('个人空间'), icon: FileText },
  ];
}

interface SidebarContainerProps {
  /** 项目 ID */
  projectId: string;
  /** 插入文件回调（图库使用） */
  onInsertFile?: (file: InsertFileParams) => void | Promise<void>;
  /** 是否可见 - 用于 loading 期间隐藏但保持 DOM 布局稳定 */
  visible?: boolean;
  /** 是否处于加载状态（骨架屏已移除，保留字段兼容既有调用方；协同场景经 onCollabFileLoaded 控制节奏） */
  loading?: boolean;
  /** 协同文件加载完成回调（协同链接进入时用于延迟关闭加载态） */
  onCollabFileLoaded?: () => void;
  /** 内容就绪门控：false 时数据面板不挂载，显示一行轻提示（引擎就绪 + 图纸打开终态前） */
  contentReady?: boolean;
}

export const SidebarContainer: React.FC<SidebarContainerProps> = ({
  projectId,
  onInsertFile,
  onCollabFileLoaded,
  contentReady = true,
}) => {
  // ==================== Hooks ====================
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { personalSpaceId, handleDrawingOpen: navigationOpen } =
    useDrawingOpener(isAuthenticated);

  const { config: runtimeConfig } = useRuntimeConfig();

  const {
    settings,
    setWidth,
    setIsVisible,
    setLastActiveTab,
    setLastDrawingsSubTab,
  } = useSidebarSettings();

  // ==================== State ====================

  // 当前激活的 Tab
  const [activeTab, setActiveTab] = useState<SidebarTab>(() => {
    // 协同分享链接（URL 带合法 collabWorkId，与 useCollabShare 同一校验口径）：
    // 初始直接落协同 tab，使 auto-join（useCollabActions 依赖 visible）立即触发，
    // 同时避免默认图纸 tab 在协同场景下发无用请求。URL 参数优先级高于 localStorage 记忆。
    const collabWorkId = new URLSearchParams(window.location.search).get(
      'collabWorkId'
    );
    const collabId = collabWorkId ? parseInt(collabWorkId, 10) : NaN;
    if (!isNaN(collabId) && collabId > 0) {
      return 'collaborate';
    }
    return settings.rememberState && settings.lastActiveTab
      ? settings.lastActiveTab
      : settings.defaultTab;
  });

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

  // 当前打开的图纸与会话脏标记（Drawing Session 单一来源，ADR-0039）
  const {
    fileId: currentOpenFileId,
    fileInfo,
    isModified,
  } = useDrawingSession();
  const currentOpenFileParentId = fileInfo?.parentId ?? null;
  const currentOpenProjectId = fileInfo?.projectId ?? null;
  const isLibraryFile =
    fileInfo?.libraryKey === 'drawing' || fileInfo?.libraryKey === 'block';

  // 登录提示状态
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [loginPromptAction, setLoginPromptAction] = useState<string>('');

  // ==================== Refs ====================

  const containerRef = useRef<HTMLDivElement>(null);

  // 自动选择子tab（首次打开CAD编辑器时根据图纸来源选择）
  useAutoSelectSubTab({
    fileInfo,
    activeDrawingsSubTab,
    setActiveDrawingsSubTab,
    setLastDrawingsSubTab,
    rememberState: settings.rememberState,
  });

  // ==================== Effects ====================

  // 引导模式下默认关闭侧边栏
  useEffect(() => {
    if (isTourModeActive()) {
      setIsVisible(false);
    }
  }, [setIsVisible]);

  // 宽度变化时更新 CAD 容器位置（mxcadManager 动态导入）
  useEffect(() => {
    import('../../services/mxcadManager').then(({ mxcadManager }) => {
      mxcadManager.adjustContainerPosition(
        settings.isVisible ? settings.width : 48
      );
    });
  }, [settings.width, settings.isVisible]);

  // 协同功能关闭时，修正初始 activeTab 避免停留在协同 tab
  useEffect(() => {
    if (!runtimeConfig.collaborationEnabled && activeTab === 'collaborate') {
      setActiveTab('drawings');
      if (settings.rememberState) {
        setLastActiveTab('drawings');
      }
    }
  }, [runtimeConfig.collaborationEnabled]);

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
        const clampedWidth = Math.max(340, Math.min(600, newWidth));
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

  const handleDrawingOpen = useCallback(
    async (node: FileSystemNode, libraryType?: 'drawing' | 'block') => {
      // 先检查当前文档是否有未保存的修改（mxcadManager 动态导入）
      const { checkAndConfirmUnsavedChanges } =
        await import('../../services/mxcadManager');
      const canProceed = await checkAndConfirmUnsavedChanges();
      if (!canProceed) {
        return;
      }

      await navigationOpen(node, libraryType);
    },
    [navigationOpen]
  );

  // 处理登录提示的登录按钮 — 跳转到登录页面
  const handleLoginClick = useCallback(async () => {
    // 隐藏 CAD 编辑器，避免遮挡登录页面
    const { mxcadManager } = await import('../../services/mxcadManager');
    mxcadManager.showMxCAD(false);

    // 保存当前路径，登录后返回
    const currentUrl = window.location.pathname + window.location.search;
    navigate(`/login?redirect=${encodeURIComponent(currentUrl)}`, {
      replace: true,
    });

    setShowLoginPrompt(false);
  }, [navigate]);

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
    return (
      <>
        {/* 图纸 tab — 始终挂载，不活跃时 CSS 隐藏，避免组件卸载/重挂载导致数据丢失 */}
        <div
          className={styles.drawingsPanel}
          style={{ display: activeTab === 'drawings' ? '' : 'none' }}
        >
          {/* 子 Tab 切换 */}
          <div
            className={`${styles.subTabBar} ${settings.width < 380 ? styles.compact : ''}`}
          >
            {getSubTabs().map((tab) => (
              <Tab
                key={tab.id}
                active={activeDrawingsSubTab === tab.id}
                tabVariant="primary"
                icon={tab.icon}
                onClick={() => handleDrawingsSubTabChange(tab.id)}
                aria-label={tab.label}
                tooltip={settings.width < 380 ? tab.label : undefined}
                tooltipPosition="bottom"
                tooltipDelay={200}
              >
                {settings.width < 380 ? undefined : tab.label}
              </Tab>
            ))}
          </div>
          {/* 子 Tab 内容：引擎就绪 + 图纸打开终态前不挂载数据面板，避免与图纸下载抢带宽/主线程 */}
          <div className={styles.subTabContent}>
            {contentReady ? (
              <>
                <div
                  className={`${styles.subTabPanel} ${activeDrawingsSubTab === 'drawings-gallery' ? styles.active : ''}`}
                >
                  <ProjectDrawingsPanel
                    key="drawings-gallery"
                    libraryType="drawing"
                    onDrawingOpen={handleDrawingOpen}
                    currentOpenFileId={currentOpenFileId}
                    isModified={isModified}
                    visible={activeDrawingsSubTab === 'drawings-gallery'}
                  />
                </div>
                <div
                  className={`${styles.subTabPanel} ${activeDrawingsSubTab === 'blocks-gallery' ? styles.active : ''}`}
                >
                  <ProjectDrawingsPanel
                    key="blocks-gallery"
                    libraryType="block"
                    onDrawingOpen={handleDrawingOpen}
                    currentOpenFileId={currentOpenFileId}
                    isModified={isModified}
                    doubleClickToOpen={true}
                    visible={activeDrawingsSubTab === 'blocks-gallery'}
                  />
                </div>
                <div
                  className={`${styles.subTabPanel} ${activeDrawingsSubTab === 'my-project' ? styles.active : ''}`}
                >
                  {isAuthenticated ? (
                    <ProjectDrawingsPanel
                      key="my-project"
                      projectId={isLibraryFile ? '' : projectId}
                      onDrawingOpen={handleDrawingOpen}
                      currentOpenFileId={currentOpenFileId}
                      currentOpenProjectId={currentOpenProjectId}
                      isModified={isModified}
                      parentId={isLibraryFile ? null : currentOpenFileParentId}
                      personalSpaceId={personalSpaceId}
                      visible={activeDrawingsSubTab === 'my-project'}
                      tabId="my-project"
                    />
                  ) : (
                    <div className={styles.loginPromptContainer}>
                      <div className={styles.loginPromptContent}>
                        <div className={styles.loginPromptIcon}>
                          <FolderOpen size={40} />
                        </div>
                        <h3 className={styles.loginPromptTitle}>
                          {t('登录以访问我的项目')}
                        </h3>
                        <p className={styles.loginPromptDescription}>
                          {t('登录后可以查看和管理您的项目')}
                        </p>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleLoginClick}
                          className={styles.loginPromptButton}
                        >
                          {t('立即登录')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <div
                  className={`${styles.subTabPanel} ${activeDrawingsSubTab === 'my-drawings' ? styles.active : ''}`}
                >
                  {isAuthenticated ? (
                    <ProjectDrawingsPanel
                      key="my-drawings"
                      projectId={personalSpaceId || ''}
                      onDrawingOpen={handleDrawingOpen}
                      isPersonalSpace={true}
                      currentOpenFileId={currentOpenFileId}
                      isModified={isModified}
                      parentId={currentOpenFileParentId}
                      personalSpaceId={personalSpaceId}
                      visible={activeDrawingsSubTab === 'my-drawings'}
                      tabId="my-drawings"
                    />
                  ) : (
                    <div className={styles.loginPromptContainer}>
                      <div className={styles.loginPromptContent}>
                        <div className={styles.loginPromptIcon}>
                          <FileText size={40} />
                        </div>
                        <h3 className={styles.loginPromptTitle}>
                          {t('登录以访问个人空间')}
                        </h3>
                        <p className={styles.loginPromptDescription}>
                          {t('登录后可以查看和管理您的私人图纸')}
                        </p>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleLoginClick}
                          className={styles.loginPromptButton}
                        >
                          {t('立即登录')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className={styles.contentReadyHint}>
                <div className={styles.contentReadyHintInner}>
                  <span
                    className={`${styles.contentReadySpinner} animate-spin`}
                  />
                  <span className={styles.contentReadyHintText}>
                    {t('正在加载图纸...')}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 协同 tab — 始终挂载，不活跃时 CSS 隐藏 */}
        <div style={{ display: activeTab === 'collaborate' ? '' : 'none' }}>
          {runtimeConfig.collaborationEnabled &&
          isCollaborationAllowed(runtimeConfig.collaborationDomains) ? (
            <>
              <div className={styles.content}>
                <CollaborateSidebar
                  visible={activeTab === 'collaborate'}
                  onFileLoaded={onCollabFileLoaded}
                />
              </div>
              {!isAuthenticated && (
                <div className={styles.loginPromptOverlay}>
                  <div className={styles.loginPromptContainer}>
                    <div className={styles.loginPromptContent}>
                      <div className={styles.loginPromptIcon}>
                        <FolderOpen size={40} />
                      </div>
                      <h3 className={styles.loginPromptTitle}>
                        {t('登录以使用完整功能')}
                      </h3>
                      <p className={styles.loginPromptDescription}>
                        {t('登录后可以使用个人空间、我的项目、协同等功能')}
                      </p>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleLoginClick}
                        className={styles.loginPromptButton}
                      >
                        {t('立即登录')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className={styles.content}>
              <div className={styles.loginPromptContainer}>
                <div className={styles.loginPromptContent}>
                  <div className={styles.loginPromptIcon}>
                    <FolderOpen size={40} />
                  </div>
                  <h3 className={styles.loginPromptTitle}>{t('实时协同')}</h3>
                  <p className={styles.loginPromptDescription}>
                    <span>{t('实时协同只支持私有化部署，请点击')}</span>
                    <a
                      href="https://help.mxdraw.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: 'var(--primary)',
                        textDecoration: 'underline',
                        margin: '0 2px',
                      }}
                    >
                      {t('查看文档')}
                    </a>
                    <span>{t('或者联系客服')}</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    );
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
      {isVisible ? (
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
