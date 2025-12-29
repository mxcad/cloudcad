import { useState, useCallback } from 'react';
import { mxcadApi } from '../services/apiService';
import type {
  PreloadingData,
  ExternalReferenceFile,
  UploadState,
  UseExternalReferenceUploadConfig,
  UseExternalReferenceUploadReturn,
} from '../types/filesystem';

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

  /**
   * 获取预加载数据
   */
  const fetchPreloadingData = useCallback(async (): Promise<PreloadingData | null> => {
    try {
      const response = await mxcadApi.getPreloadingData(config.fileHash);
      return response.data;
    } catch (error) {
      console.error('[useExternalReferenceUpload] 获取预加载数据失败:', error);
      return null;
    }
  }, [config.fileHash]);

  /**
   * 检查外部参照是否存在
   */
  const checkReferenceExists = useCallback(
    async (fileName: string): Promise<boolean> => {
      try {
        const response = await mxcadApi.checkExternalReferenceExists(
          config.fileHash,
          fileName
        );
        return response.data.exists;
      } catch (error) {
        console.error('[useExternalReferenceUpload] 检查外部参照失败:', error);
        return false;
      }
    },
    [config.fileHash]
  );

  /**
   * 检查缺失的外部参照
   * @returns 是否有缺失的外部参照
   */
  const checkMissingReferences = useCallback(async (): Promise<boolean> => {
    const preloadingData = await fetchPreloadingData();

    if (!preloadingData) {
      console.log('[useExternalReferenceUpload] 未找到预加载数据');
      return false;
    }

    // 过滤掉 http/https 开头的 URL（已有外部参照）
    const missingImages = preloadingData.images.filter(
      (name) => !name.startsWith('http:') && !name.startsWith('https:')
    );
    const missingRefs = preloadingData.externalReference;

    if (missingImages.length === 0 && missingRefs.length === 0) {
      console.log('[useExternalReferenceUpload] 无缺失的外部参照');
      return false;
    }

    console.log(
      `[useExternalReferenceUpload] 检测到外部参照: 图片 ${missingImages.length} 个, DWG ${missingRefs.length} 个`
    );

    // 检查哪些文件缺失
    const missingFiles: ExternalReferenceFile[] = [];

    // 检查 DWG 外部参照
    for (const name of missingRefs) {
      const exists = await checkReferenceExists(name);
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
      const exists = await checkReferenceExists(name);
      missingFiles.push({
        name,
        type: 'img',
        uploadState: 'notSelected',
        progress: 0,
        exists,
      });
    }

    // 过滤掉已存在的文件
    const trulyMissingFiles = missingFiles.filter((f) => !f.exists);

    if (trulyMissingFiles.length === 0) {
      console.log('[useExternalReferenceUpload] 所有外部参照已存在');
      return false;
    }

    console.log(
      `[useExternalReferenceUpload] 缺失的外部参照: ${trulyMissingFiles.length} 个`
    );

    setFiles(trulyMissingFiles);
    setIsOpen(true);
    return true;
  }, [fetchPreloadingData, checkReferenceExists]);

  /**
   * 选择文件
   */
  const selectFiles = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dwg,image/*';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = () => {
      if (!input.files) return;

      const selectedFiles = Array.from(input.files);

      setFiles((prevFiles) => {
        const newFiles = [...prevFiles];

        selectedFiles.forEach((file) => {
          const existingFile = newFiles.find((f) => f.name === file.name);
          if (existingFile) {
            existingFile.source = file;
          }
        });

        return newFiles;
      });

      input.remove();
    };

    input.click();
  }, []);

  /**
   * 上传文件
   */
  const uploadFiles = useCallback(async () => {
    const filesToUpload = files.filter(
      (f) => f.source && f.uploadState === 'notSelected'
    );

    if (filesToUpload.length === 0) {
      console.log('[useExternalReferenceUpload] 没有需要上传的文件');
      return;
    }

    console.log(
      `[useExternalReferenceUpload] 开始上传 ${filesToUpload.length} 个文件`
    );
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
        const endpoint =
          fileInfo.type === 'img'
            ? mxcadApi.uploadExtReferenceImage
            : mxcadApi.uploadExtReferenceDwg;

        await endpoint(
          fileInfo.source,
          config.fileHash,
          fileInfo.name,
          (progressEvent) => {
            if (progressEvent.total) {
              const progress = (progressEvent.loaded / progressEvent.total) * 100;
              setFiles((prevFiles) =>
                prevFiles.map((f) =>
                  f.name === fileInfo.name ? { ...f, progress } : f
                )
              );
            }
          }
        );

        // 更新状态为成功
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.name === fileInfo.name
              ? { ...f, uploadState: 'success' as UploadState, progress: 100 }
              : f
          )
        );

        console.log(`[useExternalReferenceUpload] 上传成功: ${fileInfo.name}`);
      } catch (error) {
        console.error(`[useExternalReferenceUpload] 上传失败: ${fileInfo.name}`, error);
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
    console.log('[useExternalReferenceUpload] 所有文件上传完成');
  }, [files, config.fileHash, config.onError]);

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
      console.log('[useExternalReferenceUpload] 所有文件上传成功');
      config.onSuccess?.();
    } else {
      console.warn('[useExternalReferenceUpload] 部分文件上传失败');
    }

    close();
  }, [files, config.onSuccess, close]);

  /**
   * 跳过上传
   */
  const skip = useCallback(() => {
    console.log('[useExternalReferenceUpload] 用户跳过上传');
    config.onSkip?.();
    close();
  }, [config.onSkip, close]);

  /**
   * 打开模态框准备上传（任务009 - 随时上传功能）
   * 无缺失外部参照时调用，直接打开文件选择对话框
   */
  const openModalForUpload = useCallback(() => {
    console.log('[useExternalReferenceUpload] 打开上传模态框');
    setIsOpen(true);
    // 清空已选文件，准备新上传
    setFiles([]);
  }, []);

  return {
    isOpen,
    files,
    loading,
    checkMissingReferences,
    selectFiles,
    uploadFiles,
    close,
    complete,
    skip,
    openModalForUpload,
  };
};
