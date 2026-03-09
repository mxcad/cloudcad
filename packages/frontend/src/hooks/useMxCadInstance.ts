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
      console.log('初始化 MxCADView（永不销毁容器）');

      const isFirstInit = !mxcadManager.isReady();
      let resolvedFileUrl: string | undefined;

      if (
        isFirstInit &&
        initialFileUrl &&
        ValidationHelper.isValidNodeId(initialFileUrl)
      ) {
        try {
          const fileInfo = await getFileInfo(initialFileUrl);
          if (fileInfo?.path) {
            resolvedFileUrl = UrlHelper.buildMxCadFileUrl(fileInfo.path);
            console.log('首次初始化，准备打开文件', { url: resolvedFileUrl });
          }
        } catch (error) {
          console.error('获取文件信息', error);
        }
      }

      await mxcadManager.initializeMxCADView(resolvedFileUrl);

      setIsMxCADReady(true);

      console.log('MxCADView 初始化完成');

      if (isFirstInit && resolvedFileUrl) {
        console.log('首次初始化文件已处理，跳过后续文件切换逻辑');
      }
    } catch (error) {
      console.error('MxCADView 初始化', error);
      setIsMxCADReady(false);
    }
  };

  const showMxCAD = (show: boolean) => {
    mxcadManager.showMxCAD(show);
    console.log(`${show ? '显示' : '隐藏'} MxCAD 容器`);
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
      if (!fileInfo) {
        console.error('无法获取文件信息');
        return;
      }

      // 检查文件状态
      if (!FileStatusHelper.canOpen(fileInfo.fileStatus)) {
        const statusText = FileStatusHelper.getStatusText(
          fileInfo.fileStatus || ''
        );
        console.error('文件尚未转换完成', { status: fileInfo.fileStatus });
        globalShowToast(`文件状态: ${statusText}`, 'warning');
        return;
      }

      if (!ValidationHelper.isValidFileHash(fileInfo.fileHash)) {
        console.error('文件哈希值不存在');
        globalShowToast('文件哈希值不存在，无法打开文件', 'error');
        return;
      }

      if (!fileInfo.path) {
        console.error('文件路径不存在');
        globalShowToast('文件路径不存在，无法打开文件', 'error');
        return;
      }

      const mxcadFileUrl = UrlHelper.buildMxCadFileUrl(fileInfo.path);
      const targetFileName = fileInfo.name;

      // 检查是否已有打开的文件
      const currentFileName = mxcadManager.getCurrentFileName();
      if (currentFileName && currentFileName.includes(targetFileName)) {
        console.log('目标文件已打开，跳过重复操作', {
          currentFileName,
          targetFileName,
        });
        return;
      }

      console.log('MxCADView 状态检查通过，开始打开文件');

      // 第二次打开文件需要调用 openFile 方法
      await mxcadManager.openFile(mxcadFileUrl);
      console.log('第二次打开文件命令已执行');
    } catch (error) {
      console.error('打开文件', error);
    }
  };

  return { openFile };
};
