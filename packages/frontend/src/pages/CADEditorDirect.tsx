/**
 * GlobalCADEditor - 全局 CAD 编辑器覆盖层
 *
 * 此组件作为全局覆盖层挂载在 App 根层级，始终存在于 DOM 中。
 * 通过监听路由变化来控制显示/隐藏：
 * - 路由匹配 /cad-editor/:fileId 时显示编辑器并加载文件
 * - 路由不匹配时隐藏编辑器
 *
 * 使用 visibility: hidden + z-index 方案控制显示，保护 WebGL 上下文不被销毁。
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { ProjectPermission } from '../constants/permissions';
import { filesApi } from '../services/filesApi';
import { projectsApi } from '../services/projectsApi';
import { DownloadFormatModal } from '../components/modals/DownloadFormatModal';
import { SidebarContainer } from '../components/sidebar/SidebarContainer';
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

export const CADEditorDirect: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { showToast } = useNotification();

  // 是否激活（路由匹配 /cad-editor/:fileId）
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 当前文件 ID
  const currentFileIdRef = useRef<string | null>(null);

  // 标记是否已初始化 MxCAD，避免重复初始化
  const isInitializedRef = useRef(false);

  // 记录已加载的文件 URL（包含版本参数），用于检测 URL 变化
  const loadedFileUrlRef = useRef<string | null>(null);

  // 下载格式弹窗状态
  const [showDownloadFormatModal, setShowDownloadFormatModal] = useState(false);
  const [downloadingNodeId, setDownloadingNodeId] = useState<string>('');
  const [downloadingFileName, setDownloadingFileName] = useState<string>('');
  const [downloading, setDownloading] = useState(false);

  // CAD 权限状态
  const [canSave, setCanSave] = useState(false);
  const [canExport, setCanExport] = useState(false);
  const [canManageExternalRef, setCanManageExternalRef] = useState(false);

  // 从当前路由解析 fileId
  const fileId = parseCADEditorRoute(location.pathname);

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
  const [personalSpaceId, setPersonalSpaceId] = React.useState<string | null>(null);
  // 当前文件所属项目 ID
  const [currentProjectId, setCurrentProjectId] = React.useState<string | null>(null);

  // 获取私人空间 ID
  useEffect(() => {
    if (!isAuthenticated) return;
    projectsApi.getPersonalSpace().then((res) => {
      if (res.data?.id) {
        setPersonalSpaceId(res.data.id);
        // 同时缓存到 mxcadManager，用于 openUploadedFile 等函数
        import('../services/mxcadManager').then(({ setPersonalSpaceId: setCachedPersonalSpaceId }) => {
          setCachedPersonalSpaceId(res.data?.id || null);
        });
      }
    }).catch(console.error);
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

  /**
   * 初始化主题同步 - 监听 mxcad-app 的 Vuetify 主题变化
   * 当 mxcad-app 切换主题时，通过 CustomEvent 通知 React ThemeContext
   */
  const initThemeSync = async () => {
    try {
      const { mxcadApp } = await import('mxcad-app');
      const vuetify = await mxcadApp.getVuetify();

      // 动态导入 Vue 的 watch 函数
      const { watch } = await import('vue');

      console.log('[ThemeSync] 开始监听 mxcad-app 主题变化');

      // 使用 Vue watch 监听 Vuetify 主题变化
      watch(
        () => vuetify.theme.global.name.value,
        (themeName) => {
          const isDark = themeName === 'dark';
          console.log(`[ThemeSync] mxcad-app 主题变化: ${themeName} -> isDark: ${isDark}`);

          // 派发事件通知 React ThemeContext
          window.dispatchEvent(
            new CustomEvent('mxcad-theme-changed', {
              detail: { isDark },
            })
          );

          // 双保险：直接更新 DOM
          document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
          document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
          localStorage.setItem('mx-user-dark', String(isDark));

          console.log('[ThemeSync] 已派发 mxcad-theme-changed 事件并更新 DOM');
        },
        { immediate: true }
      );

      console.log('[ThemeSync] 主题同步监听已设置完成');
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

      // 验证节点信息
      if (!nodeId) {
        // 显示用户提示
        const existingWarning = document.getElementById(
          'mxcad-context-warning'
        );
        if (!existingWarning) {
          const warning = document.createElement('div');
          warning.id = 'mxcad-context-warning';
          warning.style.cssText = `
            position: fixed;
            top: 60px;
            right: 20px;
            background: #fef2f2;
            border: 1px solid #fecaca;
            color: #dc2626;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 9999;
            max-width: 300px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          `;
          warning.innerHTML = `
            <strong>⚠️ 上传功能已禁用</strong><br>
            缺少节点上下文，请通过文件管理页面访问CAD编辑器。
          `;
          document.body.appendChild(warning);
        }
      } else {
        // 移除警告提示（如果存在）
        const existingWarning = document.getElementById(
          'mxcad-context-warning'
        );
        if (existingWarning) {
          existingWarning.remove();
        }
      }

      serverConfig.uploadFileConfig.create.formData = {
        ...serverConfig.uploadFileConfig.create.formData,
        nodeId: nodeId,
      };

      // Authorization header 由 apiService 拦截器统一处理
    }
  };

  // 隐藏编辑器
  const hideEditor = useCallback(async () => {
    setIsActive(false);
    setLoading(false);
    setError(null);

    // 调用 mxcadManager 隐藏编辑器
    try {
      const { mxcadManager } = await loadMxCADDependencies();
      mxcadManager.showMxCAD(false);
    } catch (err) {
      console.error('隐藏编辑器失败:', err);
    }
  }, []);

  // 监听路由变化，控制编辑器显示/隐藏
  useEffect(() => {
    if (fileId && isAuthenticated) {
      // 路由匹配 /cad-editor/:fileId 且已登录，显示编辑器
      setIsActive(true);
    } else {
      // 路由不匹配或未登录，隐藏编辑器
      hideEditor();
    }
  }, [fileId, isAuthenticated, hideEditor]);

  // 当 fileId 变化时加载文件
  useEffect(() => {
    if (!fileId || !isActive) return;

    const loadFile = async () => {
      setLoading(true);
      setError(null);

      try {
        // 获取文件信息
        const fileResponse = await filesApi.get(fileId);
        const file = fileResponse.data as {
          fileHash?: string;
          path?: string;
          parentId?: string | null;
          id?: string;
          isRoot?: boolean;
          name?: string;
          deletedAt?: string | null;
          updatedAt?: string;
        };

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
        const { setCurrentFileInfo, setNavigateFunction, setCacheTimestamp, mxcadManager } =
          await import('../services/mxcadManager');

        // 获取项目根节点 ID
        let projectId: string | null | undefined = file.parentId || null;

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

        setCurrentFileInfo({
          fileId: file.id || '',
          parentId: file.parentId || null,
          projectId,
          name: file.name || '',
          personalSpaceId,
        });
        setNavigateFunction(navigate);

        // 设置当前项目 ID（用于判断是否为私人空间模式）
        if (projectId) {
          setCurrentProjectId(projectId);
        }

        // 构造 mxweb 文件访问 URL
        // 历史版本使用 ?v= 参数，最新版本使用 ?t={updatedAt} 确保获取服务器最新
        let mxcadFileUrl!: string;
        let cacheTimestamp: number | undefined;
        if (versionParam) {
          mxcadFileUrl = `/api/mxcad/filesData/${file.path}?v=${versionParam}`;
          setCacheTimestamp(undefined); // 历史版本不需要清理缓存
        } else {
          if (file.updatedAt) {
            // 使用 updatedAt 时间戳作为缓存版本标识，确保获取最新文件
            cacheTimestamp = new Date(file.updatedAt).getTime();
            mxcadFileUrl = `/api/mxcad/filesData/${file.path}?t=${cacheTimestamp}`;
            setCacheTimestamp(cacheTimestamp); // 设置缓存时间戳，用于清理旧缓存
          }
        }

        // 如果已经初始化过 MxCAD
        if (isInitializedRef.current) {
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

        // 按需加载 MxCAD 依赖
        const deps = await loadMxCADDependencies();

        // 初始化 MxCAD 配置，传入当前文件信息以获取正确的父节点
        await initMxCADConfig(file);

        // 第一次初始化时传入正确的 mxweb 文件 URL
        await deps.mxcadManager.initializeMxCADView(mxcadFileUrl);
        deps.mxcadManager.showMxCAD(true);

        // 初始化主题同步 - 监听 mxcad-app 主题变化
        await initThemeSync();

        // 标记为已初始化
        isInitializedRef.current = true;
        loadedFileUrlRef.current = mxcadFileUrl;
        currentFileIdRef.current = fileId;

        setLoading(false);
      } catch (err) {
        console.error('加载文件失败:', err);
        setError('CAD编辑器初始化失败');
        setLoading(false);
      }
    };

    loadFile();
  }, [fileId, isActive, versionParam, navigate]);

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

  // 监听文件打开事件，更新 URL（保留 mode 参数）
  useEffect(() => {
    const handleFileOpened = (
      event: CustomEvent<{
        fileId: string;
        parentId: string;
        projectId: string;
      }>
    ) => {
      const { fileId, parentId, projectId } = event.detail;
      // 更新当前项目 ID（用于判断是否为私人空间模式）
      setCurrentProjectId(projectId);
      // 更新浏览器 URL
      window.history.replaceState(
        null,
        '',
        `/cad-editor/${fileId}?nodeId=${parentId}`
      );
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

  // 处理从图库插入文件
  const handleInsertFile = async (file: {
    nodeId: string;
    filename: string;
  }) => {
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

  // 错误处理：返回项目列表或私人空间
  const handleGoBack = () => {
    if (isPersonalSpaceMode) {
      navigate('/personal-space');
    } else {
      navigate('/projects');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-white"
      style={{
        visibility: isActive ? 'visible' : 'hidden',
        zIndex: isActive ? 9999 : -1,
        pointerEvents: isActive ? 'auto' : 'none',
      }}
    >
      {error && (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="text-red-500 text-lg mb-4">{error}</div>
          <button
            onClick={handleGoBack}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            返回项目列表
          </button>
        </div>
      )}

      {loading && !error && (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">正在加载 CAD 编辑器...</p>
        </div>
      )}

      {!loading && !error && isActive && (
        <div className="flex w-full h-screen relative">
          {/* 侧边栏容器 */}
          {currentProjectId && (
            <SidebarContainer
              projectId={currentProjectId}
              onInsertFile={handleInsertFile}
            />
          )}

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
    </div>
  );
};

export default CADEditorDirect;