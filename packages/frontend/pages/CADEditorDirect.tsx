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
    // 动态加载样式和依赖
    await import('mxcad-app/style');
    const { mxcadManager } = await import('../services/mxcadManager');
    return { mxcadManager };
  };

  const initMxCADConfig = async () => {
    const { mxcadApp } = await import('mxcad-app');
    const configUrl = window.location.origin;
    
    console.log('⚙️ 初始化MxCAD配置');
    mxcadApp.setStaticAssetPath("/mxcadAppAssets/");
    mxcadApp.initConfig({
      uiConfig: `${configUrl}/ini/myUiConfig.json`,
      sketchesUiConfig: `${configUrl}/ini/mySketchesAndNotesUiConfig.json`,
      serverConfig: `${configUrl}/ini/myServerConfig.json`,
      quickCommandConfig: `${configUrl}/ini/myQuickCommand.json`,
      themeConfig: `${configUrl}/ini/myVuetifyThemeConfig.json`
    });

    // 设置MxCAD服务器配置
    const serverConfig = await (window as any).MxPluginContext.getServerConfig();
    if (serverConfig?.uploadFileConfig?.create) {
      const projectId = new URLSearchParams(location.search).get('project') || '';
      const parentId = new URLSearchParams(location.search).get('parent') || '';
      
      console.log('🔧 设置服务器配置', { projectId, parentId, search: location.search });
      
      // 验证项目信息
      if (!projectId) {
        console.error('❌ 缺少项目ID，无法正确上传文件到文件系统');
        console.error('❌ 请确保通过文件管理页面访问CAD编辑器，而不是直接访问URL');
        // 可以选择设置一个默认项目或禁用上传功能
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
      }
    }
  };

  // 设置XHR/fetch拦截器，为MxCAD文件访问添加认证头
  const setupNetworkInterceptors = () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.warn('⚠️ 未找到JWT token，无法设置网络拦截器');
      return;
    }

    console.log('🔐 设置MxCAD网络拦截器');

    // 保存原始的fetch和XMLHttpRequest
    const originalFetch = window.fetch;
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    // 拦截fetch请求
    window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = typeof input === 'string' ? input : input.toString();
      
      // 如果是MxCAD文件请求，添加认证头
      if (url.includes('/mxcad/file/')) {
        console.log('🌐 拦截MxCAD fetch请求:', url);
        
        const headers = new Headers(init?.headers);
        headers.set('Authorization', `Bearer ${token}`);
        
        const newInit = {
          ...init,
          headers,
        };
        
        console.log('✅ 已为fetch请求添加认证头');
        return originalFetch.call(this, input, newInit);
      }
      
      return originalFetch.call(this, input, init);
    };

    // 拦截XMLHttpRequest
    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...args: any[]) {
      const urlString = url.toString();
      
      // 如果是MxCAD文件请求，标记这个请求
      if (urlString.includes('/mxcad/file/')) {
        console.log('🌐 拦截MxCAD XHR请求:', urlString);
        (this as any)._isMxCadFileRequest = true;
      }
      
      return originalXHROpen.call(this, method, url, ...args);
    };

    XMLHttpRequest.prototype.send = function(body?: Document | BodyInit | null) {
      // 如果是MxCAD文件请求，添加认证头
      if ((this as any)._isMxCadFileRequest) {
        console.log('✅ 已为XHR请求添加认证头');
        this.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      
      return originalXHRSend.call(this, body);
    };

    // 返回清理函数
    return () => {
      console.log('🧹 恢复原始网络方法');
      window.fetch = originalFetch;
      XMLHttpRequest.prototype.open = originalXHROpen;
      XMLHttpRequest.prototype.send = originalXHRSend;
    };
  };

  useEffect(() => {
    console.log('🔍 CAD编辑器页面加载', { fileId, pathname: location.pathname, search: location.search });
    
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
        const fileResponse = await apiService.get(`/file-system/nodes/${fileId}`);
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

        // 设置网络拦截器，为MxCAD文件访问添加认证头
        const cleanupInterceptors = setupNetworkInterceptors();

        // 直接使用数据库中的path字段
        const mxcadFileUrl = file.path;
        
        console.log('🚀 准备初始化MxCAD', { 
          fileHash: file.fileHash, 
          fileName: file.originalName,
          fileExtension: file.extension,
          mxcadFileUrl 
        });
        
        // 第一次初始化时传入正确的 mxweb 文件 URL
        await mxcadManager.initializeMxCADView(mxcadFileUrl);
        mxcadManager.showMxCAD(true);
        cleanupInterceptors?.();
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