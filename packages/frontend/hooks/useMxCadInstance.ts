import { useState } from 'react';
import { mxcadManager } from '../services/mxcadManager';
import { useFileInfo } from './useMxCadEditor';
import {
  Logger,
  ErrorHandler,
  FileStatusHelper,
  UrlHelper,
  ValidationHelper,
} from '../utils/mxcadUtils';

/**
 * MxCAD 实例管理 Hook
 */
export const useMxCadInstance = (initialFileUrl?: string) => {
  const [isMxCADReady, setIsMxCADReady] = useState(false);
  const { getFileInfo } = useFileInfo();

  const initializeMxCAD = async () => {
    try {
      Logger.info('初始化 MxCADView（永不销毁容器）');

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
            Logger.info('首次初始化，准备打开文件', { url: resolvedFileUrl });
          }
        } catch (error) {
          ErrorHandler.handle(error, '获取文件信息');
        }
      }

      const view = await mxcadManager.initializeMxCADView(resolvedFileUrl);

      setIsMxCADReady(true);

      Logger.success('MxCADView 初始化完成');

      if (isFirstInit && resolvedFileUrl) {
        Logger.info('首次初始化文件已处理，跳过后续文件切换逻辑');
      }
    } catch (error) {
      ErrorHandler.handle(error, 'MxCADView 初始化');
      setIsMxCADReady(false);
    }
  };

  const showMxCAD = (show: boolean) => {
    mxcadManager.showMxCAD(show);
    Logger.info(`${show ? '显示' : '隐藏'} MxCAD 容器`);
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
      Logger.error('MxCADManager 未就绪，无法打开文件');
      return;
    }

    try {
      // 获取文件信息
      const fileInfo = await getFileInfo(urlFileId);
      if (!fileInfo) {
        Logger.error('无法获取文件信息');
        return;
      }

      // 检查文件状态
      if (!FileStatusHelper.canOpen(fileInfo.fileStatus)) {
        const statusText = FileStatusHelper.getStatusText(
          fileInfo.fileStatus || ''
        );
        Logger.error('文件尚未转换完成', { status: fileInfo.fileStatus });
        alert(`文件状态: ${statusText}`);
        return;
      }

      if (!ValidationHelper.isValidFileHash(fileInfo.fileHash)) {
        Logger.error('文件哈希值不存在');
        alert('文件哈希值不存在，无法打开文件');
        return;
      }

      if (!fileInfo.path) {
        Logger.error('文件路径不存在');
        alert('文件路径不存在，无法打开文件');
        return;
      }

      const mxcadFileUrl = UrlHelper.buildMxCadFileUrl(fileInfo.path);
      const targetFileName = fileInfo.name;

      Logger.info('准备打开文件', {
        url: mxcadFileUrl,
        originalName: fileInfo.originalName,
        fileHash: fileInfo.fileHash,
        path: fileInfo.path,
        targetFileName,
      });

      // 检查是否已有打开的文件
      const currentFileName = mxcadManager.getCurrentFileName();
      if (currentFileName && currentFileName.includes(targetFileName)) {
        Logger.success('目标文件已打开，跳过重复操作', {
          currentFileName,
          targetFileName,
        });
        return;
      }

      Logger.info('MxCADView 状态检查通过，开始打开文件');

      // 第二次打开文件需要调用 openFile 方法
      await mxcadManager.openFile(mxcadFileUrl);
      Logger.success('第二次打开文件命令已执行');
    } catch (error) {
      ErrorHandler.handle(error, '打开文件');
    }
  };

  return { openFile };
};
