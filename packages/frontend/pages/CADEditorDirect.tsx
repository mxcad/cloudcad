import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
    // @ts-expect-error - mxcad-app 没有类型定义
    await import('mxcad-app/style');
    const { mxcadManager } = await import('../services/mxcadManager');
    return { mxcadManager };
  };

  const initMxCADConfig = async (currentFile?: any) => {
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
      window as any
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
        const fileResponse = await apiService.get(
          `/file-system/nodes/${fileId}`
        );
        const file = fileResponse.data;

        if (!file.fileHash) {
          setError('文件尚未转换完成');
          setLoading(false);
          return;
        }

        // 设置当前文件信息和 navigate 函数（用于返回命令）
        const { setCurrentFileInfo, setNavigateFunction } = await import('../services/mxcadManager');
        setCurrentFileInfo({
          fileId: file.id,
          parentId: file.parentId || null,
          projectId: file.parentId || null, // 向上查找项目根节点
          name: file.name
        });
        setNavigateFunction(navigate);

        // 按需加载 MxCAD 依赖
        const { mxcadManager } = await loadMxCADDependencies();

        // 初始化 MxCAD 配置，传入当前文件信息以获取正确的父节点
        await initMxCADConfig(file);

        // 直接使用数据库中的path字段
        const mxcadFileUrl = file.path;

        // 第一次初始化时传入正确的 mxweb 文件 URL
        await mxcadManager.initializeMxCADView(mxcadFileUrl);
        mxcadManager.showMxCAD(true);
        setLoading(false);
      } catch (err) {
        console.log(err)
        setError('CAD编辑器初始化失败');
        setLoading(false);
      }
    };

    initEditor();

    return () => {
      // 动态导入 mxcadManager 进行清理
      import('../services/mxcadManager').then(({ mxcadManager, clearCurrentFileInfo }) => {
        mxcadManager.showMxCAD(false);
        clearCurrentFileInfo(); // 清除文件信息
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
      {/* 返回功能通过 MxCAD 命令实现：MxFun.execCmd("return-to-cloud-map-management") */}
    </div>
  );
};
