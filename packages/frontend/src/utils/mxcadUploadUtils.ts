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
import {
  mxcadUploadControllerCheckFileExist,
  mxcadUploadControllerCheckChunkExist,
  mxcadUploadControllerUploadFile,
} from '@/api-sdk';
import { calculateFileHash } from './hashUtils';
import { sanitizeFileName, CAD_EXTENSIONS } from './fileUtils';
import { MxCadUploadError, throwOnSdkError } from './mxcadUploadErrors';
import { t } from '@/languages';

/**
 * 从后端获取最新的最大文件大小配置（MB）
 * 优先使用缓存值，避免每次都调用API
 */
let cachedMaxFileSize: number | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 30 * 1000; // 30秒缓存

async function fetchMaxFileSizeFromBackend(): Promise<number> {
  const now = Date.now();
  if (cachedMaxFileSize !== null && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedMaxFileSize;
  }

  try {
    // 动态导入避免循环依赖
    const { runtimeConfigControllerGetPublicConfigs } = await import('@/api-sdk');
    const result = await runtimeConfigControllerGetPublicConfigs();
    if (result.data?.maxFileSize) {
      cachedMaxFileSize = Number(result.data.maxFileSize);
      lastFetchTime = now;
      return cachedMaxFileSize;
    }
  } catch (error) {
    console.warn('获取文件大小配置失败，使用默认值:', error);
  }

  return 100; // 默认100MB
}

/**
 * 将运行时配置的 maxFileSize（MB）同步进模块缓存。
 * 由 RuntimeConfigProvider 在公开配置加载/管理员保存后调用（单一同步点）；
 * TTL 内非 React 消费者（mxcadManager 等）经 fetchMaxFileSizeFromBackend 取到最新值，
 * TTL 过期后回源后端自愈。
 */
export function setUploadMaxFileSize(sizeMB: number): void {
  if (Number.isFinite(sizeMB) && sizeMB > 0) {
    cachedMaxFileSize = sizeMB;
    lastFetchTime = Date.now();
  }
}

export { MxCadUploadError } from './mxcadUploadErrors';
/**
 * MxCAD 上传配置接口
 */
export interface MxCadUploadOptions {
  /** 文件对象 */
  file: File;
  /** 文件哈希值 */
  hash: string;
  /** 目标节点 ID */
  nodeId: string;
  /** 冲突策略：skip（跳过）/ overwrite（覆盖）/ rename（重命名） */
  conflictStrategy?: 'skip' | 'overwrite' | 'rename';
  /** 强制上传，跳过秒传检查（无缓存打开时使用） */
  forceUpload?: boolean;
  /** 跳过 DB/转换/SVN 等后续操作，仅上传文件到 uploads 目录 */
  skipDb?: boolean;
  /** 开始上传回调 */
  onBeginUpload?: () => void;
  /** 进度回调 */
  onProgress?: (percentage: number) => void;
  /** 文件排队回调 */
  onFileQueued?: (file: File) => void;
  /** 最大文件大小（字节），默认从后端获取 */
  maxSize?: number;
}

/**
 * MxCAD 上传结果接口
 */
export interface MxCadUploadResult {
  /** 文件对象 */
  file: File;
  /** 文件哈希值 */
  hash: string;
  /** 节点 ID */
  nodeId: string;
  /** 文件名 */
  name: string;
  /** 文件大小 */
  size: number;
  /** MIME 类型 */
  type: string;
  /** 是否使用服务器已有文件（秒传） */
  isUseServerExistingFile: boolean;
  /** 是否为秒传 */
  isInstantUpload: boolean;
}

/**
 * 验证文件类型
 */
export const validateFileType = (file: File): boolean => {
  const fileExtension = '.' + file.name.split('.').pop();
  const normalizedExtension = fileExtension.toLowerCase();
  return CAD_EXTENSIONS.includes(normalizedExtension);
};

/**
 * 验证文件大小
 */
export const validateFileSize = (
  file: File,
  maxSize: number
): boolean => {
  return file.size <= maxSize;
};

/**
 * 分片上传文件（统一的上传逻辑）
 *
 * 该函数不依赖 React，可以在任何环境中使用：
 * - React 组件中（通过 useMxCadUploadNative Hook）
 * - 非 React 环境中（如 mxcadManager.ts 中的 openFile 命令）
 *
 * @param options 上传配置
 * @returns 上传结果
 * @throws MxCadUploadError 上传失败时抛出
 */
export const uploadMxCadFile = uploadFile;

/**
 * 分片上传文件（统一的上传逻辑）— 主要导出
 *
 */
