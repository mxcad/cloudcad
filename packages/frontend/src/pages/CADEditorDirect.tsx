/**
 * GlobalCADEditor - 全局 CAD 编辑器覆盖层
 *
 * 此组件作为全局覆盖层挂载在 App 根层级，始终存在于 DOM 中。
 * 通过监听路由变化来控制显示/隐藏：
 * - 路由匹配 / 时显示空白编辑器（无需登录）
 * - 路由匹配 /cad-editor/:fileId 时显示编辑器并加载文件
 * - 路由不匹配时隐藏编辑器
 *
 * 使用 visibility: hidden + z-index 方案控制显示，保护 WebGL 上下文不被销毁。
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification, useConfirmDialog } from '../contexts/NotificationContext';
import { Z_LAYERS } from '@/constants/layers';
import { ProjectPermission, SystemPermission } from '../constants/permissions';
import { usePermission } from '../hooks/usePermission';
import { fileSystemControllerGetNode, fileSystemControllerGetRootNode, fileSystemControllerDownloadNodeWithFormat, fileSystemControllerCheckProjectPermission, libraryControllerGetDrawingNode, libraryControllerGetBlockNode, publicFileControllerConvertAndDownload } from '@/api-sdk';
import { usePersonalSpaceQuery } from '@/hooks/usePersonalSpaceQuery';
import { DownloadFormatModal } from '../components/modals/DownloadFormatModal';
import { PdfExportModal } from '../components/modals/PdfExportModal';
import { DwgExportModal } from '../components/modals/DwgExportModal';
import { SaveAsModal } from '../components/modals/SaveAsModal';
import { Button } from '@/components/ui/Button';
import { ExternalReferenceModal } from '../components/modals/ExternalReferenceModal';
import { SidebarContainer } from '../components/sidebar/SidebarContainer';
import { LoginPrompt } from '../components/auth/LoginPrompt';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { generateThumbnail, uploadThumbnail } from '../services/mxcadManager/mxcadThumbnail';
import { hideGlobalLoading } from '../utils/loadingUtils';
import { useCADEditorStore } from '../stores/useCADEditorStore';
import { useFileDropToOpen } from '../hooks/useFileDropToOpen';
import { DropIndicator } from '../components/drop-indicator/DropIndicator';
import { uploadFile } from '../utils/mxcadUploadUtils';
import { calculateFileHash } from '../utils/hashUtils';
import { saveAsFileDialog } from 'mxcad';

import type { DownloadFormat } from '../components/modals/DownloadFormatModal';
import type { PdfOptions } from '../components/modals/PdfExportModal';
import type { DwgOptions } from '../components/modals/DwgExportModal';

declare global {
  interface Window {
    mxcadAppContext?: {
      userId: string;
      projectId: string;
      parentId?: string;
      userRole: string;
    };
    MxCAD?: any
  }
  // eslint-disable-next-line no-var
  var MxPluginContext: {
    getServerConfig: () => {
      uploadFileConfig?: {
        create?: { formData?: Record<string, string> };
      };
    };
    useFileName: () => { fileName: { value: string } };
    useMessage: () => {
      info: (msg: string) => void;
      success: (msg: string) => void;
      warning: (msg: string) => void;
      error: (msg: string) => void;
    };
  };
}

/**
 * 解析路由，判断是否为 CAD 编辑器路由
 * @param pathname 当前路径
 * @returns 如果匹配 /cad-editor/:fileId，返回 fileId；否则返回 null
 */
function parseCADEditorRoute(pathname: string): string | null {
  const match = pathname.match(/^\/cad-editor\/([^/]+)$/);
  return match?.[1] ?? null;
}

/**
 * 判断是否为主页路由（/ 或 /cad-editor 无文件ID）
 */
function isHomeRoute(pathname: string): boolean {
  return pathname === '/' || pathname === '' || pathname === '/cad-editor';
}

