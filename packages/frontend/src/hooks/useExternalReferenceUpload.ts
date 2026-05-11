///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { mxCadControllerGetPreloadingData, mxCadControllerCheckExternalReference } from '@/api-sdk';
import { publicFileControllerGetPreloadingData, publicFileControllerCheckExtReference } from '@/api-sdk';
import type {
  PreloadingData,
  ExternalReferenceFile,
  UploadState,
  UseExternalReferenceUploadConfig,
  UseExternalReferenceUploadReturn,
} from '../types/filesystem';

import { mxCadControllerUploadExtReferenceImage, mxCadControllerUploadExtReferenceDwg } from '@/api-sdk';
import { handleError } from '../utils/errorHandler';
import { isAuthenticated } from '../utils/authCheck';
import { useUIStore } from '../stores/uiStore';

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
  const { setGlobalLoading, setLoadingMessage, addToast } = useUIStore();
  const [localLoading, setLocalLoading] = useState(false);
  const [files, setFiles] = useState<ExternalReferenceFile[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // 确定当前是使用 nodeId 还是 fileHash
  const isLoggedIn = isAuthenticated();
  const identifier = isLoggedIn ? (config.nodeId || '') : (config.fileHash || '');

  // 使用 ref 存储标识符，确保闭包中始终使用最新值
  const identifierRef = useRef(identifier);

  // 在 useEffect 中更新 ref，遵循 React 最佳实践
  useEffect(() => {
    identifierRef.current = isLoggedIn ? (config.nodeId || '') : (config.fileHash || '');
  }, [config.nodeId, config.fileHash, isLoggedIn]);

  // 使用 ref 存储正在进行的请求，避免重复请求

  const pendingRequestsRef = useRef<Set<string>>(new Set());

  // 使用 ref 存储预加载数据缓存，避免重复请求

  const preloadingDataCacheRef = useRef<Map<string, PreloadingData>>(new Map());

  // 记录已自动打开过弹框的文件标识符（forceOpen=false 时记录）
  // 用于防止每次跳转到 CAD 编辑器都弹出外部参照弹框
  const autoOpenedIdentifiersRef = useRef<Set<string>>(new Set());

  /**
         * 获取预加载数据
         *
         * 添加了请求去重和缓存机制：
         * 1. 如果已有相同请求在进行中，跳过重复请求
         * 2. 如果缓存中存在数据且未过期，直接返回缓存数据
         */

  const fetchPreloadingData = useCallback(
    async (id: string): Promise<PreloadingData | null> => {
      if (!id) {
        console.warn('标识符为空，无法获取预加载数据');

        return null;
      }

      // 检查缓存（缓存有效期 5 秒）

      const cached = preloadingDataCacheRef.current.get(id);

      if (cached) {
        console.debug(`[fetchPreloadingData] 返回缓存数据: ${id}`);

        return cached;
      }

      // 检查是否已有相同请求在进行中

      if (pendingRequestsRef.current.has(id)) {
        console.debug(
          `[fetchPreloadingData] ${id} 的请求已在进行中，跳过重复请求`
        );

        return null;
      }

      // 标记请求开始

      pendingRequestsRef.current.add(id);

      try {
        let data = null;
        if (isLoggedIn) {
          // 已登录用户使用 SDK
          const result = await mxCadControllerGetPreloadingData({ path: { nodeId: id } });
          data = result?.data as PreloadingData | null;
        } else {
          // 未登录用户使用 SDK
          const publicResult = await publicFileControllerGetPreloadingData({ path: { hash: id } });
          data = publicResult?.data as PreloadingData | null;
        }

        // 如果成功获取数据，更新缓存

        if (data) {
          preloadingDataCacheRef.current.set(id, data);

          // 5 秒后清除缓存

          setTimeout(() => {
            preloadingDataCacheRef.current.delete(id);
          }, 5000);
        }

        return data;
      } catch (error) {
        handleError(error, '获取预加载数据失败');

        return null;
      } finally {
        // 请求完成后移除标记

        pendingRequestsRef.current.delete(id);
      }
    },

    [isLoggedIn]
  );

  /**
   * 检查外部参照是否存在
   */
  const checkReferenceExists = useCallback(
    async (id: string, fileName: string): Promise<boolean> => {
      if (!id) return false;
      try {
        let result = null;
        if (isLoggedIn) {
          // 已登录用户使用 SDK
          const sdkResult = await mxCadControllerCheckExternalReference({ path: { nodeId: id }, body: { fileName } });
          result = (sdkResult?.data ?? null) as { exists?: boolean } | null;
        } else {
          // 未登录用户使用 SDK
          const sdkResult = await publicFileControllerCheckExtReference({ query: { srcHash: id, fileName } });
          result = (sdkResult?.data ?? null) as { exists?: boolean } | null;
        }
        console.debug(
          `[checkReferenceExists] 响应: ${fileName}`,
          'external-reference',
          result
        );
        // apiClient 已经自动解包，result 就是 {exists: boolean}
        return result?.exists ?? false;
      } catch (error) {
        handleError(error, '检查外部参照失败');
        return false;
      }
    },
    [isLoggedIn]
  );

  /**
   * 检查缺失的外部参照
   * @param identifier 可选的节点ID或文件hash，如果不提供则使用 config
   * @param shouldRetry 是否启用重试逻辑。上传文件后应设为 true，手动点击查看时应设为 false（默认）
   * @param forceOpen 是否强制打开弹框。手动点击管理外部参照时应设为 true，上传后检查应设为 false（默认）
   * @returns 是否有缺失的外部参照
   */
  const checkMissingReferences = useCallback(
    async (identifierParam?: string, shouldRetry = false, forceOpen = false): Promise<boolean> => {
      const id = identifierParam || identifierRef.current;

      let preloadingData = null;

      if (shouldRetry) {
        // 强制清除缓存，确保获取最新的预加载数据
        preloadingDataCacheRef.current.delete(id);

        // 重试逻辑：等待 preloading.json 生成
        // 解决文件转换未完成时检查外部参照导致预加载数据不存在的问题
        let retryCount = 0;
        const maxRetries = 10; // 最多重试10次
        const retryDelay = 2000; // 每次间隔2秒（总共最多等待20秒）

        while (retryCount < maxRetries && !preloadingData) {
          preloadingData = await fetchPreloadingData(id);

          if (!preloadingData) {
            retryCount++;
            if (retryCount < maxRetries) {
              console.debug(
                `[checkMissingReferences] 等待预加载数据生成，第 ${retryCount}/${maxRetries} 次重试`
              );
              await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
          }
        }

        if (!preloadingData) {
          console.info(
            '重试次数耗尽，仍未找到预加载数据，可能是转换失败或文件无外部参照'
          );
        }
      } else {
        // 不重试，直接获取一次
        preloadingData = await fetchPreloadingData(id);
      }

      if (!preloadingData) {
        // 没有预加载数据
        // 只有手动点击（forceOpen = true）时才打开弹框显示提示
        if (forceOpen) {
          setFiles([]);
          setIsOpen(true);
        }
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
        // 没有外部参照
        // 只有手动点击（forceOpen = true）时才打开弹框显示提示
        if (forceOpen) {
          setFiles([]);
          setIsOpen(true);
        }
        return false;
      }

      // 检查哪些文件缺失
      const missingFiles: ExternalReferenceFile[] = [];

      // 检查 DWG 外部参照
      for (const name of externalReference) {
        const exists = await checkReferenceExists(id, name);
        if (!exists) {
          missingFiles.push({
            name,
            type: 'ref',
            uploadState: 'notSelected',
            progress: 0,
            exists,
          });
        }
      }

      // 检查图片外部参照
      for (const name of missingImages) {
        const exists = await checkReferenceExists(id, name);
        if (!exists) {
          missingFiles.push({
            name,
            type: 'img',
            uploadState: 'notSelected',
            progress: 0,
            exists,
          });
        }
      }

      // 只显示缺失的外部参照文件
      const missingExternalReferences = missingFiles;

      console.debug(
        '[useExternalReferenceUpload] 缺失的外部参照文件:',
        'external-reference',
        missingExternalReferences
      );

      if (missingExternalReferences.length === 0) {
        // 没有缺失的外部参照文件
        // 只有手动点击（forceOpen = true）时才打开弹框显示提示
        if (forceOpen) {
          setFiles([]);
          setIsOpen(true);
        }
        return false;
      }

      // 如果不是强制打开或重试模式，且该文件已经自动弹出过，则不再重复弹出
      // 防止每次跳转到 CAD 编辑器都弹出弹框
      if (!forceOpen && !shouldRetry && autoOpenedIdentifiersRef.current.has(id)) {
        console.debug(
          `[useExternalReferenceUpload] 文件 ${id} 已自动检查过外部参照，跳过弹框`,
          'external-reference'
        );
        return true;
      }

      console.debug(
        `[useExternalReferenceUpload] 缺失的外部参照文件数: ${missingExternalReferences.length} 个`,
        'external-reference'
      );

      setFiles(missingExternalReferences);
      setIsOpen(true);

      // 记录已自动弹出（非强制打开且非重试模式）
      if (!forceOpen && !shouldRetry) {
        autoOpenedIdentifiersRef.current.add(id);
      }

      return true;
    },
    [fetchPreloadingData, checkReferenceExists]
  );

  /**
   * 选择文件（不上传）
   */
  const selectFiles = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dwg,image/*';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = () => {
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
          if (existingFile) { Object.assign(existingFile, { source: file });
            existingFile.uploadState = 'notSelected';
          } else {
            addToast(`未找到匹配的缺失文件: ${file.name}`, 'warning');
          }
        });
        return newFiles;
      });
    };

    input.click();
  }, []);

  /**
   * 上传文件
   * DWG 外部参照使用外部参照上传接口，图片外部参照直接上传
   */
  const uploadFiles = useCallback(async () => {
    console.debug(
      '[useExternalReferenceUpload] uploadFiles 被调用',
      'external-reference'
    );
    console.debug(
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

    console.debug(
      '[useExternalReferenceUpload] 筛选后待上传文件:',
      'external-reference',
      filesToUpload.map((f) => f.name)
    );

    if (filesToUpload.length === 0) {
      console.debug(
        '[useExternalReferenceUpload] 没有需要上传的文件',
        'external-reference'
      );
      return;
    }
    setLocalLoading(true);
    setGlobalLoading(true, '正在上传外部参照...');

    const id = identifierRef.current;

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
        const extRefFile = fileInfo.source instanceof File
          ? fileInfo.source
          : new File([fileInfo.source], fileInfo.name);

        if (fileInfo.type === 'img') {
          await mxCadControllerUploadExtReferenceImage({
            body: {
              file: extRefFile,
              nodeId: id,
              ext_ref_file: fileInfo.name,
              updatePreloading: true,
            },
          });
        } else {
          await mxCadControllerUploadExtReferenceDwg({
            path: { nodeId: id },
            body: {
              file: extRefFile,
              nodeId: id,
              ext_ref_file: fileInfo.name,
            },
          });
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

    setLocalLoading(false);
    setGlobalLoading(false);
  }, [files, config.nodeId, config.onError, isLoggedIn, setGlobalLoading]);

  /**
   * 关闭模态框
   */
  const close = useCallback(() => {
    setIsOpen(false);
    setFiles([]);
    // 关闭弹框时记录当前文件已处理过，防止重复弹出
    const id = identifierRef.current;
    if (id) {
      autoOpenedIdentifiersRef.current.add(id);
    }
  }, []);

  /**
   * 完成上传
   */
  const complete = useCallback(() => {
    // 完成/关闭时记录当前文件已处理过，防止重复弹出
    const id = identifierRef.current;
    if (id) {
      autoOpenedIdentifiersRef.current.add(id);
    }

    // 空文件列表或没有文件需要上传时，不触发 onSuccess
    if (files.length === 0) {
      close();
      return;
    }

    const allSuccess = files.every((f) => f.uploadState === 'success');

    // 先关闭弹窗，等一帧渲染完成后再触发回调打开文件
    close();
    if (allSuccess) {
      requestAnimationFrame(() => {
        config.onSuccess?.();
      });
    } else {
      console.warn('部分文件上传失败');
    }
  }, [files, config.onSuccess, close]);

  /**
   * 跳过上传
   */
  const skip = useCallback(() => {
    // 跳过上传时也记录当前文件已处理过，防止重复弹出
    const id = identifierRef.current;
    if (id) {
      autoOpenedIdentifiersRef.current.add(id);
    }
    // 先关闭弹窗，等一帧渲染完成后再触发回调打开文件
    close();
    requestAnimationFrame(() => {
      config.onSkip?.();
    });
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
          if (existingFile) { Object.assign(existingFile, { source: file });
            existingFile.uploadState = 'notSelected';
          } else {
            addToast(`未找到匹配的缺失文件: ${file.name}`, 'warning');
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

  // 使用 useMemo 缓存返回对象，避免每次渲染都创建新对象
  const returnValue = useMemo(() => ({
    isOpen,
    files,
    loading: localLoading,
    checkMissingReferences,
    selectFiles,
    uploadFiles,
    selectAndUploadFiles,
    close,
    complete,
    skip,
    openModalForUpload,
  }), [
    isOpen,
    files,
    localLoading,
    checkMissingReferences,
    selectFiles,
    uploadFiles,
    selectAndUploadFiles,
    close,
    complete,
    skip,
    openModalForUpload,
  ]);

  return returnValue;
};