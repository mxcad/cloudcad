import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shouldLoadEditor, setShouldLoadEditor] = useState(false);

  // 从URL获取文件ID
  const fileId = location.pathname.split('/').pop() || '';

  const loadMxCADDependencies = async () => {
    //@ts-ignore
    await import('mxcad-app/style');
    const { mxcadManager } = await import('../services/mxcadManager');
    return { mxcadManager };
  };

  const initMxCADConfig = async () => {
    const { mxcadApp } = await import('mxcad-app');
    const configUrl = window.location.origin;

    console.log('⚙️ 初始化MxCAD配置');
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
      window as any
    ).MxPluginContext.getServerConfig();
    if (serverConfig?.uploadFileConfig?.create) {
      const projectId =
        new URLSearchParams(location.search).get('project') || '';
      const parentId = new URLSearchParams(location.search).get('parent') || '';

      console.log('🔧 设置服务器配置', {
        projectId,
        parentId,
        search: location.search,
      });

      // 验证项目信息
      if (!projectId) {
        console.error('❌ 缺少项目ID，无法正确上传文件到文件系统');
        console.error(
          '❌ 请确保通过文件管理页面访问CAD编辑器，而不是直接访问URL'
        );

        // 禁用上传功能
        serverConfig.uploadFileConfig.create.beforeSend = function () {
          alert(
            '❌ 缺少项目上下文，无法上传文件。\n\n请通过文件管理页面访问CAD编辑器，确保文件能正确保存到项目中。'
          );
          return false; // 阻止上传
        };

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
            缺少项目上下文，请通过文件管理页面访问CAD编辑器。
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
        projectId: projectId,
        parentId: parentId,
      };

      const token = localStorage.getItem('accessToken');
      if (token) {
        // 为上传配置添加认证头
        serverConfig.uploadFileConfig.create.headers = {
          ...serverConfig.uploadFileConfig.create.headers,
          Authorization: `Bearer ${token}`,
        };
        console.log('✅ 已为 MxCAD 上传配置添加认证头');

        // 文件检查请求保持原始配置，MxCAD会自动使用upload配置中的认证头
        console.log('✅ MxCAD 文件检查请求将使用upload配置中的认证头');
      }
    }
  };

  useEffect(() => {
    console.log('🔍 CAD编辑器页面加载', {
      fileId,
      pathname: location.pathname,
      search: location.search,
    });

    // 尽早设置MxCAD认证拦截器，确保所有MxCAD网络请求都携带认证头

    const setupMxCADAuth = async () => {
      const token = localStorage.getItem('accessToken');

      if (!token) {
        console.warn('⚠️ 未找到JWT token，MxCAD文件访问可能失败');

        return;
      }

      console.log('🔐 设置MxCAD认证拦截器');

      // 手动调用 MxCADManager 的认证拦截器设置

      const { mxcadManager } = await import('../services/mxcadManager');

      mxcadManager.setupAuthInterceptor();

      console.log('✅ JWT token 已准备就绪，认证拦截器已配置');
    };

    setupMxCADAuth();

    if (!fileId) {
      console.error('❌ 未找到文件ID');

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
        console.log('📁 获取文件信息', { fileId });

        // 获取文件信息
        const fileResponse = await apiService.get(
          `/file-system/nodes/${fileId}`
        );
        const file = fileResponse.data;
        console.log('📄 文件信息', file);

        if (!file.fileHash) {
          console.error('❌ 文件尚未转换完成');
          setError('文件尚未转换完成');
          setLoading(false);
          return;
        }

        // 按需加载 MxCAD 依赖
        const { mxcadManager } = await loadMxCADDependencies();

        // 初始化 MxCAD 配置
        await initMxCADConfig();

        // 直接使用数据库中的path字段
        const mxcadFileUrl = file.path;

        console.log('🚀 准备初始化MxCAD', {
          fileHash: file.fileHash,
          fileName: file.originalName,
          fileExtension: file.extension,
          mxcadFileUrl,
        });

        // 第一次初始化时传入正确的 mxweb 文件 URL
        await mxcadManager.initializeMxCADView(mxcadFileUrl);
        mxcadManager.showMxCAD(true);
        console.log('✅ CAD编辑器初始化完成');
        setLoading(false);
      } catch (err) {
        console.error('❌ CAD编辑器初始化失败:', err);
        setError('CAD编辑器初始化失败');
        setLoading(false);
      }
    };

    initEditor();

    return () => {
      console.log('🧹 清理：隐藏MxCAD');
      // 动态导入 mxcadManager 进行清理
      import('../services/mxcadManager').then(({ mxcadManager }) => {
        mxcadManager.showMxCAD(false);
      });
    };
  }, [shouldLoadEditor, fileId, user, location.search]);

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
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <button
        onClick={() => navigate('/projects')}
        className="fixed top-4 left-4 z-[9999] flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 text-sm font-medium text-gray-700"
      >
        <ArrowLeft size={16} />
        返回项目列表
      </button>
    </div>
  );
};
