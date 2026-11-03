import {
  mxcadUploadControllerCheckFileExist,
  mxcadUploadControllerCheckChunkExist,
  mxcadUploadControllerUploadFile,
} from '@cloudcad/api-sdk/sdk.gen';
import { handleApiError } from '@/utils/apiConfig';
import { sanitizeFileName } from '@/utils/sanitizeFileName';
import { useRuntimeConfig } from '@/composables/useRuntimeConfig';
import { t } from '@/languages';

export interface MobileUploadOptions {
  file: File;
  hash: string;
  nodeId: string;
  forceUpload?: boolean;
  forceConvert?: boolean;
  skipDb?: boolean;
  /** 覆盖通用 maxFileSize 上限（MB）。反馈图纸等专用上限大于通用上限时用 */
  maxSizeMb?: number;
  onBeginUpload?: () => void;
  onProgress?: (percentage: number) => void;
  onFileQueued?: (file: File) => void;
}

export interface MobileUploadResult {
  file: File;
  hash: string;
  name: string;
  size: number;
  type: string;
  ext: string;
  isUseServerExistingFile: boolean;
  /** 上传完成后图纸节点 ID（公开上传/秒传也可能有；失败/未建节点为 null） */
  nodeId: string | null;
}

export function getFileExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.substring(dot + 1).toLowerCase() : '';
}

export async function uploadFile(
  options: MobileUploadOptions,
): Promise<MobileUploadResult> {
  const {
    file,
    hash,
    nodeId,
    forceUpload,
    forceConvert,
    skipDb,
    maxSizeMb,
    onBeginUpload,
    onProgress,
    onFileQueued,
  } = options;

  // 显式 false 不能上送：multipart 把 boolean 序列化成字符串（"false"），后端
  // enableImplicitConversion 按 Boolean("false")===true 处理，普通打开会被误判成
  // 强制重转。故 false 时省略该字段（与 forceUpload 的既有约定一致）。
  const forceConvertField = forceConvert ? { forceConvert: true } : {};

  // 上传前按运行时配置拦截超大文件：后端同样会拒，但那时用户已白等一轮哈希，
  // 且只拿到通用的「上传失败」看不到原因。放在秒传/分片判断之前，
  // 一处覆盖全部上传入口（本地面板、原生选文件、文件浏览器、项目详情、另存）。
  // 专用上限（maxSizeMb，如反馈图纸 300MB）大于通用 maxFileSize 时以专用为准。
  const maxFileSize = useRuntimeConfig().config.value.maxFileSize;
  const limitMb = maxSizeMb && maxSizeMb > 0 ? maxSizeMb : maxFileSize;
  if (limitMb > 0 && file.size > limitMb * 1024 * 1024) {
    throw new Error(
      t('文件「{name}」超过大小上限（{size} MB）', {
        name: file.name,
        size: String(limitMb),
      }),
    );
  }

  onFileQueued?.(file);

  const safeName = sanitizeFileName(file.name);
  const safeFile = safeName !== file.name
    ? new File([file], safeName, { type: file.type })
    : file;

  const chunkSize = 5 * 1024 * 1024;
  const totalChunks = Math.ceil(file.size / chunkSize);

  try {

  if (!forceUpload) {
    const existData = await mxcadUploadControllerCheckFileExist({
      body: {
        fileSize: file.size,
        fileHash: hash,
        filename: safeName,
        nodeId,
      },
    });
    const data = existData.data;
    if (data?.exists) {
      onProgress?.(100);
      return {
        file,
        hash,
        name: safeName,
        size: file.size,
        type: file.type,
        ext: getFileExt(safeName),
        isUseServerExistingFile: true,
        nodeId: data?.nodeId ?? null,
      };
    }
  }

  if (file.size <= chunkSize && !skipDb) {
    onBeginUpload?.();

    const uploadRes = await mxcadUploadControllerUploadFile({
      body: {
        name: safeName,
        hash,
        size: file.size,
        nodeId,
        file: safeFile,
        forceUpload,
        ...forceConvertField,
      },
    });

    onProgress?.(100);

    return {
      file,
      hash,
      name: safeName,
      size: file.size,
      type: file.type,
      ext: getFileExt(safeName),
      isUseServerExistingFile: false,
      nodeId: uploadRes.data?.nodeId ?? null,
    };
  }

  onBeginUpload?.();

  let finalNodeId: string | null = null;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

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
      shouldUpload = !chunkData.data?.exists;
    }

    if (!shouldUpload) {
      onProgress?.(((chunkIndex + 1) / totalChunks) * 100);
      continue;
    }

    const uploadRes = await mxcadUploadControllerUploadFile({
      body: {
        chunk: chunkIndex,
        chunks: totalChunks,
        name: safeName,
        hash,
        size: file.size,
        nodeId,
        file: chunk,
        skipDb,
        forceUpload,
        // 后端最后一个分片自动触发合并，forceConvert 只在合并时生效，故每片都要带
        ...forceConvertField,
      },
    });
    if (uploadRes.data?.nodeId) finalNodeId = uploadRes.data.nodeId;

    if (chunkIndex === totalChunks - 1) {
      onProgress?.(100);
    } else {
      onProgress?.(((chunkIndex + 1) / totalChunks) * 100);
    }
  }

  return {
    file,
    hash,
    name: safeName,
    size: file.size,
    type: file.type,
    ext: getFileExt(safeName),
    isUseServerExistingFile: false,
    nodeId: finalNodeId,
  };
  } catch (e) {
    handleApiError(e, `${t('上传失败')}: ${file.name}`);
    throw e;
  }
}
