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
import {
  mxcadExternalRefControllerGetPreloadingData,
  mxcadExternalRefControllerCheckExternalReference,
  mxcadFileAccessControllerGetFilesDataFile,
} from '@/api-sdk';
import {
  publicFileControllerGetPreloadingData,
  publicFileControllerCheckExtReference,
  publicFileControllerUploadExtReference,
} from '@/api-sdk';
import type { UploadExtReferenceDto } from '@/api-sdk';
import type {
  PreloadingData,
  ExternalReferenceFile,
  UploadState,
  UseExternalReferenceUploadConfig,
  UseExternalReferenceUploadReturn,
} from '../types/filesystem';

import {
  mxcadExternalRefControllerUploadExtReferenceImage,
  mxcadExternalRefControllerUploadExtReferenceDwg,
  publicFileControllerAccessFile,
} from '@/api-sdk';
import { getXrefName, getXrefSize } from '../types/filesystem';
import { handleError, getErrorMessage } from '../utils/errorHandler';
import { triggerBlobDownload } from '../utils/download';
import { t } from '@/languages';
import { globalShowToast } from '../utils/notificationEvents';
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
  const { setGlobalLoading, setLoadingMessage } = useUIStore();
  const [localLoading, setLocalLoading] = useState(false);
  const [files, setFiles] = useState<ExternalReferenceFile[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // 确定当前是使用 nodeId 还是 fileHash
  // CAD 编辑器场景统一使用 fileHash（通过公开上传服务）
  const identifier = config.fileHash || config.nodeId || '';

  // 使用 ref 存储标识符，确保闭包中始终使用最新值
  const identifierRef = useRef(identifier);

  // 存储由 checkMissingReferences 传入的显式 identifierParam
  // 解决 MxCadUploader 场景中 checkMissingReferences(fileNodeId) 与 uploadFiles 使用不同 ID 的问题
  const uploadTargetIdRef = useRef<string | undefined>(undefined);

  // 使用 ref 存储 files 状态，解决 selectAndUploadFiles 中 uploadFiles 闭包过期问题
  const filesRef = useRef(files);

  // 在 useEffect 中更新 ref，遵循 React 最佳实践
  useEffect(() => {
    identifierRef.current = config.fileHash || config.nodeId || '';
  }, [config.nodeId, config.fileHash]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // 标记是否使用公开上传（CAD编辑器场景）
  const usePublicUpload = !!config.fileHash;

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
        // 判断是使用公开上传服务还是节点 ID：
        // - 如果 config.fileHash 存在，使用公开上传服务（CAD 编辑器场景）
        // - 如果传入的 id 看起来像 hash（32位十六进制），也使用公开上传服务
        const isHashLike = /^[a-f0-9]{32}$/i.test(id);
        const shouldUsePublicUpload = usePublicUpload || isHashLike;

        if (shouldUsePublicUpload) {
          // CAD 编辑器场景：使用公开上传服务的预加载接口
          const publicResult = await publicFileControllerGetPreloadingData({
            path: { hash: id },
          });
          // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 catch 记录真实原因
          if (publicResult?.error) throw publicResult.error;
          data = publicResult?.data as PreloadingData | null;
        } else {
          // 项目文件场景：使用节点 ID 获取预加载数据
          const result = await mxcadExternalRefControllerGetPreloadingData({
            path: { nodeId: id },
          });
          if (result?.error) throw result.error;
          data = result?.data as PreloadingData | null;
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
        handleError(error, t('获取预加载数据失败'));

        return null;
      } finally {
        // 请求完成后移除标记

        pendingRequestsRef.current.delete(id);
      }
    },
    [usePublicUpload]
  );

  /**
   * 检查外部参照是否存在
   */
  const checkReferenceExists = useCallback(
    async (id: string, fileName: string): Promise<boolean> => {
      if (!id || !fileName) return false;
      try {
        let result = null;
        // 判断是使用公开上传服务还是节点 ID
        const isHashLike = /^[a-f0-9]{32}$/i.test(id);
        const shouldUsePublicUpload = usePublicUpload || isHashLike;

        if (shouldUsePublicUpload) {
          // CAD 编辑器场景：使用公开上传服务的检查接口
          const sdkResult = await publicFileControllerCheckExtReference({
            query: { srcHash: id, fileName },
          });
          // SDK 默认不抛错：失败时错误在 result.error
          if (sdkResult?.error) throw sdkResult.error;
          result = (sdkResult?.data ?? null) as { exists?: boolean } | null;
        } else {
          // 项目文件场景：使用节点 ID 检查
          const sdkResult =
            await mxcadExternalRefControllerCheckExternalReference({
              path: { nodeId: id },
              body: { fileName },
            });
          if (sdkResult?.error) throw sdkResult.error;
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
        // 接口失败时保守视为"存在"（fail-open）：避免已存在的参照被误标为缺失
        // 导致用户重复上传覆盖（覆盖是破坏性操作）；handleError 记录真实原因
        handleError(error, t('检查外部参照失败'));
        return true;
      }
    },
    [usePublicUpload]
  );

  /**
   * 检查缺失的外部参照
   * @param identifier 可选的节点ID或文件hash，如果不提供则使用 config
   * @param shouldRetry 是否启用重试逻辑。上传文件后应设为 true，手动点击查看时应设为 false（默认）
   * @param forceOpen 是否强制打开弹框。手动点击管理外部参照时应设为 true，上传后检查应设为 false（默认）
   * @returns 是否有缺失的外部参照
   */
  const checkMissingReferences = useCallback(
    async (
      identifierParam?: string,
      shouldRetry = false,
      forceOpen = false
    ): Promise<boolean> => {
      const id = identifierParam || identifierRef.current;
      if (identifierParam) {
        uploadTargetIdRef.current = identifierParam;
      } else {
        uploadTargetIdRef.current = undefined;
      }

      let preloadingData = null;

      // 上传后检查（shouldRetry=true）：需要重试等待 preloading.json 生成
      if (shouldRetry) {
        preloadingDataCacheRef.current.delete(id);

        let retryCount = 0;
        const maxRetries = 10;
        const retryDelay = 2000;

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
        // 手动点击（forceOpen）/ 其他场景：直接获取一次，立即反馈
        preloadingDataCacheRef.current.delete(id);
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

      // 过滤掉 http/https 开头的 URL（已有外部参照）及空名称（CAD 引擎可能返回无文件名图层）
      // images/externalReference 为 PreloadingFileInfoDto[] 对象数组
      const missingImages = images.filter((item) => {
        const name = getXrefName(item);
        return (
          name.trim().length > 0 &&
          !name.startsWith('http:') &&
          !name.startsWith('https:')
        );
      });
      // DWG 外部参照同样先过滤空名称，早退判断基于过滤后结果，避免全为空名时弹出空面板
      const validExternalReferences = externalReference.filter(
        (item) => getXrefName(item).trim().length > 0
      );

      if (missingImages.length === 0 && validExternalReferences.length === 0) {
        // 没有外部参照
        // 只有手动点击（forceOpen = true）时才打开弹框显示提示
        if (forceOpen) {
          setFiles([]);
          setIsOpen(true);
        }
        return false;
      }

      // 收集所有外部参照文件（包括已上传和缺失的）
      const allExternalReferences: ExternalReferenceFile[] = [];

      // 检查 DWG 外部参照
      for (const item of validExternalReferences) {
        const name = getXrefName(item);
        const exists = await checkReferenceExists(id, name);
        allExternalReferences.push({
          name,
          type: 'ref',
          size: getXrefSize(item),
          uploadState: exists
            ? ('success' as UploadState)
            : ('notSelected' as UploadState),
          progress: exists ? 100 : 0,
          exists,
        });
      }

      // 检查图片外部参照
      for (const item of missingImages) {
        const name = getXrefName(item);
        const exists = await checkReferenceExists(id, name);
        allExternalReferences.push({
          name,
          type: 'img',
          size: getXrefSize(item),
          uploadState: exists
            ? ('success' as UploadState)
            : ('notSelected' as UploadState),
          progress: exists ? 100 : 0,
          exists,
        });
      }

      // 有外部参照文件时弹出弹框（显示所有文件，包括已上传的）
      console.debug(
        '[useExternalReferenceUpload] 外部参照文件:',
        'external-reference',
        allExternalReferences
      );

      // 如果不是强制打开或重试模式，且该文件已经自动弹出过，则不再重复弹出
      // 防止每次跳转到 CAD 编辑器都弹出弹框
      if (
        !forceOpen &&
        !shouldRetry &&
        autoOpenedIdentifiersRef.current.has(id)
      ) {
        console.debug(
          `[useExternalReferenceUpload] 文件 ${id} 已自动检查过外部参照，跳过弹框`,
          'external-reference'
        );
        return true;
      }

      console.debug(
        `[useExternalReferenceUpload] 外部参照文件数: ${allExternalReferences.length} 个`,
        'external-reference'
      );

      setFiles(allExternalReferences);
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
        document.body.removeChild(input);
        return;
      }

      const selectedFiles = Array.from(input.files);
      document.body.removeChild(input);

      // 更新文件列表，使用不可变更新避免状态突变
      setFiles((prevFiles) => {
        const newFiles = prevFiles.map((f) => {
          const matchedFile = selectedFiles.find((sf) => sf.name === f.name);
          if (matchedFile) {
            return {
              ...f,
              source: matchedFile,
              uploadState: 'notSelected' as UploadState,
            };
          }
          return f;
        });

        // 提示未匹配的文件
        selectedFiles.forEach((sf) => {
          if (!prevFiles.some((f) => f.name === sf.name)) {
            globalShowToast(t(`未找到匹配的缺失文件: ${sf.name}`), 'warning');
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
      filesRef.current.map((f) => ({
        name: f.name,
        type: f.type,
        uploadState: f.uploadState,
        hasSource: !!f.source,
      }))
    );

    const filesToUpload = filesRef.current.filter(
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
    setGlobalLoading(true, t('正在上传外部参照...'));

    const id = uploadTargetIdRef.current || identifierRef.current;

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
        const extRefFile =
          fileInfo.source instanceof File
            ? fileInfo.source
            : new File([fileInfo.source], fileInfo.name);

        // 判断是使用公开上传服务还是节点 ID
        const isHashLike = /^[a-f0-9]{32}$/i.test(id);
        const shouldUsePublicUpload = usePublicUpload || isHashLike;

        if (shouldUsePublicUpload) {
          // CAD 编辑器场景：使用公开上传服务
          const uploadResult = await publicFileControllerUploadExtReference({
            body: {
              file: extRefFile,
              srcFileHash: id,
              extRefFile: fileInfo.name,
              originalXrefName: fileInfo.originalXrefName,
            } as UploadExtReferenceDto & { file: File },
          });
          if (uploadResult.error) throw uploadResult.error;
        } else {
          // 项目文件场景：使用节点 ID 上传
          if (fileInfo.type === 'img') {
            const uploadResult =
              await mxcadExternalRefControllerUploadExtReferenceImage({
                path: { nodeId: id },
                body: {
                  file: extRefFile,
                  nodeId: id,
                  ext_ref_file: fileInfo.name,
                  updatePreloading: true,
                  originalXrefName: fileInfo.originalXrefName,
                },
              });
            if (uploadResult.error) throw uploadResult.error;
          } else {
            const uploadResult =
              await mxcadExternalRefControllerUploadExtReferenceDwg({
                path: { nodeId: id },
                body: {
                  file: extRefFile,
                  nodeId: id,
                  ext_ref_file: fileInfo.name,
                  originalXrefName: fileInfo.originalXrefName,
                },
              });
            if (uploadResult.error) throw uploadResult.error;
          }
        }

        // 更新状态为成功，同时更新文件大小
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.name === fileInfo.name
              ? {
                  ...f,
                  uploadState: 'success' as UploadState,
                  progress: 100,
                  size: fileInfo.source?.size || f.size,
                }
              : f
          )
        );
      } catch (error) {
        handleError(error, t(`上传 ${fileInfo.name} 失败`));
        // 透传后端具体原因（配额/权限等），不再只显示固定"上传 xx 失败"
        config.onError?.(
          `${getErrorMessage(error) || t('上传失败')}：${fileInfo.name}`
        );

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

    // 上传完成后清除预加载数据缓存，确保下次检查获取最新数据
    const targetId = uploadTargetIdRef.current;
    const configId = identifierRef.current;
    if (targetId) {
      preloadingDataCacheRef.current.delete(targetId);
    }
    if (configId && configId !== targetId) {
      preloadingDataCacheRef.current.delete(configId);
    }

    setLocalLoading(false);
    setGlobalLoading(false);
  }, [config.nodeId, config.onError, usePublicUpload, setGlobalLoading]);

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
    if (filesRef.current.length === 0) {
      close();
      return;
    }

    const allSuccess = filesRef.current.every(
      (f) => f.uploadState === 'success'
    );

    // 先关闭弹窗，等一帧渲染完成后再触发回调打开文件
    close();
    if (allSuccess) {
      requestAnimationFrame(() => {
        config.onSuccess?.();
      });
    } else {
      // 部分文件未上传/上传失败：仍继续打开文件（等同跳过剩余上传），
      // 与 ExternalReferenceModal 的「继续打开」行为一致，避免弹窗关闭后无任何反馈
      console.debug(
        '[useExternalReferenceUpload] 部分文件上传失败，继续打开文件'
      );
      requestAnimationFrame(() => {
        config.onSkip?.();
      });
    }
  }, [config.onSuccess, config.onSkip, close]);

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
   * 刷新外部参照列表
   */
  const refresh = useCallback(async () => {
    const id = identifierRef.current;
    if (!id) return;
    preloadingDataCacheRef.current.delete(id);
    await checkMissingReferences(id, false, true);
  }, [checkMissingReferences]);

  /**
   * 选择文件并自动上传（替换模式时传入目标文件）
   */
  const selectAndUploadFiles = useCallback(
    (targetFile?: ExternalReferenceFile) => {
      const input = document.createElement('input');
      input.type = 'file';

      // 替换模式：根据目标文件类型设置过滤器；普通模式：接受所有支持的类型
      if (targetFile) {
        input.accept = targetFile.type === 'ref' ? '.dwg,.dxf' : 'image/*';
      } else {
        input.accept = '.dwg,image/*';
      }

      // 替换模式只选单个文件
      input.multiple = !targetFile;
      input.style.display = 'none';
      document.body.appendChild(input);

      input.onchange = async () => {
        if (!input.files) {
          document.body.removeChild(input);
          return;
        }

        const selectedFiles = Array.from(input.files);
        document.body.removeChild(input);

        if (targetFile) {
          // 替换模式：直接设置目标文件
          setFiles((prevFiles) =>
            prevFiles.map((f) =>
              f.name === targetFile.name
                ? {
                    ...f,
                    source: selectedFiles[0],
                    size: selectedFiles[0]?.size || f.size,
                    uploadState: 'notSelected' as UploadState,
                    originalXrefName: targetFile.name,
                  }
                : f
            )
          );
        } else {
          // 普通模式：按文件名匹配
          setFiles((prevFiles) => {
            const newFiles = prevFiles.map((f) => {
              const matchedFile = selectedFiles.find(
                (sf) => sf.name === f.name
              );
              if (matchedFile) {
                return {
                  ...f,
                  source: matchedFile,
                  uploadState: 'notSelected' as UploadState,
                };
              }
              return f;
            });

            selectedFiles.forEach((sf) => {
              if (!prevFiles.some((f) => f.name === sf.name)) {
                globalShowToast(
                  t('未找到匹配的缺失文件: {name}', { name: sf.name }),
                  'warning'
                );
              }
            });

            return newFiles;
          });
        }

        // 等待状态更新后再开始上传
        await new Promise((resolve) => setTimeout(resolve, 50));

        // 自动开始上传
        await uploadFiles();
      };

      input.click();
    },
    []
  );

  /**
   * 替换单个外部参照文件
   */
  const replaceFile = useCallback(
    (file: ExternalReferenceFile) => {
      selectAndUploadFiles(file);
    },
    [selectAndUploadFiles]
  );

  /**
   * 下载外部参照文件
   */
  const downloadFile = useCallback(
    async (file: ExternalReferenceFile) => {
      const id = identifierRef.current;
      if (!id || !file.name) return;

      const isHashLike = /^[a-f0-9]{32}$/i.test(id);

      try {
        if (isHashLike || usePublicUpload) {
          const result = await publicFileControllerAccessFile({
            path: { hash: id, filename: file.name },
          });
          // 透传后端真实原因（403 无权限等），不再一律误报"文件不存在"
          if (result.error) {
            globalShowToast(
              getErrorMessage(result.error) || t('下载失败：文件不存在'),
              'error'
            );
            return;
          }
          triggerBlobDownload(result.data as Blob, file.name);
          return;
        }
        // 私有分支：mxcad/filesData 下载。后端已声明 @Param('path')（ADR-0034 豁免已解除），
        // SDK 会把 path 编码后发往通配符路由，Express 5 自动解码 %2F，路径语义不变
        const fullName = file.type === 'ref' ? `${file.name}.mxweb` : file.name;
        const result = await mxcadFileAccessControllerGetFilesDataFile({
          path: { path: `${id}/${fullName}` },
          parseAs: 'blob',
        });
        if (result.error) {
          globalShowToast(
            getErrorMessage(result.error) || t('下载失败：文件不存在'),
            'error'
          );
          return;
        }
        triggerBlobDownload(result.data as Blob, file.name);
      } catch (error) {
        globalShowToast(getErrorMessage(error) || t('下载失败'), 'error');
      }
    },
    [usePublicUpload]
  );

  // 使用 useMemo 缓存返回对象，避免每次渲染都创建新对象
  const returnValue = useMemo(
    () => ({
      isOpen,
      files,
      loading: localLoading,
      checkMissingReferences,
      selectFiles,
      uploadFiles,
      selectAndUploadFiles,
      replaceFile,
      downloadFile,
      close,
      complete,
      skip,
      openModalForUpload,
      refresh,
    }),
    [
      isOpen,
      files,
      localLoading,
      checkMissingReferences,
      selectFiles,
      uploadFiles,
      selectAndUploadFiles,
      replaceFile,
      downloadFile,
      close,
      complete,
      skip,
      openModalForUpload,
      refresh,
    ]
  );

  return returnValue;
};

// 防止 Vite HMR 热替换时 hook 数量变化导致 React hook 顺序不匹配
if (import.meta.hot) {
  const hot = import.meta.hot;
  hot.accept(() => {
    hot.invalidate();
  });
}
