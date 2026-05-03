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
import { useNotification } from '../contexts/NotificationContext';
import { ProjectPermission, SystemPermission } from '../constants/permissions';
import { usePermission } from '../hooks/usePermission';
import { filesApi } from '../services/filesApi';
import { projectsApi } from '../services/projectsApi';
import { libraryApi } from '../services/libraryApi';
import { publicFileApi } from '../services/publicFileApi';
import { DownloadFormatModal } from '../components/modals/DownloadFormatModal';
import { SaveAsModal } from '../components/modals/SaveAsModal';
import { ExternalReferenceModal } from '../components/modals/ExternalReferenceModal';
import { SidebarContainer } from '../components/sidebar/SidebarContainer';
import { LoginPrompt } from '../components/auth/LoginPrompt';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { MxFun } from 'mxdraw';
import type { DownloadFormat } from '../components/modals/DownloadFormatModal';
import type { PdfOptions } from '../components/modals/DownloadFormatModal';

declare global {
  interface Window {
    mxcadAppContext?: {
      userId: string;
      projectId: string;
      parentId?: string;
      userRole: string;
    };
  }
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
  const [isActive, setIsActive] = useState(() => {
    return !!fileId || isHomeMode;
  });
  // 只有打开文件时才需要 loading，主页模式直接显示
  const [loading, setLoading] = useState(() => !!fileId);
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
    onError: (error) => {
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

  // 下载格式弹窗状态
  const [showDownloadFormatModal, setShowDownloadFormatModal] = useState(false);
  const [downloadingNodeId, setDownloadingNodeId] = useState<string>('');
  const [downloadingFileName, setDownloadingFileName] = useState<string>('');
  const [downloading, setDownloading] = useState(false);

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

  // 路由变化时重置登录提示弹框（非主页模式下关闭）
  useEffect(() => {
    if (!isHomeMode && showLoginPrompt) {
      setShowLoginPrompt(false);
    }
  }, [location.pathname, isHomeMode]);

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

  // 私人空间 ID（用于判断当前文件所属空间）
  const [personalSpaceId, setPersonalSpaceId] = React.useState<string | null>(
    null
  );
  // 当前文件所属项目 ID
  const [currentProjectId, setCurrentProjectId] = React.useState<string | null>(
    null
  );

  // 获取私人空间 ID
  useEffect(() => {
    if (!isAuthenticated) return;
    projectsApi
      .getPersonalSpace()
      .then((res) => {
        if (res.data?.id) {
          setPersonalSpaceId(res.data.id);
          // 同时缓存到 mxcadManager，用于 openUploadedFile 等函数
          import('../services/mxcadManager').then(
            ({ setPersonalSpaceId: setCachedPersonalSpaceId }) => {
              setCachedPersonalSpaceId(res.data?.id || null);
            }
          );
        }
      })
      .catch(console.error);
  }, [isAuthenticated]);

  // 判断是否为私人空间模式（根据当前文件所属项目）
  const isPersonalSpaceMode = React.useMemo(() => {
    if (!personalSpaceId || !currentProjectId) return false;
    return currentProjectId === personalSpaceId;
  }, [personalSpaceId, currentProjectId]);

  // 加载 CAD 权限
  useEffect(() => {
    if (!urlProjectId) {
      setCanSave(false);
      setCanExport(false);
      setCanManageExternalRef(false);
      return;
    }

    const checkPermissions = async () => {
      try {
        const { projectsApi } = await import('../services/projectsApi');
        const [saveRes, exportRes, externalRefRes] = await Promise.all([
          projectsApi.checkPermission(urlProjectId, ProjectPermission.CAD_SAVE),
          projectsApi.checkPermission(
            urlProjectId,
            ProjectPermission.FILE_DOWNLOAD
          ),
          projectsApi.checkPermission(
            urlProjectId,
            ProjectPermission.CAD_EXTERNAL_REFERENCE
          ),
        ]);
        setCanSave(saveRes.data?.hasPermission || false);
        setCanExport(exportRes.data?.hasPermission || false);
        setCanManageExternalRef(externalRefRes.data?.hasPermission || false);
      } catch (error) {
        console.error('加载 CAD 权限失败:', error);
      }
    };

    checkPermissions();
  }, [urlProjectId]);

  const loadMxCADDependencies = async () => {
    // @ts-expect-error - mxcad-app 没有类型定义
    await import('mxcad-app/style');
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

      // 动态导入 Vue 的 watch 函数
      const { watch } = await import('vue');

      // 从 localStorage 读取用户设置的主题
      const storedTheme = localStorage.getItem('mx-user-dark');
      const userThemeIsDark = storedTheme ? storedTheme === 'true' : true; // 默认暗色
      const currentMxcadTheme = vuetify.theme.global.name.value;
      const mxcadIsDark = currentMxcadTheme === 'dark';

      // 如果主题不一致，同步 localStorage 的主题到 mxcad-app
      if (userThemeIsDark !== mxcadIsDark) {
        vuetify.theme.change(userThemeIsDark ? 'dark' : 'light');
      }

      // 使用 Vue watch 监听 Vuetify 主题变化
      watch(
        () => vuetify.theme.global.name.value,
        (themeName) => {
          const isDark = themeName === 'dark';

          // 派发事件通知 React ThemeContext
          window.dispatchEvent(
            new CustomEvent('mxcad-theme-changed', {
              detail: { isDark },
            })
          );

          // 双保险：直接更新 DOM 和 localStorage（与 ThemeContext.applyThemeToDOM 保持一致）
          const theme = isDark ? 'dark' : 'light';
          document.documentElement.setAttribute('data-theme', theme);
          document.body.setAttribute('data-theme', theme);

          // 同时更新 body 的 class（向后兼容）
          if (isDark) {
            document.body.classList.add('dark-theme');
            document.body.classList.remove('light-theme');
          } else {
            document.body.classList.add('light-theme');
            document.body.classList.remove('dark-theme');
          }

          localStorage.setItem('mx-user-dark', String(isDark));
        }
      );

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

    // 设置MxCAD服务器配置
    const serverConfig = await (
      window as unknown as {
        MxPluginContext: {
          getServerConfig: () => {
            uploadFileConfig?: {
              create?: { formData?: Record<string, string> };
            };
          };
        };
      }
    ).MxPluginContext.getServerConfig();
    if (serverConfig?.uploadFileConfig?.create) {
      // 优先使用当前打开文件的父节点作为上传目标
      // 如果没有当前文件信息，则从 URL 获取
      let nodeId = currentFile?.parentId || '';

      if (!nodeId) {
        nodeId =
          new URLSearchParams(location.search).get('nodeId') ||
          new URLSearchParams(location.search).get('parent') ||
          '';
      }

      serverConfig.uploadFileConfig.create.formData = {
        ...serverConfig.uploadFileConfig.create.formData,
        nodeId: nodeId,
      };

      // Authorization header 由 apiService 拦截器统一处理
    }
  };

  // 隐藏编辑器
  const hideEditor = useCallback(() => {
    setIsActive(false);
    setLoading(false);
    setError(null);

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
  useEffect(() => {
    if (!fileId || !isActive) return;

    const loadFile = async () => {
      setLoading(true);
      setError(null);

      try {
        const { mxcadManager } = await import('../services/mxcadManager');

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
          const { libraryApi } = await import('../services/libraryApi');
          const nodeResponse = await libraryApi.getDrawingNode(fileId);
          file = nodeResponse.data as typeof file;
        } else if (libraryKeyParam === 'block') {
          const { libraryApi } = await import('../services/libraryApi');
          const nodeResponse = await libraryApi.getBlockNode(fileId);
          file = nodeResponse.data as typeof file;
        } else {
          // 项目文件：需要登录
          try {
            const fileResponse = await filesApi.get(fileId);
            file = fileResponse.data as typeof file;
          } catch (error) {
            console.error('获取文件信息失败:', error);
            const axiosError = error as { response?: { status?: number } };
            if (axiosError.response?.status === 401) {
              // 确实是认证错误
              setError('请登录后访问此文件');
            } else if (axiosError.response?.status === 404) {
              setError('文件不存在或已被删除');
            } else {
              setError('获取文件信息失败，请检查网络连接');
            }
            setLoading(false);
            return;
          }
        }

        if (!file) {
          setError('文件不存在');
          setLoading(false);
          return;
        }

        // 检查文件是否在回收站中
        if (file.deletedAt) {
          setError('文件已被删除');
          setLoading(false);
          return;
        }

        if (!file.fileHash) {
          setError('文件尚未转换完成');
          setLoading(false);
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
              const rootResponse = await filesApi.getRoot(file.id);
              if (rootResponse.data?.id) {
                projectId = rootResponse.data.id;
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
          updatedAt: file.updatedAt,
        });
        setNavigateFunction(navigate);

        // 设置当前项目 ID（用于判断是否为私人空间模式）
        // 注意：公开资源库文件不设置 projectId，避免侧边栏"我的项目"Tab 显示资源库内容
        if (projectId && !libraryKeyParam) {
          setCurrentProjectId(projectId);
        } else if (!libraryKeyParam) {
          // 非公开资源库时，清空 projectId
          setCurrentProjectId(null);
        }

        // 构造 mxweb 文件访问 URL
        // 根据 libraryKey 选择对应的 API 路径：
        // - drawing: /api/library/drawing/filesData/...
        // - block: /api/library/block/filesData/...
        // - null (项目文件): /api/mxcad/filesData/...
        // 历史版本使用 ?v= 参数，最新版本使用 ?t={updatedAt} 确保获取服务器最新
        let mxcadFileUrl!: string;
        let cacheTimestamp: number | undefined;

        if (versionParam) {
          // 历史版本
          if (libraryKeyParam === 'drawing' || libraryKeyParam === 'block') {
            mxcadFileUrl = `/api/library/${libraryKeyParam}/filesData/${file.path}?v=${versionParam}`;
          } else {
            mxcadFileUrl = `/api/mxcad/filesData/${file.path}?v=${versionParam}`;
          }
          setCacheTimestamp(undefined); // 历史版本不需要清理缓存
        } else {
          if (file.updatedAt) {
            // 使用 updatedAt 时间戳作为缓存版本标识，确保获取最新文件
            cacheTimestamp = new Date(file.updatedAt).getTime();
            if (libraryKeyParam === 'drawing' || libraryKeyParam === 'block') {
              mxcadFileUrl = `/api/library/${libraryKeyParam}/filesData/${file.path}?t=${cacheTimestamp}`;
            } else {
              mxcadFileUrl = `/api/mxcad/filesData/${file.path}?t=${cacheTimestamp}`;
            }
            setCacheTimestamp(cacheTimestamp); // 设置缓存时间戳，用于清理旧缓存
          }
        }

        // 如果 MxCAD 已经创建（且不是第一次初始化）
        if (isInitializedRef.current && mxcadManager.isCreated()) {
          // 检查是否是同一个文件 URL（包括版本参数）
          if (loadedFileUrlRef.current === mxcadFileUrl) {
            // 同一个文件，只需显示编辑器
            mxcadManager.showMxCAD(true);
            setLoading(false);
            return;
          }

          // URL 变化了（可能是版本参数变化），需要重新加载文件
          console.log(
            `文件 URL 变化，重新加载: ${loadedFileUrlRef.current} -> ${mxcadFileUrl}`
          );

          // 重新加载 mxweb 文件
          await mxcadManager.openFile(mxcadFileUrl);
          mxcadManager.showMxCAD(true);

          // 更新已加载的文件 URL
          loadedFileUrlRef.current = mxcadFileUrl;
          currentFileIdRef.current = fileId;

          setLoading(false);
          return;
        }

        // 第一次初始化 MxCAD
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

        // 初始化 MxCAD 配置，传入当前文件信息以获取正确的父节点
        await initMxCADConfig(file);

        // 初始化 MxCAD 视图，传入 mxweb 文件 URL
        await mxcadManager.initializeMxCADView(mxcadFileUrl);
        mxcadManager.showMxCAD(true);

        // 初始化主题同步 - 监听 mxcad-app 主题变化
        await initThemeSync();

        // 标记为已初始化
        isInitializedRef.current = true;
        loadedFileUrlRef.current = mxcadFileUrl;
        currentFileIdRef.current = fileId;

        setLoading(false);
        
        // 检查外部参照
        try {
          // 如果已登录且有文件ID，使用nodeId检查
          if (isAuthenticated && fileId && !libraryKeyParam) {
            // shouldRetry = false，因为文件已经存在了，不需要等待生成
            // forceOpen = false，如果没有外部参照不弹框
            await externalReferenceUpload.checkMissingReferences(fileId, false, false);
          }
          // 如果未登录且有文件hash，使用hash检查
          else if (!isAuthenticated && file.fileHash) {
            // 保存文件hash到state
            setCurrentFileHash(file.fileHash);
            // shouldRetry = false，forceOpen = false
            await externalReferenceUpload.checkMissingReferences(file.fileHash, false, false);
          }
        } catch (error) {
          console.error('外部参照检查失败:', error);
        }
      } catch (err) {
        console.error('加载文件失败:', err);
        setError('CAD编辑器初始化失败');
        setLoading(false);
      }
    };

    loadFile();
  }, [fileId, isActive, versionParam, navigate, externalReferenceUpload, isAuthenticated]);
  
  // 监听公开文件上传事件，上传完成后检查外部参照
  useEffect(() => {
    const handlePublicFileUploaded = (event: CustomEvent<{ 
      fileHash: string; 
      fileName?: string; 
      noCache?: boolean; 
      callback?: () => Promise<void> 
    }>) => {
      const { fileHash, callback } = event.detail;
      setCurrentFileHash(fileHash);
      
      // 保存回调函数到 ref，在外部参照操作完成后调用
      openFileCallbackRef.current = callback || null;
      
      // 等待一小会儿，让文件先加载完成
      setTimeout(async () => {
        try {
          // shouldRetry = true，因为刚上传文件，需要等待生成 preloading.json
          // forceOpen = false，如果没有外部参照不弹框
          const hasMissingReferences = await externalReferenceUpload.checkMissingReferences(fileHash, true, false);
          
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
      }, 1000);
    };
    
    window.addEventListener('public-file-uploaded', handlePublicFileUploaded as EventListener);
    
    return () => {
      window.removeEventListener('public-file-uploaded', handlePublicFileUploaded as EventListener);
    };
  }, [externalReferenceUpload]);

  // 主页模式初始化（/ 路由，初始化空白编辑器）
  useEffect(() => {
    if (!isHomeMode || !isActive) return;

    // 防止重复初始化
    const initKey = 'mxcad_home_init_started';
    if ((window as unknown as { [key: string]: boolean })[initKey]) {
      return;
    }

    // 立即标记开始，避免 setTimeout 期间重复触发
    (window as unknown as { [key: string]: boolean })[initKey] = true;

    // 立即显示加载状态，避免先显示空白侧边栏再闪烁到加载动画
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const { mxcadManager } = await import('../services/mxcadManager');

        // 如果 MxCAD 已经创建，直接显示
        if (mxcadManager.isCreated()) {
          mxcadManager.showMxCAD(true);
          isInitializedRef.current = true;
          setLoading(false);
          return;
        }

        // 加载 MxCAD 依赖
        // @ts-expect-error - mxcad-app 没有类型定义
        await import('mxcad-app/style');

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

        // 标记已初始化
        isInitializedRef.current = true;
        setLoading(false);
      } catch (err) {
        console.error('初始化 CAD 编辑器失败:', err);
        // 重置标记，允许重试
        (window as unknown as { [key: string]: boolean })[initKey] = false;
        setError('CAD 编辑器初始化失败，请刷新页面重试');
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [isHomeMode, isActive]);

  // 监听保存/另存为事件，未登录时显示登录提示
  useEffect(() => {
    const handleSaveRequired = (event: CustomEvent<{ action: string }>) => {
      if (loginPromptDismissedRef.current) return;

      if (!isAuthenticated) {
        setLoginPromptAction(event.detail?.action || '保存文件');
        setShowLoginPrompt(true);
        event.preventDefault();
      }
    };

    saveRequiredHandlerRef.current = handleSaveRequired;

    window.addEventListener(
      'mxcad-save-required',
      handleSaveRequired as EventListener
    );
    window.addEventListener(
      'mxcad-saveas-required',
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
  }, [isAuthenticated, showToast]);

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

  // 监听导出事件
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
        loginPromptActionRef.current = '另存为';
        setLoginPromptAction('另存为');
        setShowLoginPrompt(true);
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
    showToast('文件保存成功', 'success');

    // 重新打开保存后的文件
    const { openUploadedFile, processPendingImages } = await import('../services/mxcadManager');
    await openUploadedFile(result.nodeId, result.parentId);

    // 处理待上传图片
    await processPendingImages();

    // 更新当前文件 ID
    currentFileIdRef.current = result.nodeId;
  };

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
      } else {
        // 公开资源库文件，清空 projectId
        setCurrentProjectId(null);
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
      // 重置当前文件 ID
      currentFileIdRef.current = null;
    };

    window.addEventListener('mxcad-new-file', handleNewFile as EventListener);

    return () => {
      window.removeEventListener(
        'mxcad-new-file',
        handleNewFile as EventListener
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
      const targetFileResponse = await filesApi.get(file.nodeId);
      const targetFile = targetFileResponse.data as {
        deletedAt?: string | null;
      };

      // 检查目标文件是否在回收站中
      if (targetFile.deletedAt) {
        return;
      }

      // 获取当前文件信息，确定 uploadTargetNodeId
      const currentFileId = currentFileIdRef.current;
      if (!currentFileId) return;

      const fileResponse = await filesApi.get(currentFileId);
      const currentFile = fileResponse.data as {
        parentId?: string | null;
        id?: string;
        isRoot?: boolean;
      };

      // 确定 uploadTargetNodeId：优先使用 parentId，如果是根节点则使用 id
      let uploadTargetNodeId = currentFile.parentId || '';
      if (currentFile.isRoot && currentFile.id) {
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
    pdfOptions?: PdfOptions
  ) => {
    try {
      setDownloading(true);
      const response = await filesApi.downloadWithFormat(
        downloadingNodeId,
        format,
        pdfOptions
      );

      const blob = new Blob([response.data as BlobPart]);
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
        zIndex: isActive ? 9999 : -1,
        pointerEvents: isActive ? 'auto' : 'none',
        background: 'transparent',
      }}
    >
      {error && (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="text-red-500 text-lg mb-4">{error}</div>
          <button
            onClick={handleGoBack}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            {isHomeMode ? '刷新页面' : '返回项目列表'}
          </button>
        </div>
      )}

      {loading && !error && (
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
      )}

      {!loading && !error && isActive && (
        <div
          className="flex w-full h-screen relative"
          style={{
            // 设置与侧边栏一致的背景色，避免拖拽时露出空白
            // 深色主题使用 --sidebar-bg (#3A4352)，亮色主题使用 --bg-secondary (#ffffff)
            background: 'var(--sidebar-bg, var(--bg-secondary))',
          }}
        >
          {/* 侧边栏容器 - 始终渲染 */}
          <SidebarContainer
            projectId={
              isHomeMode ? personalSpaceId || '' : currentProjectId || ''
            }
            onInsertFile={handleInsertFile}
          />

          {/* CAD编辑器内容区域 */}
          <div className="flex-1 relative">
            {/* 返回功能通过 MxCAD 命令实现：MxFun.execCmd("return-to-cloud-map-management") */}

            {/* 下载格式选择弹窗 */}
            <DownloadFormatModal
              isOpen={showDownloadFormatModal}
              fileName={downloadingFileName}
              onClose={() => setShowDownloadFormatModal(false)}
              onDownload={handleDownloadWithFormat}
              loading={downloading}
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
        onClose={externalReferenceUpload.close}
      />
      </div>
    );
  };

export default CADEditorDirect;
