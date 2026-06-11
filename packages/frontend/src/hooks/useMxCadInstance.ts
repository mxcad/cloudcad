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

import { useState } from 'react';
import { mxcadManager } from '../services/mxcadManager';
import { useFileInfo } from './useMxCadEditor';
import {
  FileStatusHelper,
  UrlHelper,
  ValidationHelper,
} from '../utils/mxcadUtils';
import { globalShowToast } from '../contexts/NotificationContext';

/**
 * MxCAD 实例管理 Hook
 */
export const useMxCadInstance = (initialFileUrl?: string) => {
  const [isMxCADReady, setIsMxCADReady] = useState(false);
  const { getFileInfo } = useFileInfo();

  const initializeMxCAD = async () => {
    try {
      const isFirstInit = !mxcadManager.isReady();
      let resolvedFileUrl: string | undefined;

      if (
        isFirstInit &&
        initialFileUrl &&
        ValidationHelper.isValidNodeId(initialFileUrl)
      ) {
        try {
          const fileInfo = await getFileInfo(initialFileUrl);
          if (fileInfo?.data?.path) {
            resolvedFileUrl = UrlHelper.buildMxCadFileUrl(fileInfo.data.path);
          }
        } catch (error) {
          console.error('获取文件信息', error);
        }
      }

      await mxcadManager.initializeMxCADView(resolvedFileUrl);

      setIsMxCADReady(true);

      if (isFirstInit && resolvedFileUrl) {
      }
    } catch (error) {
      console.error('MxCADView 初始化', error);
      setIsMxCADReady(false);
    }
  };

  const showMxCAD = (show: boolean) => {
    mxcadManager.showMxCAD(show);
  };

  return {
    isMxCADReady,
    initializeMxCAD,
    showMxCAD,
  };
};

/**
 * 文件打开管理 Hook
 */
export const useFileOpening = (isMxCADReady: boolean, urlFileId?: string) => {
  const { getFileInfo } = useFileInfo();

  const openFile = async () => {
    if (!mxcadManager.isReady()) {
      console.error('MxCADManager 未就绪，无法打开文件');
      return;
    }

    if (!urlFileId) {
      console.error('缺少文件 ID');
      return;
    }

    try {
      // 获取文件信息
      const fileInfo = await getFileInfo(urlFileId);
      if (!fileInfo?.data) {
        console.error('无法获取文件信息');
        return;
      }
      const fileData = fileInfo.data;

      // 检查文件状态
      if (!FileStatusHelper.canOpen(fileData.fileStatus)) {
        const statusText = FileStatusHelper.getStatusText(
          fileData.fileStatus || ''
        );
        console.error('文件尚未转换完成', { status: fileData.fileStatus });
        globalShowToast(`文件状态: ${statusText}`, 'warning');
        return;
      }

      if (!ValidationHelper.isValidFileHash(fileData.fileHash)) {
        console.error('文件哈希值不存在');
        globalShowToast('文件哈希值不存在，无法打开文件', 'error');
        return;
      }

      if (!fileData.path) {
        console.error('文件路径不存在');
        globalShowToast('文件路径不存在，无法打开文件', 'error');
        return;
      }

      const mxcadFileUrl = UrlHelper.buildMxCadFileUrl(fileData.path);
      const targetFileName = fileData.name;

      // 检查是否已有打开的文件
      const currentFileName = mxcadManager.getCurrentFileName();
      if (currentFileName && currentFileName.includes(targetFileName)) {
        return;
      }

      // 第二次打开文件需要调用 openFile 方法
      await mxcadManager.openFile(mxcadFileUrl);
    } catch (error) {
      console.error('打开文件', error);
    }
  };

  return { openFile };
};
