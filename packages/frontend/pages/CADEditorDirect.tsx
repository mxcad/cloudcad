import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { mxcadApp } from 'mxcad-app';
import 'mxcad-app/style';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';
import { mxcadManager } from '../services/mxcadManager';

// 全局类型定义
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

interface CADEditorDirectProps {
  fileUrl?: string;
}

interface ProjectContext {
  projectId?: string;
  parentId?: string;
}

// 初始化 MxCAD 配置
const initMxCadConfig = () => {
  try {
    // 使用绝对路径确保配置文件正确加载
    const configUrl = window.location.origin;

    mxcadApp.setStaticAssetPath("/mxcadAppAssets/")
    mxcadApp.initConfig({
      uiConfig: `${configUrl}/ini/myUiConfig.json`,
      sketchesUiConfig: `${configUrl}/ini/mySketchesAndNotesUiConfig.json`,
      serverConfig: `${configUrl}/ini/myServerConfig.json`,
      quickCommandConfig: `${configUrl}/ini/myQuickCommand.json`,
      themeConfig: `${configUrl}/ini/myVuetifyThemeConfig.json`
    });
    console.log('[CADEditorDirect] ✅ MxCAD 配置初始化成功');
    return true;
  } catch (error) {
    console.error('[CADEditorDirect] ❌ MxCAD 配置初始化失败:', error);
    // 如果配置加载失败，尝试使用默认配置
    try {
      mxcadApp.initConfig({});
      console.log('[CADEditorDirect] ✅ MxCAD 默认配置初始化成功');
      return true;
    } catch (defaultError) {
      console.error('[CADEditorDirect] ❌ MxCAD 默认配置初始化也失败:', defaultError);
      return false;
    }
  }
};

