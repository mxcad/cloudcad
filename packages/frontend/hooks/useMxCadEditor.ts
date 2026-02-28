import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiService } from '../services/apiService';
import { logger as Logger, ErrorHandler, UrlHelper } from '../utils/mxcadUtils';

/** MxPluginContext 类型声明 */
declare global {
  interface Window {
    MxPluginContext?: {
      getServerConfig: () => Promise<MxCadServerConfig>;
    };
  }
}

/** MxCAD 服务器配置 */
interface MxCadServerConfig {
  uploadFileConfig?: {
    create?: {
      formData?: Record<string, unknown>;
    };
  };
}

/** 项目上下文 */
interface ProjectContext {
  projectId?: string;
  parentId?: string;
}

/** 用户信息 */
interface UserInfo {
  id: string;
  name: string;
  email: string;
  role?: string;
}

/**
 * 项目上下文管理 Hook
 */
export const useProjectContext = () => {
  const location = useLocation();
  const [projectContext, setProjectContext] = useState<ProjectContext>({});

  useEffect(() => {
    const context = UrlHelper.getProjectContext(location.search);

    if (context.projectId || context.parentId) {
      setProjectContext(context);
      Logger.info('项目上下文', context);
    }
  }, [location.search]);

  return projectContext;
};

/**
 * 文件信息获取 Hook
 */
export const useFileInfo = () => {
  const getFileInfo = async (nodeId: string) => {
    try {
      const fileData = await apiService.get(`/file-system/nodes/${nodeId}`);
      Logger.info('文件信息', fileData.data);
      return fileData.data;
    } catch (error) {
      ErrorHandler.handle(error, '获取文件信息');
      return null;
    }
  };

  return { getFileInfo };
};

/**
 * MxCAD 服务器配置设置 Hook
 */
export const useMxCadServerConfig = (
  user: UserInfo,
  projectContext: ProjectContext
) => {
  const setupServerConfig = async () => {
    try {
      const serverConfig = await window.MxPluginContext?.getServerConfig();

      if (!serverConfig) {
        Logger.warn('MxPluginContext 或服务器配置不可用');
        return;
      }

      Logger.info('当前 MxCAD 服务器配置', serverConfig);

      if (serverConfig?.uploadFileConfig?.create) {
        const originalFormData =
          serverConfig.uploadFileConfig.create.formData || {};

        serverConfig.uploadFileConfig.create.formData = {
          ...originalFormData,
          mxcadUserId: user.id,
          mxcadProjectId: projectContext.projectId,
          mxcadParentId: projectContext.parentId || '',
          mxcadUserRole: user.role,
        };

        // Authorization header 由 apiService 拦截器统一处理

        Logger.info(
          '修改 MxCAD 服务器配置，添加上下文参数',
          serverConfig.uploadFileConfig.create.formData
        );
      }
    } catch (error) {
      ErrorHandler.handle(error, '设置服务器配置');
    }
  };

  return { setupServerConfig };
};
