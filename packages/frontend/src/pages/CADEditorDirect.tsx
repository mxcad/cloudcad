import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import {
  SidebarProvider,
  useSidebarManager,
  SidebarType,
} from '../contexts/SidebarContext';
import { ProjectPermission } from '../constants/permissions';
import { filesApi } from '../services/filesApi';
import { DownloadFormatModal } from '../components/modals/DownloadFormatModal';
import CADEditorSidebar from '../components/CADEditorSidebar';
import CollaborateSidebar from '../components/CollaborateSidebar';
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

export const CADEditorDirect: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useNotification();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shouldLoadEditor, setShouldLoadEditor] = useState(false);

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

  // 从URL获取文件ID
  const fileId = location.pathname.split('/').pop() || '';

  // 从 URL 获取项目 ID
  const urlProjectId = React.useMemo(() => {
    const match = location.pathname.match(/\/projects\/([^/]+)/);
    return match ? match[1] : '';
  }, [location.pathname]);

  // 从 URL 获取版本参数（用于访问历史版本）
  const versionParam = React.useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get('v');
  }, [location.search]);

  // 加载 CAD 权限
  useEffect(() => {
    if (!urlProjectId) return;

    const checkPermissions = async () => {
      try {
        const { projectsApi } = await import('../services/projectsApi');
        const [saveRes, exportRes, externalRefRes] = await Promise.all([
          projectsApi.checkPermission(urlProjectId, ProjectPermission.CAD_SAVE),
          projectsApi.checkPermission(urlProjectId, ProjectPermission.CAD_EXPORT),
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
          getServerConfig: () => { uploadFileConfig?: { create?: { formData?: Record<string, string> } } };
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

  useEffect(() => {
    if (!fileId) {
      setError('未找到文件ID');
      setLoading(false);
      return;
    }

    // 延迟加载，确保页面渲染完成后再加载编辑器
    const timer = setTimeout(() => {
      setShouldLoadEditor(true);
    }, 100);

    return () => clearTimeout(timer);
  }, [fileId]);

  useEffect(() => {
    if (!shouldLoadEditor) return;

    const initEditor = async () => {
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

        if (!file.isRoot && file.parentId) {
          try {
            if (!file.id) throw new Error('节点ID缺失')
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
        });
        setNavigateFunction(navigate);

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
            // 同一个文件，无需重新加载
            setLoading(false);
            return;
          }

          // URL 变化了（可能是版本参数变化），需要重新加载文件
          const { mxcadManager } = await loadMxCADDependencies();

          console.log(
            `文件 URL 变化，重新加载: ${loadedFileUrlRef.current} -> ${mxcadFileUrl}`
          );

          // 重新加载 mxweb 文件
          await mxcadManager.openFile(mxcadFileUrl);

          // 更新已加载的文件 URL
          loadedFileUrlRef.current = mxcadFileUrl;

          setLoading(false);
          return;
        }

        // 按需加载 MxCAD 依赖
        const { mxcadManager } = await loadMxCADDependencies();

        // 初始化 MxCAD 配置，传入当前文件信息以获取正确的父节点
        await initMxCADConfig(file);

        // 第一次初始化时传入正确的 mxweb 文件 URL
        await mxcadManager.initializeMxCADView(mxcadFileUrl);
        mxcadManager.showMxCAD(true);

        // 标记为已初始化
        isInitializedRef.current = true;
        loadedFileUrlRef.current = mxcadFileUrl;

        setLoading(false);
      } catch (err) {
        console.log(err);
        setError('CAD编辑器初始化失败');
        setLoading(false);
      }
    };

    initEditor();

    // 监听导出事件
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
      // 移除事件监听
      window.removeEventListener('mxcad-export-file', handleExportEvent);

      // 注意：不在这里清理 MxCAD，避免 URL 更新时白屏闪烁
      // MxCAD 是全局单例，会在组件卸载时自动清理
      // 只清理文件信息
      if (isInitializedRef.current) {
        import('../services/mxcadManager').then(({ clearCurrentFileInfo }) => {
          clearCurrentFileInfo(); // 清除文件信息
        });
      }
    };
  }, [shouldLoadEditor, user, location.search]); // 移除 fileId 依赖

  // 单独的 effect 监听 fileId 变化，只更新 currentFileInfo
  useEffect(() => {
    if (!shouldLoadEditor || !isInitializedRef.current) return;

    const updateFileInfo = async () => {
      try {
        const fileResponse = await filesApi.get(fileId);
        const file = fileResponse.data

        // 检查文件是否在回收站中
        if (file.deletedAt) {
          return;
        }

        if (!file.fileHash) {
          return;
        }

        const { setCurrentFileInfo } = await import('../services/mxcadManager');

        // 获取项目根节点 ID
        let projectId = file.parentId || null;
        if (!file.isRoot && file.parentId) {
          try {
            const rootResponse = await filesApi.getRoot(file.id);
            if (rootResponse.data?.id) {
              projectId = rootResponse.data.id;
            }
          } catch (error) {
            console.error('获取根节点失败:', error);
          }
        } else if (file.isRoot) {
          projectId = file.id;
        }

        setCurrentFileInfo({
          fileId: file.id,
          parentId: file.parentId || null,
          projectId,
          name: file.name,
        });
      } catch (error) {
        console.error('更新文件信息失败:', error);
      }
    };

    updateFileInfo();
  }, [fileId, shouldLoadEditor]);

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
      const fileResponse = await filesApi.get(fileId);
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
      // 路径部分：新打开的文件 ID
      // nodeId 参数：保持不变（所在目录）
      window.history.replaceState(
        null,
        '',
        `/cad-editor/${file.nodeId}?nodeId=${uploadTargetNodeId}`
      );

      // 调用 openUploadedFile 打开文件，保持与 openFile 命令完全一致的行为
      await openUploadedFile(file.nodeId, uploadTargetNodeId);
    } catch (error) {
      console.error('打开文件失败:', error);
      showToast(error instanceof Error ? error.message : '打开文件失败', 'error');
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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-red-500 text-lg mb-4">{error}</div>
        <button
          onClick={() => navigate('/projects')}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          返回项目列表
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">正在加载 CAD 编辑器...</p>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <CADEditorContent
        onInsertFile={handleInsertFile}
        showDownloadFormatModal={showDownloadFormatModal}
        downloadingFileName={downloadingFileName}
        downloading={downloading}
        onCloseDownloadModal={() => setShowDownloadFormatModal(false)}
        onDownloadWithFormat={handleDownloadWithFormat}
      />
    </SidebarProvider>
  );
};