export const CADEditorDirect: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { showToast } = useNotification();
  const { hasPermission } = usePermission();
  const { setIsActive, setLoading: setStoreLoading, setError: setStoreError, setPermissions, setCurrentFileId: setStoreFileId, setCurrentProjectId: setStoreProjectId, setIsPersonalSpaceMode } = useCADEditorStore();

  // 主页模式（/ 路由，无 fileId）- 在组件顶部计算，用于初始化 isActive
  const isHomeMode = isHomeRoute(location.pathname);

  // 从当前路由解析 fileId - 在组件顶部计算
  const fileId = parseCADEditorRoute(location.pathname);

  // 从 URL 参数获取 libraryKey（?library=drawing 或 ?library=block）
  const searchParams = new URLSearchParams(location.search);
  const libraryKeyParam =
    (searchParams.get('library') as 'drawing' | 'block' | null) || null;

  // 是否激活（路由匹配 /cad-editor/:fileId 或主页模式）
  // 不再依赖 isAuthenticated，因为公开资源库可以免登录访问
  const [isActive, setIsActiveLocal] = useState(() => {
    return !!fileId || isHomeMode;
  });
  // 始终以 loading 状态初始化，确保 CAD 引擎异步初始化期间
  // 编辑器区域显示 loading 遮罩，避免侧边栏先渲染但编辑器白屏
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 存储当前文件的 hash（用于未登录用户的外部参照上传）
  const [currentFileHash, setCurrentFileHash] = useState('');
  
  // 存储文件打开回调函数
  const openFileCallbackRef = useRef<(() => Promise<void>) | null>(null);
  
  // 存储外部参照上传 hook 的配置
  const externalReferenceConfig = useMemo(() => ({
    nodeId: fileId || undefined,
    fileHash: currentFileHash || undefined,
    onSuccess: async () => {
      // 外部参照上传成功后，调用回调函数打开文件
      if (openFileCallbackRef.current) {
        await openFileCallbackRef.current();
        openFileCallbackRef.current = null;
      } else {
        // 如果没有回调函数，重新加载当前文件
        import('../services/mxcadManager').then(({ mxcadManager }) => {
          mxcadManager.reloadCurrentFile().catch(err => {
            console.error('重新加载文件失败:', err);
          });
        });
      }
    },
    onError: (error: unknown) => {
      console.error('外部参照检查失败:', error);
      // 即使外部参照检查失败，也调用回调函数打开文件
      if (openFileCallbackRef.current) {
        openFileCallbackRef.current();
        openFileCallbackRef.current = null;
      }
    },
    onSkip: async () => {
      // 跳过外部参照上传，调用回调函数打开文件
      if (openFileCallbackRef.current) {
        await openFileCallbackRef.current();
        openFileCallbackRef.current = null;
      }
    },
  }), [fileId, currentFileHash]);
  
  // 外部参照上传 hook
  const externalReferenceUpload = useExternalReferenceUpload(externalReferenceConfig);
  
  // 用 ref 包装避免 effect 依赖不稳定对象导致重复执行
  const externalReferenceUploadRef = useRef(externalReferenceUpload);
  externalReferenceUploadRef.current = externalReferenceUpload;

  // 文件拖拽打开
  const { isDragOver } = useFileDropToOpen();

  // 当前文件 ID
  const currentFileIdRef = useRef<string | null>(null);

  // 标记是否已初始化 MxCAD，避免重复初始化
  const isInitializedRef = useRef(false);

  // 记录已加载的文件 URL（包含版本参数），用于检测 URL 变化
  const loadedFileUrlRef = useRef<string | null>(null);

  // 标记登录提示是否已关闭（避免重复显示）
  const loginPromptDismissedRef = useRef(false);

  // 保存登录提示的操作类型（用于登录后恢复正确的操作）
  const loginPromptActionRef = useRef<string>('');

  // 登录后触发保存操作标记
  const saveTriggeredRef = useRef(false);

  // 标记是否处于"另存为到本地"模式（用于区分导出下载和本地另存为）
  const isSaveAsLocalModeRef = useRef(false);

  // 下载格式弹窗状态
  const [showDownloadFormatModal, setShowDownloadFormatModal] = useState(false);
  const [downloadingNodeId, setDownloadingNodeId] = useState<string>('');
  const [downloadingFileName, setDownloadingFileName] = useState<string>('');
  const [downloading, setDownloading] = useState(false);

  // PDF 导出弹窗状态
  const [showPdfExportModal, setShowPdfExportModal] = useState(false);
  const [pdfExportBlob, setPdfExportBlob] = useState<Blob | null>(null);
  const [pdfExportFileName, setPdfExportFileName] = useState<string>('');
  const [pdfExporting, setPdfExporting] = useState(false);

  // DWG/DXF 导出弹窗状态
  const [showDwgExportModal, setShowDwgExportModal] = useState(false);
  const [dwgExportBlob, setDwgExportBlob] = useState<Blob | null>(null);
  const [dwgExportFileName, setDwgExportFileName] = useState<string>('');
  const [dwgExportFormat, setDwgExportFormat] = useState<'dwg' | 'dxf'>('dwg');
  const [dwgExporting, setDwgExporting] = useState(false);

  // CAD 权限状态
  const [canSave, setCanSave] = useState(false);
  const [canExport, setCanExport] = useState(false);
  const [canManageExternalRef, setCanManageExternalRef] = useState(false);

  // 登录提示状态
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [loginPromptAction, setLoginPromptAction] = useState<string>('');

  // 另存为弹窗状态
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsFileName, setSaveAsFileName] = useState<string>('');
  const [saveAsBlob, setSaveAsBlob] = useState<Blob | null>(null);
  const [saveAsPersonalSpaceId, setSaveAsPersonalSpaceId] = useState<
    string | null
  >(null);

  // 另存为成功后确认打开新标签页
  const showConfirm = useConfirmDialog().showConfirm;

  // 路由变化时重置登录提示弹框（非主页模式下关闭）
  useEffect(() => {
    if (!isHomeMode && showLoginPrompt) {
      setShowLoginPrompt(false);
    }
  }, [location.pathname, isHomeMode]);

  // 修复 window.open 新标签页无历史栈 → 返回时页面直接关闭的 bug
  // 原理：window.open 创建的新标签页历史栈只有 1 条，replaceState 不会增加条目。
  //       从 URL 的 back 参数获取来源页面，通过 replaceState + pushState 注入历史栈。
  //       back 参数由各 window.open 调用处传入 window.location.pathname + window.location.search。
  useEffect(() => {
    if (!fileId) return;
    if (window.history.length > 1) return;

    const backUrl = new URLSearchParams(location.search).get('back');
    if (!backUrl) return;

    // 初始栈: [CAD编辑器URL] (索引0, 当前)
    // ⚠️ 必须先保存 CAD 编辑器 URL，因为 replaceState 会立刻改变 window.location
    const cadEditorPath = window.location.pathname + window.location.search;
    // replaceState → 栈: [来源页面URL] (索引0, 当前)
    window.history.replaceState(null, '', backUrl);
    // pushState → 栈: [来源页面URL, CAD编辑器URL] (索引1, 当前)
    // 用户点"返回"时回到来源页面URL → React Router 导航到对应页面
    window.history.pushState(null, '', cadEditorPath);
  }, [fileId, location.search]);

  // 标记是否正在处理保存命令（防止同一次保存命令重复触发弹框）
  const isProcessingSaveRef = useRef(false);

  // 保存操作引用
  const saveRequiredHandlerRef = useRef<
    ((event: CustomEvent<{ action: string }>) => void) | null
  >(null);

  // 从 URL 获取项目 ID（用于权限检查）
  const urlProjectId = React.useMemo(() => {
    // 从 URL 的 nodeId 参数中获取（可能是项目 ID）
    const nodeIdParam = new URLSearchParams(location.search).get('nodeId');
    return nodeIdParam || '';
  }, [location.search]);

  // 从 URL 获取版本参数（用于访问历史版本）
  const versionParam = React.useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get('v');
  }, [location.search]);

  // 私人空间 ID（使用共享 hook）
  const personalSpaceQuery = usePersonalSpaceQuery({
    enabled: isAuthenticated,
  });
  const personalSpaceId = personalSpaceQuery.data?.id || null;

  // 同步到 mxcadManager 缓存
  useEffect(() => {
    if (personalSpaceId) {
      import('../services/mxcadManager').then(
        ({ setPersonalSpaceId: setCachedPersonalSpaceId }) => {
          setCachedPersonalSpaceId(personalSpaceId);
        }
      );
    }
  }, [personalSpaceId]);

  // 当前文件所属项目 ID
  const [currentProjectId, setCurrentProjectId] = React.useState<string | null>(
    null
  );

  // 判断是否为私人空间模式（根据当前文件所属项目）
  const isPersonalSpaceMode = React.useMemo(() => {
    if (!personalSpaceId || !currentProjectId) return false;
    return currentProjectId === personalSpaceId;
  }, [personalSpaceId, currentProjectId]);

  // 同步 isPersonalSpaceMode 到 store
  useEffect(() => {
    setIsPersonalSpaceMode(isPersonalSpaceMode);
  }, [isPersonalSpaceMode]);

  // 加载 CAD 权限
  useEffect(() => {
    if (!urlProjectId) {
      setCanSave(false);
      setCanExport(false);
      setCanManageExternalRef(false);
      setPermissions({ canSave: false, canExport: false, canManageExternalRef: false });
      return;
    }

    const checkPermissions = async () => {
      try {
        const [saveRes, exportRes, externalRefRes] = await Promise.all([
          fileSystemControllerCheckProjectPermission({ path: { projectId: urlProjectId }, query: { permission: ProjectPermission.CAD_SAVE } }),
          fileSystemControllerCheckProjectPermission({ path: { projectId: urlProjectId }, query: { permission: ProjectPermission.FILE_DOWNLOAD } }),
          fileSystemControllerCheckProjectPermission({ path: { projectId: urlProjectId }, query: { permission: ProjectPermission.CAD_EXTERNAL_REFERENCE } }),
        ]);
        const save = saveRes.data?.hasPermission || false;
        const export_ = exportRes.data?.hasPermission || false;
        const externalRef = externalRefRes.data?.hasPermission || false;
        setCanSave(save);
        setCanExport(export_);
        setCanManageExternalRef(externalRef);
        setPermissions({ canSave: save, canExport: export_, canManageExternalRef: externalRef });
      } catch (error) {
        console.error('加载 CAD 权限失败:', error);
      }
    };

    checkPermissions();
  }, [urlProjectId, setPermissions]);

  const loadMxCADDependencies = async () => {
    const { mxcadManager } = await import('../services/mxcadManager');
    return { mxcadManager };
  };

  // 记录已初始化状态（使用 ref 避免重复初始化）
  const isThemeSyncInitialized = useRef(false);

  // 跟踪当前的显示意图（解决 hideEditor 和 showMxCAD 之间的竞态条件）
  // true = 应该显示，false = 应该隐藏，null = 未设置
  const pendingShowActionRef = useRef<boolean | null>(null);

  /**
   * 初始化主题同步 - 监听 mxcad-app 的 Vuetify 主题变化
   * 当 mxcad-app 切换主题时，通过 CustomEvent 通知 React ThemeContext
   */
  const initThemeSync = async () => {
    // 防止重复初始化主题同步
    if (isThemeSyncInitialized.current) {
      console.log('[ThemeSync] 已初始化，跳过');
      return;
    }

    try {
      const { mxcadApp } = await import('mxcad-app');
      const vuetify = await mxcadApp.getVuetify();

      // 拦截 vuetify.theme.change 方法，替代 Vue watch
      // 原因：watch 在多个 await 后才注册，错过 mxcad-app 异步初始化时的主题切换
      // patch 方式无论何时调用都能捕获，且不依赖 Vue 响应式系统
      const originalChange = vuetify.theme.change.bind(vuetify.theme);
      vuetify.theme.change = (name: string) => {
        originalChange(name);
        window.dispatchEvent(
          new CustomEvent('mxcad-theme-changed', {
            detail: { isDark: name === 'dark' },
          })
        );
      };

      // 从 localStorage 读取用户设置的主题
      const storedTheme = localStorage.getItem('mx-user-dark');
      const userThemeIsDark = storedTheme ? storedTheme === 'true' : true;
      const currentMxcadTheme = vuetify.theme.global.name.value;
      const mxcadIsDark = currentMxcadTheme === 'dark';

      // 初始同步：以 localStorage 为准对齐 Vuetify
      // 覆盖两种情况：
      //   1. mxcad-app 在 patch 前已完成异步主题切换
      //   2. mxcad-app 尚未初始化主题（默认值与用户偏好不同）
      if (userThemeIsDark !== mxcadIsDark) {
        vuetify.theme.change(userThemeIsDark ? 'dark' : 'light');
      }

      // 监听 React 主题变化事件，同步到 Vuetify
      // 避免 ThemeContext 直接 import('mxcad-app') 污染非 CAD 页面样式
      const handleReactThemeChanged = (e: Event) => {
        const { isDark: newIsDark } = (e as CustomEvent<{ isDark: boolean }>).detail;
        const target = newIsDark ? 'dark' : 'light';
        if (vuetify.theme.global.name.value !== target) {
          vuetify.theme.change(target);
        }
      };
      window.addEventListener('react-theme-changed', handleReactThemeChanged);

      // 标记主题同步已初始化
      isThemeSyncInitialized.current = true;
    } catch (error) {
      console.warn('[ThemeSync] 主题同步初始化失败:', error);
    }
  };

  const initMxCADConfig = async (currentFile?: {
    parentId?: string | null;
    id?: string;
  }) => {
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

    // 注册打印/剪切回调
    mxcadApp.initPrintConfig({
      callback: async (data: Blob, param) => {
        const file = new File([data], 'print.mxweb', { type: 'application/octet-stream' });
        const hash = await calculateFileHash(file);
        await uploadFile({ file, hash, nodeId: '', forceUpload: true, skipDb: true });

        const result = await publicFileControllerConvertAndDownload({
          body: { fileHash: hash, format: 'pdf', params: param },
        });

        const blob = result?.data as Blob | undefined;
        return blob ? URL.createObjectURL(blob) : '';
      }
    });
    mxcadApp.initCutConfig({
      callback: async (data: Blob, box) => {
        const file = new File([data], 'cut.mxweb', { type: 'application/octet-stream' });
        const hash = await calculateFileHash(file);
        await uploadFile({ file, hash, nodeId: '', forceUpload: true, skipDb: true });

        const result = await publicFileControllerConvertAndDownload({
          body: { fileHash: hash, format: 'dwg', params: box.param },
        });

        const blob = result?.data as Blob | undefined;
        return blob ? URL.createObjectURL(blob) : '';
      }
    });
  };

  // 隐藏编辑器
  const hideEditor = useCallback(() => {
    setIsActiveLocal(false);
    setIsActive(false);
    setLoading(false);
    setStoreLoading(false);
    setError(null);
    setStoreError(null);

    // 设置显示意图为隐藏
    pendingShowActionRef.current = false;

    // 调用 mxcadManager 隐藏编辑器（异步，但会检查意图）
    loadMxCADDependencies()
      .then(({ mxcadManager }) => {
        // 只有当意图仍然是"隐藏"时才执行
        if (pendingShowActionRef.current === false) {
          mxcadManager.showMxCAD(false);
        }
      })
      .catch((err) => {
        console.error('隐藏编辑器失败:', err);
      });
  }, []);

  // 监听路由变化，控制编辑器显示/隐藏
  useEffect(() => {
    const shouldShowEditor = !!fileId || isHomeMode;

    if (shouldShowEditor) {
      // 路由匹配 / 或 /cad-editor/:fileId，显示编辑器
      setIsActiveLocal(true);
      setIsActive(true);

      // 设置显示意图为显示
      pendingShowActionRef.current = true;

      // 如果 MxCAD 已创建，确保显示编辑器容器
      // 这对于浏览器回退场景很重要：用户从登录页返回时需要重新显示编辑器
      if (isInitializedRef.current) {
        import('../services/mxcadManager').then(({ mxcadManager }) => {
          // 只有当意图仍然是"显示"时才执行
          if (
            pendingShowActionRef.current === true &&
            mxcadManager.isCreated()
          ) {
            mxcadManager.showMxCAD(true);
          }
        });
      }
    } else {
      // 路由不匹配或未登录，隐藏编辑器
      hideEditor();
    }
  }, [fileId, isAuthenticated, isHomeMode, hideEditor]);

  // 登录成功后恢复 CAD 编辑器显示
  useEffect(() => {
    if (isAuthenticated && isHomeMode) {
      loginPromptDismissedRef.current = false;

      // 设置显示意图为显示
      pendingShowActionRef.current = true;

      (async () => {
        try {
          const { mxcadManager } = await import('../services/mxcadManager');
          // 只有当意图仍然是"显示"时才执行
          if (
            pendingShowActionRef.current === true &&
            mxcadManager.isCreated()
          ) {
            mxcadManager.showMxCAD(true);
          }
        } catch (err) {
          console.error('恢复编辑器显示失败:', err);
        }
      })();
    }
  }, [isAuthenticated, isHomeMode]);

  // 登录成功后刷新文件名显示（移除 [未登录] 前缀）并重新加载文件
  useEffect(() => {
    if (isAuthenticated) {
      import('../services/mxcadManager')
        .then(({ refreshFileName, mxcadManager }) => {
          refreshFileName();
          // 登录成功后重新加载当前文件，确保使用新的认证头
          if (fileId) {
            mxcadManager.reloadCurrentFile().catch(err => {
              console.error('重新加载文件失败:', err);
            });
          }
        })
        .catch((err) => {
          console.error('刷新文件名失败:', err);
        });
    }
  }, [isAuthenticated, fileId]);

  // 当 fileId 变化时加载文件
  // 注意：不依赖 loading state 做 guard，避免 loading=true → 侧边栏骨架屏 →
  // ProjectDrawingsPanel 卸载→挂载→卸载→挂载循环导致图纸库/图块库渲染连锁空白。
  // 浏览器返回时侧边栏应持续可见，文件在后台加载，不中断已有缓存数据展示。
  useEffect(() => {
    if (!fileId) return;

    // 如果已登录但尚未获取到 personalSpaceId，等待 personalSpaceId 就绪后重新触发加载
    if (isAuthenticated && !personalSpaceId) return;

    let cancelled = false;

    const loadFile = async () => {
      // 不 setLoading(true) — 侧边栏持续可见，不因骨架屏卸载 ProjectDrawingsPanel
      setError(null);
      setStoreError(null);

      try {
        const { mxcadManager } = await import('../services/mxcadManager');
        if (cancelled) return;

        // 获取文件信息
        let file: {
          fileHash?: string;
          path?: string;
          parentId?: string | null;
          id?: string;
          isRoot?: string | boolean;
          name?: string;
          deletedAt?: string | null;
          updatedAt?: string;
          libraryKey?: string | null;
        };

        // 如果 URL 参数指定了 libraryKey，直接使用
        if (libraryKeyParam === 'drawing') {
          const { data: nodeData } = await libraryControllerGetDrawingNode({ path: { nodeId: fileId } });
          file = nodeData!;
        } else if (libraryKeyParam === 'block') {
          const { data: nodeData } = await libraryControllerGetBlockNode({ path: { nodeId: fileId } });
          file = nodeData!;
        } else {
          // 项目文件：需要登录
          try {
            const { data: fileData } = await fileSystemControllerGetNode({ path: { nodeId: fileId } });
            file = fileData!;
          } catch (error) {
            console.error('获取文件信息失败:', error);
            const axiosError = error as { response?: { status?: number } };
            if (axiosError.response?.status === 401) {
              // 确实是认证错误
              setError('请登录后访问此文件');
              setStoreError('请登录后访问此文件');
            } else if (axiosError.response?.status === 404) {
              setError('文件不存在或已被删除');
              setStoreError('文件不存在或已被删除');
            } else {
              setError('获取文件信息失败，请检查网络连接');
              setStoreError('获取文件信息失败，请检查网络连接');
            }
            setLoading(false);
            setStoreLoading(false);
            return;
          }
        }

        if (!file) {
          setError('文件不存在');
          setStoreError('文件不存在');
          setLoading(false);
          setStoreLoading(false);
          return;
        }

        // 检查文件是否在回收站中
        if (file.deletedAt) {
          setError('文件已被删除');
          setStoreError('文件已被删除');
          setLoading(false);
          setStoreLoading(false);
          return;
        }

        if (!file.fileHash) {
          setError('文件尚未转换完成');
          setStoreError('文件尚未转换完成');
          setLoading(false);
          setStoreLoading(false);
          return;
        }

        // 设置当前文件信息和 navigate 函数（用于返回命令）
        const { setCurrentFileInfo, setNavigateFunction, setCacheTimestamp } =
          await import('../services/mxcadManager');

        // 获取项目根节点 ID
        let projectId: string | null | undefined = file.parentId || null;

        // 判断是否需要获取根节点：
        // 1. 项目文件（无 libraryKeyParam）→ 需要
        // 2. 资源库文件 + 有对应管理权限 → 需要（管理员可以管理资源库）
        // 3. 资源库文件 + 无权限 → 不需要（普通用户只读）
        const shouldGetRoot = !libraryKeyParam ||
          (libraryKeyParam === 'drawing' && hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE)) ||
          (libraryKeyParam === 'block' && hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE));

        if (shouldGetRoot) {
          if (!file.isRoot && file.parentId) {
            try {
              if (!file.id) throw new Error('节点ID缺失');
              const { data: rootNode } = await fileSystemControllerGetRootNode({ path: { nodeId: file.id } });
              if (rootNode?.id) {
                projectId = rootNode.id;
              }
            } catch (error) {
              console.error('获取根节点失败:', error);
              // 失败时使用 parentId 作为后备
            }
          } else if (file.isRoot) {
            projectId = file.id;
          }
        }

        // 检查是否从平台跳转进入（通过 nodeId 参数判断）
        const nodeIdParam = searchParams.get('nodeId');
        const fromPlatform = !!nodeIdParam;

        setCurrentFileInfo({
          fileId: file.id || '',
          parentId: file.parentId || null,
          projectId,
          name: file.name || '',
          personalSpaceId,
          libraryKey:
            (libraryKeyParam === 'drawing' || libraryKeyParam === 'block'
              ? libraryKeyParam
              : file.libraryKey === 'drawing' || file.libraryKey === 'block'
                ? file.libraryKey
                : undefined) as 'drawing' | 'block' | undefined,
          fromPlatform,
        });
        setStoreFileId(file.id || null);
        setNavigateFunction(navigate);

        // 设置当前项目 ID（用于判断是否为私人空间模式）
        // 注意：公开资源库文件不设置 projectId，避免侧边栏"我的项目"Tab 显示资源库内容
        if (projectId && !libraryKeyParam) {
          setCurrentProjectId(projectId);
          setStoreProjectId(projectId);
        } else if (!libraryKeyParam) {
          // 非公开资源库时，清空 projectId
          setCurrentProjectId(null);
          setStoreProjectId(null);
        }

        // 构造 mxweb 文件访问 URL
        // 根据 libraryKey 选择对应的 API 路径：
        // - drawing: /api/v1/library/drawing/filesData/...
        // - block: /api/v1/library/block/filesData/...
        // - null (项目文件): /api/v1/mxcad/filesData/...
        // 历史版本使用 ?v= 参数，最新版本使用 ?t={updatedAt} 确保获取服务器最新
        let mxcadFileUrl!: string;
        let cacheTimestamp: number | undefined;

        if (versionParam) {
          // 历史版本
          if (libraryKeyParam === 'drawing' || libraryKeyParam === 'block') {
            mxcadFileUrl = `/api/v1/library/${libraryKeyParam}/filesData/${file.path}?v=${versionParam}`;
          } else {
            mxcadFileUrl = `/api/v1/mxcad/filesData/${file.path}?v=${versionParam}`;
          }
          setCacheTimestamp(undefined); // 历史版本不需要清理缓存
        } else {
          if (file.updatedAt) {
            // 使用 updatedAt 时间戳作为缓存版本标识，确保获取最新文件
            cacheTimestamp = new Date(file.updatedAt).getTime();
            if (libraryKeyParam === 'drawing' || libraryKeyParam === 'block') {
              mxcadFileUrl = `/api/v1/library/${libraryKeyParam}/filesData/${file.path}?t=${cacheTimestamp}`;
            } else {
              mxcadFileUrl = `/api/v1/mxcad/filesData/${file.path}?t=${cacheTimestamp}`;
            }
            setCacheTimestamp(cacheTimestamp); // 设置缓存时间戳，用于清理旧缓存
          } else {
            // 既无版本参数也无 updatedAt，无法构造文件 URL
            // 恢复旧版 useFileLoader getFileUrl 的保护逻辑
            setError('无法构造文件访问URL');
            setLoading(false);
            return;
          }
        }

        // 如果 MxCAD 已经创建且是同一个文件 URL，直接显示（无需重新检查外部参照）
        if (isInitializedRef.current && mxcadManager.isCreated()) {
          if (loadedFileUrlRef.current === mxcadFileUrl) {
            mxcadManager.showMxCAD(true);
            setLoading(false);
            return;
          }
        }

        // 定义打开 mxweb 文件的核心逻辑（延迟执行，等待外部参照弹框关闭后调用）
        const doOpenMxFile = async () => {
          if (isInitializedRef.current && mxcadManager.isCreated()) {
            // URL 变化了，需要重新加载文件
            console.log(
              `文件 URL 变化，重新加载: ${loadedFileUrlRef.current} -> ${mxcadFileUrl}`
            );
            await mxcadManager.openFile(mxcadFileUrl);
            mxcadManager.showMxCAD(true);
            loadedFileUrlRef.current = mxcadFileUrl;
            currentFileIdRef.current = fileId;
            setLoading(false);
            return;
          }

          // 检查 MxCAD 是否已创建（可能是其他组件初始化的）
          if (mxcadManager.isCreated()) {
            console.log('[CADEditorDirect] MxCAD 已创建，跳过初始化');
            isInitializedRef.current = true;
            loadedFileUrlRef.current = mxcadFileUrl;
            currentFileIdRef.current = fileId;
            mxcadManager.showMxCAD(true);
            setLoading(false);
            return;
          }

          // 按需加载 MxCAD 依赖
          await loadMxCADDependencies();
          if (cancelled) return;

          // 初始化 MxCAD 配置，传入当前文件信息以获取正确的父节点
          await initMxCADConfig(file);
          if (cancelled) return;

          // 初始化 MxCAD 视图，传入 mxweb 文件 URL
          await mxcadManager.initializeMxCADView(mxcadFileUrl);
          if (cancelled) return;

          mxcadManager.showMxCAD(true);

          // 初始化主题同步 - 监听 mxcad-app 主题变化
          await initThemeSync();
          if (cancelled) return;

          // 标记为已初始化
          isInitializedRef.current = true;
          loadedFileUrlRef.current = mxcadFileUrl;
          currentFileIdRef.current = fileId;

          // 等待一帧渲染，确保 CAD canvas 已绘制到屏幕后再隐藏 loading
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          });

          if (!cancelled) {
            setLoading(false);
            setStoreLoading(false);
          }
        };

        // 从页面跳转打开文件（我的图纸/项目管理/公开资源库），直接打开，不检查外部参照
        await doOpenMxFile();
      } catch (err) {
        console.error('加载文件失败:', err);
        if (!cancelled) {
          setError('CAD编辑器初始化失败');
          setStoreError('CAD编辑器初始化失败');
          setLoading(false);
          setStoreLoading(false);
        }
      }
    };

    loadFile();

    return () => {
      cancelled = true;
    };
  }, [fileId, isActive, versionParam, navigate, isAuthenticated, personalSpaceId]);
  
  // 监听公开文件上传事件，上传完成后检查外部参照
  useEffect(() => {
    const handlePublicFileUploaded = async (event: CustomEvent<{
      fileHash: string;
      fileName?: string;
      noCache?: boolean;
      callback?: () => Promise<void>
    }>) => {
      const { fileHash, noCache, callback } = event.detail;
      setCurrentFileHash(fileHash);

      // 保存回调函数到 ref，在外部参照操作完成后调用
      openFileCallbackRef.current = callback || null;

      // 只有无缓存模式才检查外部参照（CAD编辑器打开文件_无缓存）
      if (!noCache) {
        // 非无缓存模式，直接打开文件
        if (openFileCallbackRef.current) {
          await openFileCallbackRef.current();
          openFileCallbackRef.current = null;
        }
        return;
      }

       try {
          // shouldRetry = true，因为刚上传文件，需要等待生成 preloading.json
          // forceOpen = false，如果没有外部参照不弹框
          const hasMissingReferences = await externalReferenceUploadRef.current.checkMissingReferences(fileHash, true, false);

          if (!hasMissingReferences) {
            // 如果没有外部参照，直接调用回调打开文件
            if (openFileCallbackRef.current) {
              await openFileCallbackRef.current();
              openFileCallbackRef.current = null;
            }
          }
          // 如果有外部参照，回调会在用户完成操作后通过 onSuccess 调用
        } catch (error) {
          console.error('外部参照检查失败:', error);
          // 即使检查失败，也调用回调打开文件
          if (openFileCallbackRef.current) {
            await openFileCallbackRef.current();
            openFileCallbackRef.current = null;
          }
        }
    };
    
    window.addEventListener('public-file-uploaded', handlePublicFileUploaded as unknown as EventListener);

    return () => {
      window.removeEventListener('public-file-uploaded', handlePublicFileUploaded as unknown as EventListener);
    };
  }, []);

  // 监听已登录用户上传完成事件，检查外部参照（替代 mxcadManager 中的直接 hook 调用）
  useEffect(() => {
    const handleUploadCompleted = (event: CustomEvent<{ nodeId: string; callback?: () => Promise<void> }>) => {
      const { nodeId, callback } = event.detail;

      // Save file-open callback in ref; triggered after external ref operations complete
      if (callback) {
        openFileCallbackRef.current = callback;
      }

      // shouldRetry = true, wait for backend to generate preloading.json after upload
      // forceOpen = false, don't show dialog if no missing external refs
      externalReferenceUploadRef.current.checkMissingReferences(nodeId, true, false)
        .then((hasMissing) => {
          if (!hasMissing && openFileCallbackRef.current) {
            // No missing external refs, open file directly
            openFileCallbackRef.current();
            openFileCallbackRef.current = null;
          }
          // If missing external refs, dialog is shown; callback triggered via onSkip/onSuccess
        })
        .catch(err => {
          console.error('External ref check failed:', err);
          // Open file even if check fails
          if (openFileCallbackRef.current) {
            openFileCallbackRef.current();
            openFileCallbackRef.current = null;
          }
        });
    };
    window.addEventListener('mxcad-upload-completed', handleUploadCompleted as EventListener);
    return () => {
      window.removeEventListener('mxcad-upload-completed', handleUploadCompleted as EventListener);
    };
  }, []);

  // 主页模式初始化守卫 — 使用组件级 ref 替代全局 window 属性
  // 原因：React Strict Mode 会双挂载组件。全局 window 属性在第一次挂载时被设为 true，
  // 第二次挂载（cleanup 后重新挂载）时仍为 true，导致 initHome 被跳过，loading 永久为 true，
  // 不透明遮罩覆盖 canvas — 用户看到的"不出东西"现象。
  const homeInitStartedRef = useRef(false);

  // 主页模式初始化（/ 路由，初始化空白编辑器）
  useEffect(() => {
    if (!isHomeMode || !isActive) return;

    // 使用组件级 ref 防止重复初始化（同一挂载周期内的防护）
    if (homeInitStartedRef.current) {
      return;
    }

    // 立即标记开始，避免 setTimeout 期间重复触发
    homeInitStartedRef.current = true;

    setError(null);
    setStoreError(null);

    const timer = setTimeout(async () => {
      try {
        const { mxcadManager } = await import('../services/mxcadManager');

        // 如果 MxCAD 已经创建，直接显示
        if (mxcadManager.isCreated()) {
          mxcadManager.showMxCAD(true);
          isInitializedRef.current = true;
          setLoading(false);
          setStoreLoading(false);
          return;
        }

        // 设置导航函数
        const { setNavigateFunction } =
          await import('../services/mxcadManager');
        setNavigateFunction(navigate);

        // 初始化 MxCAD 配置
        await initMxCADConfig();

        // 空白编辑器模式
        await mxcadManager.initializeMxCADView();
        mxcadManager.showMxCAD(true);

        // 初始化主题同步
        await initThemeSync();

        // 等待一帧渲染，确保 CAD canvas 已绘制到屏幕后再隐藏 loading
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });

        // 标记已初始化
        isInitializedRef.current = true;
        setLoading(false);
        setStoreLoading(false);
      } catch (err) {
        console.error('初始化 CAD 编辑器失败:', err);
        // 重置组件级 ref，允许重试（替代旧版 window 全局属性）
        homeInitStartedRef.current = false;
        setError('CAD 编辑器初始化失败，请刷新页面重试');
        setStoreError('CAD 编辑器初始化失败，请刷新页面重试');
        setLoading(false);
        setStoreLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      // cleanup 时重置守卫 ref，确保 React Strict Mode
      // 双挂载（unmount → remount）时能重新初始化
      homeInitStartedRef.current = false;
    };
  }, [isHomeMode, isActive]);

  // 监听保存/另存为事件，未登录时显示登录提示
  useEffect(() => {
    const handleSaveRequired = (event: CustomEvent<{ action: string }>) => {
      if (loginPromptDismissedRef.current) return;

      // 另存为操作不需要登录 — 未登录用户直接弹出下载格式选择框
      const action = event.detail?.action || '';
      if (action.includes('另存为')) return;

      if (!isAuthenticated) {
        setLoginPromptAction(action || '保存文件');
        setShowLoginPrompt(true);
        event.preventDefault();
      }
    };

    saveRequiredHandlerRef.current = handleSaveRequired;

    window.addEventListener(
      'mxcad-save-required',
      handleSaveRequired as EventListener
    );

    return () => {
      window.removeEventListener(
        'mxcad-save-required',
        handleSaveRequired as EventListener
      );
      window.removeEventListener(
        'mxcad-saveas-required',
        handleSaveRequired as EventListener
      );
      saveRequiredHandlerRef.current = null;
    };
  }, [isAuthenticated]);

  // 处理登录提示的登录按钮
  const handleLoginClick = async () => {
    loginPromptDismissedRef.current = true;
    saveTriggeredRef.current = true;
    setShowLoginPrompt(false);

    // 保存当前操作类型到 ref
    if (!loginPromptActionRef.current) {
      loginPromptActionRef.current = loginPromptAction || '保存文件';
    }

    // 设置显示意图为隐藏
    pendingShowActionRef.current = false;

    const { mxcadManager } = await import('../services/mxcadManager');
    mxcadManager.showMxCAD(false);
    navigate('/login', {
      state: { from: location.pathname + location.search },
    });
  };

  // 处理登录提示的关闭
  const handleLoginPromptClose = () => {
    setShowLoginPrompt(false);
  };

  // 监听导出事件（UI 按钮触发）
  useEffect(() => {
    const handleExportEvent = (event: Event) => {
      if (!canExport) {
        showToast('您没有导出图纸的权限', 'warning');
        return;
      }
      const customEvent = event as CustomEvent<{
        fileId: string;
        fileName: string;
      }>;
      setDownloadingNodeId(customEvent.detail.fileId);
      setDownloadingFileName(customEvent.detail.fileName);
      setShowDownloadFormatModal(true);
    };

    window.addEventListener('mxcad-export-file', handleExportEvent);

    return () => {
      window.removeEventListener('mxcad-export-file', handleExportEvent);
    };
  }, [canExport, showToast]);

  // 监听 PDF 导出事件（Mx_ExportPDF 命令）
  useEffect(() => {
    const handlePdfExportEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{
        fileName: string;
        blob: Blob;
      }>;
      setPdfExportFileName(customEvent.detail.fileName);
      setPdfExportBlob(customEvent.detail.blob);
      setShowPdfExportModal(true);
    };

    window.addEventListener('mxcad-export-pdf', handlePdfExportEvent);

    return () => {
      window.removeEventListener('mxcad-export-pdf', handlePdfExportEvent);
    };
  }, []);

  // 监听 DWG/DXF 导出事件（Mx_ExportDWG / Mx_ExportDXF 命令）
  useEffect(() => {
    const handleDwgExportEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{
        fileName: string;
        blob: Blob;
        format: 'dwg' | 'dxf';
      }>;
      setDwgExportFileName(customEvent.detail.fileName);
      setDwgExportBlob(customEvent.detail.blob);
      setDwgExportFormat(customEvent.detail.format);
      setShowDwgExportModal(true);
    };

    window.addEventListener('mxcad-export-dwg', handleDwgExportEvent);
    window.addEventListener('mxcad-export-dxf', handleDwgExportEvent);

    return () => {
      window.removeEventListener('mxcad-export-dwg', handleDwgExportEvent);
      window.removeEventListener('mxcad-export-dxf', handleDwgExportEvent);
    };
  }, []);

  // 监听另存为事件
  useEffect(() => {
    const handleSaveAsEvent = (
      event: CustomEvent<{
        currentFileName: string;
        mxwebBlob: Blob;
        personalSpaceId: string | null;
      }>
    ) => {
      if (loginPromptDismissedRef.current) return;

      if (!isAuthenticated) {
        // 未登录用户：弹出下载格式选择框，另存为到本地
        const { currentFileName, mxwebBlob } = event.detail;
        setDownloadingFileName(currentFileName);
        setSaveAsBlob(mxwebBlob);
        isSaveAsLocalModeRef.current = true;
        setShowDownloadFormatModal(true);
        return;
      }

      const { currentFileName, mxwebBlob, personalSpaceId } = event.detail;
      setSaveAsFileName(currentFileName);
      setSaveAsBlob(mxwebBlob);
      setSaveAsPersonalSpaceId(personalSpaceId);
      setShowSaveAsModal(true);
    };

    window.addEventListener(
      'mxcad-save-as',
      handleSaveAsEvent as EventListener
    );

    return () => {
      window.removeEventListener(
        'mxcad-save-as',
        handleSaveAsEvent as EventListener
      );
    };
  }, [isAuthenticated]);

  // 处理另存为成功
  const handleSaveAsSuccess = async (result: {
    nodeId: string;
    fileName: string;
    path: string;
    projectId?: string;
    parentId: string;
  }) => {
    setShowSaveAsModal(false);
    setSaveAsBlob(null);
    showToast('另存为成功', 'success');

    // 显示确认弹窗（与缩略图生成并发执行）
    const confirmPromise = showConfirm({
      title: '打开新图纸',
      message: `"${saveAsFileName}" 已保存成功，是否在新标签页中打开？`,
      confirmText: '打开',
      cancelText: '关闭',
      type: 'info',
    });

    // 立即生成并上传缩略图（失败不影响主流程）
    const thumbnailPromise = generateThumbnail().then(async (imageData) => {
      if (!imageData) {
        console.warn(`[handleSaveAsSuccess] 缩略图生成失败(无数据): ${result.nodeId}`);
        return;
      }
      console.log(`[handleSaveAsSuccess] 缩略图生成成功, 开始上传: ${result.nodeId}`);
      const uploaded = await uploadThumbnail(result.nodeId, imageData);
      if (uploaded) {
        console.log(`[handleSaveAsSuccess] 缩略图上传成功: ${result.nodeId}`);
      } else {
        console.warn(`[handleSaveAsSuccess] 缩略图上传失败: ${result.nodeId}`);
      }
    }).catch((err) => {
      console.error('[handleSaveAsSuccess] 缩略图生成/上传异常:', err);
    });

    const confirmed = await confirmPromise;
    if (confirmed) {
      window.open(`/cad-editor/${result.nodeId}?nodeId=${result.parentId}`, '_blank');
    }

    await thumbnailPromise;
  };

  // 登录用户点击"另存为到本地"按钮
  const handleSaveAsDownloadLocal = useCallback(() => {
    setDownloadingFileName(saveAsFileName);
    isSaveAsLocalModeRef.current = true;
    setShowDownloadFormatModal(true);
    setShowSaveAsModal(false);
  }, [saveAsFileName]);

