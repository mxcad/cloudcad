///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { mxcadApi } from '../services/mxcadApi';

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
  /** 开始上传回调 */
  onBeginUpload?: () => void;
  /** 进度回调 */
  onProgress?: (percentage: number) => void;
  /** 文件排队回调 */
  onFileQueued?: (file: File) => void;
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
 * MxCAD 文件上传错误
 */
export class MxCadUploadError extends Error {
  constructor(
    message: string,
    public readonly fileName?: string
  ) {
    super(message);
    this.name = 'MxCadUploadError';
  }
}

/**
 * 验证文件类型
 */
export const validateFileType = (file: File): boolean => {
  const fileExtension = '.' + file.name.split('.').pop();
  const normalizedExtension = fileExtension.toLowerCase();
  return ['.dwg', '.dxf'].includes(normalizedExtension);
};

/**
 * 验证文件大小
 */
export const validateFileSize = (
  file: File,
  maxSize: number = 100 * 1024 * 1024
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
export const uploadMxCadFile = async (
  options: MxCadUploadOptions
): Promise<MxCadUploadResult> => {
  const { file, hash, nodeId, onBeginUpload, onProgress, onFileQueued } =
    options;

  // 验证文件类型
  if (!validateFileType(file)) {
    throw new MxCadUploadError(
      `文件类型不支持: ${file.name} (支持 .dwg, .dxf)`,
      file.name
    );
  }

  // 验证文件大小
  if (!validateFileSize(file)) {
    throw new MxCadUploadError(`文件过大: ${file.name} (最大100MB)`, file.name);
  }

  if (!nodeId) {
    throw new MxCadUploadError('缺少节点 ID，请确保已选择目标文件夹');
  }

  // 触发文件排队回调
  onFileQueued?.(file);

  const chunkSize = 5 * 1024 * 1024; // 5MB
  const totalChunks = Math.ceil(file.size / chunkSize);

  // 构建请求参数

  // 1. 检查文件是否已存在（秒传）
  const existRequest = {
    fileSize: file.size,
    fileHash: hash,
    filename: file.name,
    nodeId,
  };
  const existData = await mxcadApi.checkFileExist(existRequest);

  // mxcadApi 已自动解包，existData 直接是 { exists: boolean, nodeId?: string }
  if (existData?.exists) {
    // 秒传成功
    const instantNodeId = existData.nodeId || nodeId;
    return {
      file,
      hash,
      nodeId: instantNodeId,
      name: file.name,
      size: file.size,
      type: file.type,
      isUseServerExistingFile: true,
      isInstantUpload: true,
    };
  }

  // 2. 开始分片上传
  onBeginUpload?.();

  let newNodeId: string | undefined;
  let hasUploadedAnyChunk = false; // 标记是否有任何分片被上传
  const isLastChunk = (chunkIndex: number) => chunkIndex === totalChunks - 1;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    // 检查分片是否存在
    const chunkRequest = {
      chunk: chunkIndex,
      chunks: totalChunks,
      size: chunk.size,
      fileHash: hash,
      filename: file.name,
      nodeId,
    };
    const chunkData = await mxcadApi.checkChunkExist(chunkRequest);

    // mxcadApi 已自动解包，chunkData 直接是 { exists: boolean }
    if (chunkData?.exists) {
      // 分片已存在，跳过
      onProgress?.(((chunkIndex + 1) / totalChunks) * 100);
      continue;
    }

    // 上传分片
    const formData = new FormData();
    formData.append('chunk', chunkIndex.toString());
    formData.append('chunks', totalChunks.toString());
    formData.append('name', file.name);
    formData.append('hash', hash);
    formData.append('size', file.size.toString());
    formData.append('nodeId', nodeId);
    formData.append('file', chunk);

    const uploadData = await mxcadApi.uploadChunk(formData);

    hasUploadedAnyChunk = true; // 标记已上传至少一个分片

    // mxcadApi 已自动解包，uploadData 直接是响应数据
    // 最后一个分片上传完成后，检查响应中是否包含 nodeId
    if (isLastChunk(chunkIndex) && uploadData?.nodeId) {
      newNodeId = uploadData.nodeId;
    }

    onProgress?.(((chunkIndex + 1) / totalChunks) * 100);
  }

  // 3. 如果所有分片都已存在（没有上传任何新分片），发送合并请求
  if (!hasUploadedAnyChunk) {
    // 发送合并请求（不包含文件，只包含合并参数）
    const mergeFormData = new FormData();
    mergeFormData.append('chunks', totalChunks.toString());
    mergeFormData.append('name', file.name);
    mergeFormData.append('hash', hash);
    mergeFormData.append('size', file.size.toString());
    mergeFormData.append('nodeId', nodeId);

    const mergeData = await mxcadApi.uploadChunk(mergeFormData);

    // mxcadApi 已自动解包，mergeData 直接是响应数据
    if (mergeData?.nodeId) {
      newNodeId = mergeData.nodeId;
    }
  }

  // 4. 直接使用合并时返回的 nodeId
  // 避免再次调用 fileisExist API，防止触发秒传逻辑导致重复创建节点
  const finalNodeId = newNodeId || nodeId;

  return {
    file,
    hash,
    nodeId: finalNodeId,
    name: file.name,
    size: file.size,
    type: file.type,
    isUseServerExistingFile: false,
    isInstantUpload: false,
  };
};