export async function uploadFile(
  options: MxCadUploadOptions
): Promise<MxCadUploadResult> {
  const {
    file,
    hash,
    nodeId,
    conflictStrategy,
    forceUpload,
    skipDb,
    onBeginUpload,
    onProgress,
    onFileQueued,
    maxSize,
  } = options;

  // 验证文件类型
  if (!validateFileType(file)) {
    throw new MxCadUploadError(
      t('文件类型不支持: ${file.name} (支持 .dwg, .dxf, .mxweb)').replace(
        '${file.name}',
        file.name
      ),
      file.name
    );
  }

  // 验证文件大小 - 优先使用传入的maxSize，否则从后端获取最新配置
  const backendMaxFileSizeMB = await fetchMaxFileSizeFromBackend();
  const fileMaxSize = maxSize ?? backendMaxFileSizeMB * 1024 * 1024;
  if (!validateFileSize(file, fileMaxSize)) {
    throw new MxCadUploadError(
      t('文件过大: ${file.name} (最大${size}MB)')
        .replace('${file.name}', file.name)
        .replace('${size}', String(fileMaxSize / 1024 / 1024)),
      file.name
    );
  }

  // nodeId 可为空（公开上传场景）

  // 触发文件排队回调
  onFileQueued?.(file);

  // 清理文件名中的控制字符和非法字符，防止 busboy 拒绝
  const safeName = sanitizeFileName(file.name);
  const safeFile =
    safeName !== file.name
      ? new File([file], safeName, { type: file.type })
      : file;

  const chunkSize = 5 * 1024 * 1024; // 5MB
  const totalChunks = Math.ceil(file.size / chunkSize);

  // 1. 检查文件是否已存在（秒传）— forceUpload 时跳过，直接上传
  if (!forceUpload) {
    const existRequest = {
      fileSize: file.size,
      fileHash: hash,
      filename: safeName,
      nodeId,
      conflictStrategy,
    };
    const existData = await mxcadUploadControllerCheckFileExist({
      body: existRequest,
    });
    throwOnSdkError(existData, t('检查文件失败'), safeName);
    const data = existData.data!;

    // 秒传条件：文件存在于 uploads 目录（匿名/公开上传场景 nodeId 可能为 null，仍可秒传）
    if (data?.exists) {
      onProgress?.(100);
      return {
        file,
        hash,
        nodeId: data.nodeId || nodeId,
        name: safeName,
        size: file.size,
        type: file.type,
        isUseServerExistingFile: !!data.nodeId,
        isInstantUpload: true,
      };
    }
  }

  // 小文件（≤5MB）且非 skipDb 模式：直接上传，不走分片
  if (file.size <= chunkSize && !skipDb) {
    onBeginUpload?.();

    const uploadData = await mxcadUploadControllerUploadFile({
      body: {
        name: safeName,
        hash,
        size: file.size,
        nodeId,
        conflictStrategy,
        file: safeFile,
        forceUpload,
      },
    });
    throwOnSdkError(uploadData, t('服务器处理出错'), safeName);

    onProgress?.(100);

    if (uploadData.data?.ret === 'convertFileError') {
      throw new MxCadUploadError(
        t('服务器处理出错').replace('${file.name}', file.name),
        file.name
      );
    }

    return {
      file,
      hash,
      nodeId: uploadData.data?.nodeId ?? nodeId,
      name: safeName,
      size: file.size,
      type: file.type,
      isUseServerExistingFile: false,
      isInstantUpload: false,
    };
  }

  // 2. 开始分片上传（并发 3）
  onBeginUpload?.();

  let newNodeId: string | undefined;
  let skipResult: MxCadUploadResult | null = null; // skip 策略（文件已存在）提前终止标记
  let completedChunks = 0;
  const isLastChunk = (chunkIndex: number) => chunkIndex === totalChunks - 1;

  const uploadOneChunk = async (chunkIndex: number): Promise<void> => {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    // 分片存在性检查（断点续传 / 秒传）— forceUpload 时跳过，强制全量重传。
    // noCache 打开语义 = 不要任何缓存（含分片级缓存），故 forceUpload 一并门控此检查，
    // 否则已存在于服务端 chunk 目录的分片会被复用、不重传。
    let shouldUpload = true;
    if (!forceUpload) {
      const chunkData = await mxcadUploadControllerCheckChunkExist({
        body: {
          chunk: chunkIndex,
          chunks: totalChunks,
          size: chunk.size,
          fileHash: hash,
          filename: safeName,
          nodeId,
        },
      });
      throwOnSdkError(chunkData, t('检查分片失败'), safeName);
      const data = chunkData.data!;
      // mxcadApi 已自动解包，chunkData 直接是 { exists: boolean }
      shouldUpload = !data.exists;
    }

    if (shouldUpload) {
      const uploadData = await mxcadUploadControllerUploadFile({
        body: {
          chunk: chunkIndex,
          chunks: totalChunks,
          name: safeName,
          hash: hash,
          size: file.size,
          nodeId: nodeId,
          conflictStrategy: conflictStrategy,
          file: chunk,
          skipDb,
          forceUpload,
        },
      });
      throwOnSdkError(uploadData, t('服务器处理出错'), safeName);

      // mxcadApi 已自动解包，uploadData 直接是响应数据
      // 最后一个分片的响应可能带 nodeId（后端自动合并）
      if (isLastChunk(chunkIndex) && uploadData.data?.nodeId) {
        newNodeId = uploadData.data!.nodeId;

        // 检查是否是跳过策略（文件已存在）
        if (uploadData.data!.ret === 'fileAlreadyExist') {
          skipResult = {
            file,
            hash,
            nodeId: uploadData.data!.nodeId,
            name: safeName,
            size: file.size,
            type: file.type,
            isUseServerExistingFile: true,
            isInstantUpload: false,
          };
        }
      }
    }

    // 进度按完成数累计（并发下与分片序号无关）
    completedChunks++;
    onProgress?.((completedChunks / totalChunks) * 100);
  };

  // 并发池（3）：分片并行上传，到达顺序不确定——后端不依赖到达顺序触发合并，
  // 合并由下面的显式合并请求统一触发
  const CHUNK_CONCURRENCY = 3;
  let nextChunkIndex = 0;
  const workers = Array.from(
    { length: Math.min(CHUNK_CONCURRENCY, totalChunks) },
    async () => {
      while (!skipResult) {
        const chunkIndex = nextChunkIndex++;
        if (chunkIndex >= totalChunks) break;
        await uploadOneChunk(chunkIndex);
      }
    }
  );
  await Promise.all(workers);

  // skip 策略（文件已存在）：提前返回，不发合并请求
  if (skipResult) {
    onProgress?.(100);
    return skipResult;
  }

  // 3. 全部分片到齐（无论刚上传还是已存在）→ 显式合并请求。
  // 后端有幂等守卫（mergeKey + 分片数 + 临时目录检查）：最后一个分片已触发自动合并时
  // 本请求是 no-op（kOk / kChunkNoExist）；最后一个分片已存在（自动合并未触发）时
  // 本请求是合并的唯一入口。
  const mergeData = await mxcadUploadControllerUploadFile({
    body: {
      chunks: totalChunks,
      name: safeName,
      hash: hash,
      size: file.size,
      nodeId: nodeId,
      conflictStrategy: conflictStrategy,
      skipDb,
      forceUpload,
    },
  });
  throwOnSdkError(mergeData, t('服务器处理出错'), safeName);

  if (mergeData.data?.nodeId) {
    newNodeId = mergeData.data!.nodeId;
  }

  // 检查是否是跳过策略（文件已存在）。ret 在解包后的 data 内（与末片上传分支
  // 的 uploadData.data.ret 同层），外层 mergeData.ret 恒为 undefined 会漏判
  if (mergeData.data?.ret === 'fileAlreadyExist') {
    return {
      file,
      hash,
      nodeId: mergeData.data?.nodeId ?? '',
      name: safeName,
      size: file.size,
      type: file.type,
      isUseServerExistingFile: true,
      isInstantUpload: false,
    };
  }

  // 4. 直接使用合并时返回的 nodeId
  // 避免再次调用 fileisExist API，防止触发秒传逻辑导致重复创建节点
  const finalNodeId = newNodeId || nodeId;

  // 上传完成，设置进度为100%
  onProgress?.(100);

  return {
    file,
    hash,
    nodeId: finalNodeId,
    name: safeName,
    size: file.size,
    type: file.type,
    isUseServerExistingFile: false,
    isInstantUpload: false,
  };
}

/**
 * 计算文件哈希并上传（组合函数，供拖拽上传和正常上传共用）
 *
 * @param file 要上传的文件
 * @param nodeId 目标节点 ID
 * @param onProgress 进度回调（可选，percentage 0-100）
 * @returns 上传结果
 */
export async function uploadSingleFile(
  file: File,
  nodeId: string,
  onProgress?: (percentage: number) => void
): Promise<MxCadUploadResult> {
  const hash = await calculateFileHash(file);
  return uploadFile({ file, hash, nodeId, onProgress });
}