/**
 * CAD 编辑器内容组件
 * 在 SidebarProvider 内部，可以使用 useSidebarManager
 */
interface CADEditorContentProps {
  onInsertFile: (file: { nodeId: string; filename: string }) => void;
  showDownloadFormatModal: boolean;
  downloadingFileName: string;
  downloading: boolean;
  onCloseDownloadModal: () => void;
  onDownloadWithFormat: (
    format: DownloadFormat,
    pdfOptions?: PdfOptions
  ) => void;
}

const CADEditorContent: React.FC<CADEditorContentProps> = ({
  onInsertFile,
  showDownloadFormatModal,
  downloadingFileName,
  downloading,
  onCloseDownloadModal,
  onDownloadWithFormat,
}) => {
  const { openSidebar } = useSidebarManager();

  // 监听 MxCAD 命令触发的侧边栏事件
  useEffect(() => {
    const handleOpenSidebar = (event: Event) => {
      const customEvent = event as CustomEvent<{ type: SidebarType }>;
      if (customEvent.detail?.type) {
        openSidebar(customEvent.detail.type);
      }
    };

    window.addEventListener('mxcad-open-sidebar', handleOpenSidebar);

    return () => {
      window.removeEventListener('mxcad-open-sidebar', handleOpenSidebar);
    };
  }, [openSidebar]);

  return (
    <div className="flex w-full h-screen relative">
      {/* 图库侧边栏 */}
      <CADEditorSidebar onInsertFile={onInsertFile} />

      {/* 协同侧边栏 */}
      <CollaborateSidebar />

      {/* CAD编辑器内容区域 */}
      <div className="flex-1 relative">
        {/* 返回功能通过 MxCAD 命令实现：MxFun.execCmd("return-to-cloud-map-management") */}

        {/* 下载格式选择弹窗 */}
        <DownloadFormatModal
          isOpen={showDownloadFormatModal}
          fileName={downloadingFileName}
          onClose={onCloseDownloadModal}
          onDownload={onDownloadWithFormat}
          loading={downloading}
        />
      </div>
    </div>
  );
};
