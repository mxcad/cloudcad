import {
  mxCadControllerCheckFileExist,
  mxCadControllerCheckChunkExist,
  mxCadControllerUploadFile,
} from '@/api-sdk/sdk.gen';
import { handleApiError } from '@/utils/apiConfig';
import { calculateFileHash } from '@/utils/hashUtils';
import { sanitizeFileName } from '@/utils/sanitizeFileName';

export interface MobileUploadOptions {
  file: File;
  hash: string;
  nodeId: string;
  forceUpload?: boolean;
  skipDb?: boolean;
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
}

function getFileExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.substring(dot + 1).toLowerCase() : '';
}

export class MobileUploadError extends Error {
  constructor(
    message: string,
    public readonly fileName?: string,
  ) {
    super(message);
    this.name = 'MobileUploadError';
  }
}

export async function uploadFile(
  options: MobileUploadOptions,
): Promise<MobileUploadResult> {
  const {
    file,
    hash,
    nodeId,
    forceUpload,
    skipDb,
    onBeginUpload,
    onProgress,
    onFileQueued,
  } = options;

  onFileQueued?.(file);

  const safeName = sanitizeFileName(file.name);
  const safeFile = safeName !== file.name
    ? new File([file], safeName, { type: file.type })
    : file;

  const chunkSize = 5 * 1024 * 1024;
  const totalChunks = Math.ceil(file.size / chunkSize);

  try {

  if (!forceUpload) {
    const existData = await mxCadControllerCheckFileExist({
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
      };
    }
  }

  if (file.size <= chunkSize && !skipDb) {
    onBeginUpload?.();

    await mxCadControllerUploadFile({
      body: {
        name: safeName,
        hash,
        size: file.size,
        nodeId,
        file: safeFile,
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
    };
  }

  onBeginUpload?.();

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    const chunkData = await mxCadControllerCheckChunkExist({
      body: {
        chunk: chunkIndex,
        chunks: totalChunks,
        size: chunk.size,
        fileHash: hash,
        filename: safeName,
        nodeId,
      },
    });

    if (chunkData.data?.exists) {
      onProgress?.(((chunkIndex + 1) / totalChunks) * 100);
      continue;
    }

    await mxCadControllerUploadFile({
      body: {
        chunk: chunkIndex,
        chunks: totalChunks,
        name: safeName,
        hash,
        size: file.size,
        nodeId,
        file: chunk,
        skipDb,
      },
    });

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
  };
  } catch (e) {
    handleApiError(e, `上传失败: ${file.name}`);
    throw e;
  }
}

export async function uploadSingleFile(
  file: File,
  nodeId: string = '',
  onProgress?: (percentage: number) => void,
): Promise<MobileUploadResult> {
  const hash = await calculateFileHash(file);
  return uploadFile({ file, hash, nodeId, onProgress });
}
