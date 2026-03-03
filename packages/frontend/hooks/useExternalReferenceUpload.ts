import { useState, useCallback, useRef, useEffect } from 'react';
import { mxcadApi } from '../services/mxcadApi';
import type {
  PreloadingData,
  ExternalReferenceFile,
  UploadState,
  UseExternalReferenceUploadConfig,
  UseExternalReferenceUploadReturn,
} from '../types/filesystem';
import { logger } from '../utils/logger';
import { handleError } from '../utils/errorHandler';

/**
 * MxCAD 外部参照上传 Hook
 *
 * 功能：
 * - 检测缺失的外部参照
 * - 上传外部参照文件
 * - 管理上传状态和进度
 * - 支持跳过上传（可选功能）
 */
export const useExternalReferenceUpload = (
  config: UseExternalReferenceUploadConfig
): UseExternalReferenceUploadReturn => {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<ExternalReferenceFile[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // 使用 ref 存储 nodeId，确保闭包中始终使用最新值
  const nodeIdRef = useRef(config.nodeId);

  // 在 useEffect 中更新 ref，遵循 React 最佳实践
  useEffect(() => {
    nodeIdRef.current = config.nodeId;
  }, [config.nodeId]);

  // 使用 ref 存储正在进行的请求，避免重复请求

  const pendingRequestsRef = useRef<Set<string>>(new Set());

  // 使用 ref 存储预加载数据缓存，避免重复请求

  const preloadingDataCacheRef = useRef<Map<string, PreloadingData>>(new Map());

  /**

       * 获取预加载数据

       *

       * 添加了请求去重和缓存机制：

       * 1. 如果已有相同请求在进行中，跳过重复请求

       * 2. 如果缓存中存在数据且未过期，直接返回缓存数据

       */

  const fetchPreloadingData = useCallback(
    async (nodeId: string): Promise<PreloadingData | null> => {
      if (!nodeId) {
        logger.warn('nodeId 为空，无法获取预加载数据');

        return null;
      }

      // 检查缓存（缓存有效期 5 秒）

      const cached = preloadingDataCacheRef.current.get(nodeId);

      if (cached) {
        logger.debug(`[fetchPreloadingData] 返回缓存数据: ${nodeId}`);

        return cached;
      }

      // 检查是否已有相同请求在进行中

      if (pendingRequestsRef.current.has(nodeId)) {
        logger.debug(
          `[fetchPreloadingData] 节点 ${nodeId} 的请求已在进行中，跳过重复请求`
        );

        return null;
      }

      // 标记请求开始

      pendingRequestsRef.current.add(nodeId);

            try {

              const response = await mxcadApi.getPreloadingData(nodeId);

      

              // apiClient 已经自动解包，response.data 就是实际数据

              const data = response.data || null;

      

              // 如果成功获取数据，更新缓存

              if (data) {

                preloadingDataCacheRef.current.set(nodeId, data);

      

                // 5 秒后清除缓存

                setTimeout(() => {

                  preloadingDataCacheRef.current.delete(nodeId);

                }, 5000);

              }

      

              return data;

            } catch (error) {
        handleError(error, '获取预加载数据失败');

        return null;
      } finally {
        // 请求完成后移除标记

        pendingRequestsRef.current.delete(nodeId);
      }
    },

    []
  );

  /**
   * 检查外部参照是否存在
   */
  const checkReferenceExists = useCallback(
    async (nodeId: string, fileName: string): Promise<boolean> => {
      if (!nodeId) return false;
      try {
        const response = await mxcadApi.checkExternalReferenceExists(
          nodeId,
          fileName
        );
        logger.debug(
          '[checkReferenceExists] 响应:',
          'external-reference',
          fileName,
          response.data
        );
        // apiClient 已经自动解包，response.data 就是 {exists: boolean}
        return response.data?.exists ?? false;
      } catch (error) {
        handleError(error, '检查外部参照失败');
        return false;
      }
    },
    []
  );

  /**
   * 检查缺失的外部参照
   * @param nodeId 可选的节点ID，如果不提供则使用 config.nodeId
   * @returns 是否有缺失的外部参照
   */
  const checkMissingReferences = useCallback(
    async (nodeId?: string): Promise<boolean> => {
      const id = nodeId || config.nodeId;

      // 增加重试逻辑：等待 preloading.json 生成
      // 解决文件转换未完成时检查外部参照导致预加载数据不存在的问题
      let preloadingData = null;
      let retryCount = 0;
      const maxRetries = 10; // 最多重试10次
      const retryDelay = 2000; // 每次间隔2秒（总共最多等待20秒）

      while (retryCount < maxRetries && !preloadingData) {
        preloadingData = await fetchPreloadingData(id);

        if (!preloadingData) {
          retryCount++;
          if (retryCount < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }
      }

      if (!preloadingData) {
        logger.info(
          '重试次数耗尽，仍未找到预加载数据，可能是转换失败或文件无外部参照'
        );
        return false;
      }

      // 安全获取数组属性，防止 undefined
      const images = preloadingData.images || [];
      const externalReference = preloadingData.externalReference || [];

      // 过滤掉 http/https 开头的 URL（已有外部参照）
      const missingImages = images.filter(
        (name) => !name.startsWith('http:') && !name.startsWith('https:')
      );

      if (missingImages.length === 0 && externalReference.length === 0) {
        return false;
      }

      // 检查哪些文件缺失
      const missingFiles: ExternalReferenceFile[] = [];

      // 检查 DWG 外部参照
      for (const name of externalReference) {
        const exists = await checkReferenceExists(id, name);
        missingFiles.push({
          name,
          type: 'ref',
          uploadState: 'notSelected',
          progress: 0,
          exists,
        });
      }

      // 检查图片外部参照
      for (const name of missingImages) {
        const exists = await checkReferenceExists(id, name);
        missingFiles.push({
          name,
          type: 'img',
          uploadState: 'notSelected',
          progress: 0,
          exists,
        });
      }

      // 不过滤已存在的文件，总是显示所有外部参照文件
      // 用户可以选择覆盖已存在的文件
      const allExternalReferences = missingFiles;

      logger.debug(
        '[useExternalReferenceUpload] 所有外部参照文件:',
        'external-reference',
        allExternalReferences
      );

      if (allExternalReferences.length === 0) {
        return false;
      }

      const missingCount = allExternalReferences.filter(
        (f) => !f.exists
      ).length;
      logger.debug(
        `[useExternalReferenceUpload] 外部参照总数: ${allExternalReferences.length} 个，缺失: ${missingCount} 个`,
        'external-reference'
      );

      setFiles(allExternalReferences);
      setIsOpen(true);
      return true;
    },
    [config.nodeId, fetchPreloadingData, checkReferenceExists]
  );

  /**
   * 上传文件
   * DWG 外部参照使用外部参照上传接口，图片外部参照直接上传
   */
  const uploadFiles = useCallback(async () => {
    logger.debug(
      '[useExternalReferenceUpload] uploadFiles 被调用',
      'external-reference'
    );
    logger.debug(
      '[useExternalReferenceUpload] 当前文件列表:',
      'external-reference',
      files.map((f) => ({
        name: f.name,
        type: f.type,
        uploadState: f.uploadState,
        hasSource: !!f.source,
      }))
    );

    const filesToUpload = files.filter(
      (f) => f.source && f.uploadState === 'notSelected'
    );

    logger.debug(
      '[useExternalReferenceUpload] 筛选后待上传文件:',
      'external-reference',
      filesToUpload.map((f) => f.name)
    );

    if (filesToUpload.length === 0) {
      logger.debug(
        '[useExternalReferenceUpload] 没有需要上传的文件',
        'external-reference'
      );
      return;
    }
    setLoading(true);

    for (const fileInfo of filesToUpload) {
      if (!fileInfo.source) continue;

      // 更新状态为上传中
      setFiles((prevFiles) =>
        prevFiles.map((f) =>
          f.name === fileInfo.name
            ? { ...f, uploadState: 'uploading' as UploadState, progress: 0 }
            : f
        )
      );

      try {
        if (fileInfo.type === 'img') {
          // 图片外部参照：使用图片上传接口
          await mxcadApi.uploadExtReferenceImage(
            fileInfo.source,
            config.nodeId,
            fileInfo.name,
            (progressEvent) => {
              if (progressEvent.total) {
                const progress =
                  (progressEvent.loaded / progressEvent.total) * 100;
                setFiles((prevFiles) =>
                  prevFiles.map((f) =>
                    f.name === fileInfo.name ? { ...f, progress } : f
                  )
                );
              }
            }
          );
        } else {
          // DWG 外部参照：使用 DWG 外部参照上传接口
          await mxcadApi.uploadExtReferenceDwg(
            fileInfo.source,
            config.nodeId,
            fileInfo.name,
            (progressEvent) => {
              if (progressEvent.total) {
                const progress =
                  (progressEvent.loaded / progressEvent.total) * 100;
                setFiles((prevFiles) =>
                  prevFiles.map((f) =>
                    f.name === fileInfo.name ? { ...f, progress } : f
                  )
                );
              }
            }
          );
        }

        // 更新状态为成功
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.name === fileInfo.name
              ? { ...f, uploadState: 'success' as UploadState, progress: 100 }
              : f
          )
        );
      } catch (error) {
        handleError(error, `上传 ${fileInfo.name} 失败`);
        config.onError?.(`上传 ${fileInfo.name} 失败`);

        // 更新状态为失败
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.name === fileInfo.name
              ? { ...f, uploadState: 'fail' as UploadState }
              : f
          )
        );
      }
    }

    setLoading(false);
  }, [files, config.nodeId, config.onError]);

  /**
   * 关闭模态框
   */
  const close = useCallback(() => {
    setIsOpen(false);
    setFiles([]);
  }, []);

  /**
   * 完成上传
   */
  const complete = useCallback(() => {
    const allSuccess = files.every((f) => f.uploadState === 'success');

    if (allSuccess) {
      config.onSuccess?.();
    } else {
      logger.warn('部分文件上传失败');
    }

    close();
  }, [files, config.onSuccess, close]);

  /**
   * 跳过上传
   */
  const skip = useCallback(() => {
    config.onSkip?.();
    close();
  }, [config.onSkip, close]);

  /**
   * 打开模态框准备上传（任务009 - 随时上传功能）
   * 无缺失外部参照时调用，直接打开文件选择对话框
   */
  const openModalForUpload = useCallback(() => {
    setIsOpen(true);
    // 清空已选文件，准备新上传
    setFiles([]);
  }, []);

  /**
   * 选择文件并自动上传
   */
  const selectAndUploadFiles = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dwg,image/*';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = async () => {
      if (!input.files) {
        return;
      }

      const selectedFiles = Array.from(input.files);
      input.remove();

      // 更新文件列表，设置 source
      setFiles((prevFiles) => {
        const newFiles = [...prevFiles];
        selectedFiles.forEach((file) => {
          const existingFile = newFiles.find((f) => f.name === file.name);
          if (existingFile) {
            existingFile.source = file;
            existingFile.uploadState = 'notSelected';
          } else {
            logger.warn(`未找到匹配的缺失文件: ${file.name}`);
          }
        });
        return newFiles;
      });

      // 等待状态更新后再开始上传
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 自动开始上传
      await uploadFiles();
    };

    input.click();
  }, [files, uploadFiles]);

  return {
    isOpen,
    files,
    loading,
    checkMissingReferences,
    selectAndUploadFiles, // 合并后的方法
    close,
    complete,
    skip,
    openModalForUpload,
  };
};