export const CADEditorDirect: React.FC<CADEditorDirectProps> = ({ fileUrl }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [isMxCADReady, setIsMxCADReady] = useState(false);
  const [projectContext, setProjectContext] = useState<ProjectContext>({});
  const [configInitialized, setConfigInitialized] = useState(false);

  // 从 URL 参数获取文件 ID
  const pathSegments = location.pathname.split('/');
  console.log('[CADEditorDirect] 路径段:', pathSegments);

  // 路由格式: /cad-editor/:fileId
  const urlFileId = pathSegments[pathSegments.length - 1] || fileUrl;

  console.log('[CADEditorDirect] 组件渲染 - fileUrl:', fileUrl, 'urlFileId:', urlFileId);
  console.log('[CADEditorDirect] 完整路径:', location.pathname);

  // 解析项目上下文
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const projectId = searchParams.get('project');
    const parentId = searchParams.get('parent');

    if (projectId || parentId) {
      const context: ProjectContext = {
        projectId: projectId || undefined,
        parentId: parentId || undefined,
      };
      setProjectContext(context);
      console.log('[CADEditorDirect] 📋 项目上下文:', context);
    }
  }, [location.search]);

  // 创建 Session（如果用户已登录且有项目上下文）
  useEffect(() => {
    if (isAuthenticated && user && (projectContext.projectId || projectContext.parentId)) {
      const createSession = async () => {
        try {
          await apiService.post('/session/create', { user });
          console.log('[CADEditorDirect] ✅ Session 创建成功，项目上下文已设置');
        } catch (error) {
          console.error('[CADEditorDirect] ❌ Session 创建错误:', error);
        }
      };

      createSession();
    }
  }, [isAuthenticated, user, projectContext]);

  // 初始化 MxCAD 配置
  useEffect(() => {
    if (!configInitialized) {
      const success = initMxCadConfig();
      setConfigInitialized(success);
    }
  }, [configInitialized]);

  // 通过文件系统节点ID获取文件信息
  const getFileInfo = async (nodeId: string) => {
    try {
      const fileData = await apiService.get(`/file-system/nodes/${nodeId}`);
      console.log('[CADEditorDirect] 📄 文件信息:', fileData);
      console.log('[CADEditorDirect] 📄 文件详细信息:', fileData.data);
      return fileData.data; // 返回实际的数据，而不是整个响应对象
    } catch (error) {
      console.error('[CADEditorDirect] ❌ 获取文件信息错误:', error);
      return null;
    }
  };

  // 初始化 MxCADView（使用永不销毁的全局管理器）
  useEffect(() => {
    if (!configInitialized) return;

    console.log('[CADEditorDirect] 🚀 初始化 MxCADView（永不销毁容器）');

    const initMxCAD = async () => {
      try {
        // 使用全局管理器初始化或复用实例（不传递容器，使用永不销毁的容器）
        const view = await mxcadManager.initializeMxCADView();
        setIsMxCADReady(true);
        console.log('[CADEditorDirect] ✅ MxCADView 初始化完成');
      } catch (error) {
        console.error('[CADEditorDirect] ❌ MxCADView 初始化失败:', error);
        setIsMxCADReady(false);
      }
    };

    initMxCAD();
  }, [configInitialized]);

  // 组件挂载时显示 MxCAD，卸载时隐藏（但不销毁）
  useEffect(() => {
    // 组件挂载时显示 MxCAD
    mxcadManager.showMxCAD(true);
    console.log('[CADEditorDirect] 👁️ 显示 MxCAD 容器');

    // 组件卸载时隐藏 MxCAD（但不销毁）
    return () => {
      mxcadManager.showMxCAD(false);
      console.log('[CADEditorDirect] 👁️ 隐藏 MxCAD 容器（保持实例）');
    };
  }, []);

  // 动态设置 MxCAD 服务器配置
  useEffect(() => {
    if (isMxCADReady && user && projectContext.projectId) {
      const setupServerConfig = async () => {
        try {
          // 获取当前配置
          const serverConfig = await ((window as any).MxPluginContext).getServerConfig();
          
          // 修改上传配置，添加项目上下文参数
          if (serverConfig?.uploadFileConfig?.create) {
            // 保存原始的 formData
            const originalFormData = serverConfig.uploadFileConfig.create.formData || {};
            
            // 添加项目上下文到 formData
            serverConfig.uploadFileConfig.create.formData = {
              ...originalFormData,
              mxcadUserId: user.id,
              mxcadProjectId: projectContext.projectId,
              mxcadParentId: projectContext.parentId || '',
              mxcadUserRole: user.role,
            };
            
            console.log('[CADEditorDirect] 📋 修改 MxCAD 服务器配置，添加上下文参数:', serverConfig.uploadFileConfig.create.formData);
          }
        } catch (error) {
          console.error('[CADEditorDirect] ❌ 设置服务器配置失败:', error);
        }
      };

      setupServerConfig();
    }
  }, [isMxCADReady, user, projectContext]);

  // 文件切换（使用全局管理器）
  useEffect(() => {
    if (isMxCADReady && urlFileId) {
      const openFile = async () => {
        try {
          // 获取文件信息
          const fileInfo = await getFileInfo(urlFileId);
          if (!fileInfo) {
            console.error('[CADEditorDirect] ❌ 无法获取文件信息');
            return;
          }

          // 检查文件状态和哈希值
          if (fileInfo.fileStatus && fileInfo.fileStatus !== 'COMPLETED') {
            console.error('[CADEditorDirect] ❌ 文件尚未转换完成:', fileInfo.fileStatus);
            const statusText = {
              'UPLOADING': '正在上传',
              'PROCESSING': '正在处理',
              'FAILED': '处理失败',
              'DELETED': '已删除'
            };
            alert(`文件状态: ${statusText[fileInfo.fileStatus] || fileInfo.fileStatus}`);
            return;
          }

          // 如果 fileStatus 为 null 或 undefined，可能是旧数据，尝试直接打开
          if (!fileInfo.fileStatus) {
            console.warn('[CADEditorDirect] ⚠️ 文件状态为空，尝试直接打开文件');
          }

          if (!fileInfo.fileHash) {
            console.error('[CADEditorDirect] ❌ 文件哈希值不存在');
            alert('文件哈希值不存在，无法打开文件');
            return;
          }

          // 构建正确的 MxCAD 文件访问 URL - 使用 fileHash 构建 mxweb 文件名
          const mxwebFileName = `${fileInfo.fileHash}.mxweb`;
          const mxcadFileUrl = `/mxcad/file/${mxwebFileName}`;
          console.log('[CADEditorDirect] 📂 打开文件:', mxcadFileUrl);
          console.log('[CADEditorDirect] 📄 原始文件:', fileInfo.originalName);
          console.log('[CADEditorDirect] 🔑 文件哈希:', fileInfo.fileHash);

          // 使用全局管理器打开文件
          await mxcadManager.openFile(mxcadFileUrl);
        } catch (error) {
          console.error('[CADEditorDirect] ❌ 打开文件失败:', error);
        }
      };

      openFile();
    }
  }, [urlFileId, isMxCADReady]);

  // 全局 MxCADView 实例复用
  useEffect(() => {
    // 不进行清理，保持实例复用
    console.log('[CADEditorDirect] 🔄 保持 MxCADView 实例复用');
  }, [mxcadView]);

  if (!configInitialized) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="mt-4">正在初始化 CAD 编辑器...</p>
      </div>
    );
  }

  if (!isMxCADReady) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="mt-4">正在加载 MxCAD 引擎...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        position: 'relative',
      }}
    >
      {/* 返回按钮 */}
      <button
        onClick={() => navigate('/projects')}
        className="fixed top-4 left-4 z-[9999] flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50 text-sm font-medium text-slate-700"
      >
        <ArrowLeft size={16} />
        返回项目列表
      </button>

      {/* MxCAD 现在使用全局容器，这里不需要本地容器 */}
      {/* 全局容器由 mxcadManager 自动创建和管理 */}
    </div>
  );
};