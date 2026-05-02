///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { filesApi } from '../services/filesApi';

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
 * 文件信息获取 Hook
 */
export const useFileInfo = () => {
  const getFileInfo = async (nodeId: string) => {
    const fileData = await filesApi.get(nodeId);
    return fileData.data;
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
        console.warn('MxPluginContext 或服务器配置不可用');
        return;
      }

      console.info('当前 MxCAD 服务器配置', serverConfig);

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

        console.info(
          '修改 MxCAD 服务器配置，添加上下文参数',
          serverConfig.uploadFileConfig.create.formData
        );
      }
    } catch (error) {
      console.error(error, '设置服务器配置');
    }
  };

  return { setupServerConfig };
};