// 监听文件打开事件，更新 URL（保留 mode 参数）
  useEffect(() => {
    const handleFileOpened = (
      event: CustomEvent<{
        fileId: string;
        parentId: string;
        projectId: string;
        fileUrl?: string;
        fileName?: string;
        libraryKey?: string;
      }>
    ) => {
      const { fileId, parentId, projectId, libraryKey } = event.detail;
      // 更新当前项目 ID（用于判断是否为私人空间模式）
      // 注意：公开资源库文件不设置 projectId，避免侧边栏"我的项目"Tab 显示资源库内容
      if (!libraryKey) {
        setCurrentProjectId(projectId);
        setStoreProjectId(projectId);
      } else {
        // 公开资源库文件，清空 projectId
        setCurrentProjectId(null);
        setStoreProjectId(null);
      }

      // 根据文件类型使用统一的 URL 格式
      if (libraryKey === 'drawing') {
        // 图纸库文件
        window.history.replaceState(
          null,
          '',
          `/cad-editor/${fileId}?library=drawing`
        );
      } else if (libraryKey === 'block') {
        // 图块库文件
        window.history.replaceState(
          null,
          '',
          `/cad-editor/${fileId}?library=block`
        );
      } else {
        // 普通项目文件
        window.history.replaceState(
          null,
          '',
          `/cad-editor/${fileId}?nodeId=${parentId}`
        );
      }

      // 更新当前文件 ID
      currentFileIdRef.current = fileId;
    };

    window.addEventListener(
      'mxcad-file-opened',
      handleFileOpened as EventListener
    );

    return () => {
      window.removeEventListener(
        'mxcad-file-opened',
        handleFileOpened as EventListener
      );
    };
  }, []);

  // 监听新建文件事件，重置状态
  useEffect(() => {
    const handleNewFile = () => {
      // 重置当前项目 ID
      setCurrentProjectId(null);
      setStoreProjectId(null);
      // 重置当前文件 ID
      currentFileIdRef.current = null;
      setStoreFileId(null);
    };

    window.addEventListener('mxcad-new-file', handleNewFile as EventListener);

    return () => {
      window.removeEventListener(
        'mxcad-new-file',
        handleNewFile as EventListener
      );
    };
  }, []);


  // 监听文件打开完成事件，隐藏底部加载状态
  useEffect(() => {
    const handleFileOpenComplete = () => {
      hideGlobalLoading();
    };

    window.addEventListener(
      'mxcad-file-open-complete',
      handleFileOpenComplete as EventListener
    );

    return () => {
      window.removeEventListener(
        'mxcad-file-open-complete',
        handleFileOpenComplete as EventListener
      );
    };
  }, []);

  // 处理从图库插入文件
  const handleInsertFile = async (file: {
    nodeId: string;
    filename: string;
  }) => {
    // 主页模式下：已登录时正常打开文件，未登录时显示登录提示
    if (isHomeMode) {
      if (isAuthenticated) {
        try {
          const { openUploadedFile } = await import('../services/mxcadManager');
          await openUploadedFile(file.nodeId, personalSpaceId || '');
          window.history.replaceState(
            null,
            '',
            `/cad-editor/${file.nodeId}?nodeId=${personalSpaceId || ''}`
          );
        } catch (error) {
          console.error('打开文件失败:', error);
          showToast('打开文件失败', 'error');
        }
      } else {
        if (loginPromptDismissedRef.current) return;
        setLoginPromptAction('打开文件');
        setShowLoginPrompt(true);
      }
      return;
    }

    // 文件编辑模式：已有打开的文件
    try {
      // 获取目标文件信息（要打开的文件）
      const { data: targetFile } = await fileSystemControllerGetNode({ path: { nodeId: file.nodeId } });

      // 检查目标文件是否在回收站中
      if (targetFile?.deletedAt) {
        return;
      }

      // 获取当前文件信息，确定 uploadTargetNodeId
      const currentFileId = currentFileIdRef.current;
      if (!currentFileId) return;

      const { data: currentFile } = await fileSystemControllerGetNode({ path: { nodeId: currentFileId } });

      // 确定 uploadTargetNodeId：优先使用 parentId，如果是根节点则使用 id
      let uploadTargetNodeId = currentFile?.parentId || '';
      if (currentFile?.isRoot && currentFile?.id) {
        uploadTargetNodeId = currentFile.id;
      }

      // 动态导入 openUploadedFile 函数，复用 openFile 命令的逻辑
      const { openUploadedFile } = await import('../services/mxcadManager');

      // 更新浏览器 URL（不触发 React Router）
      window.history.replaceState(
        null,
        '',
        `/cad-editor/${file.nodeId}?nodeId=${uploadTargetNodeId}`
      );

      // 调用 openUploadedFile 打开文件，保持与 openFile 命令完全一致的行为
      await openUploadedFile(file.nodeId, uploadTargetNodeId);

      // 更新当前文件 ID
      currentFileIdRef.current = file.nodeId;
    } catch (error) {
      console.error('打开文件失败:', error);
      showToast(
        error instanceof Error ? error.message : '打开文件失败',
        'error'
      );
    }
  };

  // 处理下载请求
  const handleDownloadWithFormat = async (
    format: DownloadFormat,
    pdfOptions?: PdfOptions,
    dwgOptions?: DwgOptions
  ) => {
    try {
      setDownloading(true);

      // 另存为到本地模式：调用公开转换端点
      if (isSaveAsLocalModeRef.current && saveAsBlob) {
        const file = new File([saveAsBlob], 'save-as.mxweb', { type: 'application/octet-stream' });
        const hash = await calculateFileHash(file);
        await uploadFile({ file, hash, nodeId: '', forceUpload: true, skipDb: true });

        const result = await publicFileControllerConvertAndDownload({
          body: {
            fileHash: hash,
            format,
            params: {
              ...(pdfOptions ? {
                width: pdfOptions.width,
                height: pdfOptions.height,
                colorPolicy: pdfOptions.colorPolicy as 'mono' | undefined,
              } : {}),
              ...(dwgOptions ? { dwgVersion: dwgOptions.dwgVersion } : {}),
            } as Record<string, unknown> | undefined,
          },
        });

        if (result?.error) {
          throw new Error('转换失败');
        }

        const blob = result?.data as Blob | undefined;

        if (!blob) {
          throw new Error('转换失败：无返回数据');
        }
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const nameWithoutExt = downloadingFileName.replace(/\.[^.]+$/, '');
        const finalFileName = `${nameWithoutExt}.${format}`;
        a.download = finalFileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setShowDownloadFormatModal(false);
        setSaveAsBlob(null);
        isSaveAsLocalModeRef.current = false;
        showToast('文件已保存到本地', 'success');
        return;
      }

      const result = await fileSystemControllerDownloadNodeWithFormat({
        path: { nodeId: downloadingNodeId },
        query: { format, ...pdfOptions, ...dwgOptions },
      });
      if (result?.error) throw new Error('下载失败');
      const blobData = result?.data;

      const blob = blobData instanceof Blob ? blobData : new Blob([blobData as BlobPart]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // 根据格式生成文件名（去除原始扩展名，添加新扩展名）
      const nameWithoutExt = downloadingFileName.replace(/\.[^.]+$/, '');
      const finalFileName = `${nameWithoutExt}.${format}`;

      a.download = finalFileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setShowDownloadFormatModal(false);
    } catch (error) {
      console.error('下载失败:', error);
      showToast('下载失败，请重试', 'error');
    } finally {
      setDownloading(false);
    }
  };

  // 处理 PDF 导出（Mx_ExportPDF 命令专用）
  const handlePdfExport = async (pdfOptions: PdfOptions) => {
    if (!pdfExportBlob) return;
    try {
      setPdfExporting(true);
      setShowPdfExportModal(false);

      const file = new File([pdfExportBlob], 'export.mxweb', { type: 'application/octet-stream' });
      const hash = await calculateFileHash(file);
      await uploadFile({ file, hash, nodeId: '', forceUpload: true, skipDb: true });

      const result = await publicFileControllerConvertAndDownload({
        body: {
          fileHash: hash,
          format: 'pdf',
          params: {
            width: pdfOptions.width,
            height: pdfOptions.height,
            colorPolicy: pdfOptions.colorPolicy as 'mono' | undefined,
          },
        },
      });

      if (result?.error) throw new Error('转换失败');
      const blob = result?.data as Blob | undefined;
      if (!blob) throw new Error('转换失败：无返回数据');

      const nameWithoutExt = pdfExportFileName.replace(/\.[^.]+$/, '');
      await saveAsFileDialog({
        blob,
        filename: `${nameWithoutExt}.pdf`,
        types: [{
          description: 'PDF 文件',
          accept: { 'application/octet-stream': ['.pdf'] },
        }],
      });

      setPdfExportBlob(null);
      showToast('PDF 文件已保存到本地', 'success');
    } catch (error) {
      console.error('PDF 导出失败:', error);
      showToast('PDF 导出失败，请重试', 'error');
    } finally {
      setPdfExporting(false);
    }
  };

  // 处理 DWG/DXF 导出（Mx_ExportDWG / Mx_ExportDXF 命令专用）
  const handleDwgExport = async (dwgVersion: number) => {
    if (!dwgExportBlob) return;
    try {
      setDwgExporting(true);
      setShowDwgExportModal(false);

      const file = new File([dwgExportBlob], 'export.mxweb', { type: 'application/octet-stream' });
      const hash = await calculateFileHash(file);
      await uploadFile({ file, hash, nodeId: '', forceUpload: true, skipDb: true });

      const result = await publicFileControllerConvertAndDownload({
        body: {
          fileHash: hash,
          format: dwgExportFormat,
          params: { dwgVersion },
        },
      });

      if (result?.error) throw new Error('转换失败');
      const blob = result?.data as Blob | undefined;
      if (!blob) throw new Error('转换失败：无返回数据');

      const nameWithoutExt = dwgExportFileName.replace(/\.[^.]+$/, '');
      await saveAsFileDialog({
        blob,
        filename: `${nameWithoutExt}.${dwgExportFormat}`,
        types: [{
          description: `${dwgExportFormat.toUpperCase()} 文件`,
          accept: { 'application/octet-stream': [`.${dwgExportFormat}`] },
        }],
      });

      setDwgExportBlob(null);
      showToast(`${dwgExportFormat.toUpperCase()} 文件已保存到本地`, 'success');
    } catch (error) {
      console.error(`${dwgExportFormat.toUpperCase()} 导出失败:`, error);
      showToast(`${dwgExportFormat.toUpperCase()} 导出失败，请重试`, 'error');
    } finally {
      setDwgExporting(false);
    }
  };

  // 错误处理：返回项目列表或刷新页面
  const handleGoBack = () => {
    if (isHomeMode) {
      window.location.reload();
    } else if (isPersonalSpaceMode) {
      navigate('/personal-space');
    } else {
      navigate('/projects');
    }
  };

  return (
    <div
      className="fixed inset-0"
      style={{
        visibility: isActive ? 'visible' : 'hidden',
        zIndex: isActive ? Z_LAYERS.CAD_EDITOR : -1,
        pointerEvents: isActive ? 'auto' : 'none',
        background: 'transparent',
      }}
    >
      {error && (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="text-red-500 text-lg mb-4">{error}</div>
          <Button
            onClick={handleGoBack}
            variant="primary"
          >
            {isHomeMode ? '刷新页面' : '返回项目列表'}
          </Button>
        </div>
      )}

      {!error && isActive && (
        <div className="flex w-full h-screen relative">
          <SidebarContainer
            projectId={
              isHomeMode ? personalSpaceId || '' : currentProjectId || ''
            }
            onInsertFile={handleInsertFile}
            loading={loading}
          />

          {/* CAD编辑器内容区域 */}
          <div className="flex-1 relative" style={{ background: 'transparent' }}>
            {loading && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  zIndex: 100,
                }}
              >
                <div className="flex flex-col items-center gap-4">
                  <div
                    className="animate-pulse rounded-lg"
                    style={{
                      width: 120,
                      height: 120,
                      backgroundColor: 'var(--bg-tertiary)',
                    }}
                  />
                  <div
                    className="animate-pulse rounded"
                    style={{
                      width: 200,
                      height: 14,
                      backgroundColor: 'var(--bg-tertiary)',
                    }}
                  />
                  <div
                    className="animate-pulse rounded"
                    style={{
                      width: 140,
                      height: 12,
                      backgroundColor: 'var(--bg-tertiary)',
                    }}
                  />
                </div>
              </div>
            )}
            {/* 下载格式选择弹窗 */}
            <DownloadFormatModal
              isOpen={showDownloadFormatModal}
              fileName={downloadingFileName}
              onClose={() => {
                setShowDownloadFormatModal(false);
                isSaveAsLocalModeRef.current = false;
                setSaveAsBlob(null);
              }}
              onDownload={handleDownloadWithFormat}
              loading={downloading}
            />
            {/* PDF 导出参数弹窗 */}
            <PdfExportModal
              isOpen={showPdfExportModal}
              fileName={pdfExportFileName}
              onClose={() => {
                setShowPdfExportModal(false);
                setPdfExportBlob(null);
              }}
              onExport={handlePdfExport}
              loading={pdfExporting}
            />
            {/* DWG/DXF 导出参数弹窗 */}
            <DwgExportModal
              isOpen={showDwgExportModal}
              fileName={dwgExportFileName}
              format={dwgExportFormat}
              onClose={() => {
                setShowDwgExportModal(false);
                setDwgExportBlob(null);
              }}
              onExport={handleDwgExport}
              loading={dwgExporting}
            />
          </div>
        </div>
      )}

      {/* 登录提示弹窗 - 主页模式 */}
      <LoginPrompt
        isOpen={showLoginPrompt}
        action={loginPromptAction}
        onLogin={handleLoginClick}
        onClose={handleLoginPromptClose}
      />

      {/* 另存为弹窗 */}
      {showSaveAsModal && saveAsBlob && (
        <SaveAsModal
          isOpen={showSaveAsModal}
          currentFileName={saveAsFileName}
          mxwebBlob={saveAsBlob}
          personalSpaceId={saveAsPersonalSpaceId}
          onClose={() => {
            setShowSaveAsModal(false);
            setSaveAsBlob(null);
          }}
          onSuccess={handleSaveAsSuccess}
        />
      )}

      {/* 外部参照上传弹窗 */}
      <ExternalReferenceModal
        isOpen={externalReferenceUpload.isOpen}
        files={externalReferenceUpload.files}
        loading={externalReferenceUpload.loading}
        onSelectAndUpload={externalReferenceUpload.selectAndUploadFiles}
        onComplete={externalReferenceUpload.complete}
        onSkip={externalReferenceUpload.skip}
        onClose={externalReferenceUpload.skip}
      />

      {/* 拖拽文件提示层 */}
      <DropIndicator visible={isDragOver} />
    </div>
  );
};

export default CADEditorDirect;