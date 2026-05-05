import {
  publicFileControllerCheckFile,
  publicFileControllerCheckChunk,
  publicFileControllerUploadChunk,
  publicFileControllerMergeChunks,
  publicFileControllerGetPreloadingData,
  publicFileControllerCheckExtReference,
  publicFileControllerUploadExtReference,
} from '@/api-sdk';

export interface CheckFilePublicParams {
  filename: string;
  fileHash: string;
}

export interface CheckFilePublicResponse {
  exist: boolean;
  hash?: string;
  fileName?: string;
}

export interface UploadChunkResponse {
  ret: 'success' | 'error';
  isLastChunk?: boolean;
}

export interface MergeChunksResponse {
  ret: 'success' | 'error';
  hash: string;
  fileName: string;
}

export const publicFileApi = {
  checkFile: async (params: CheckFilePublicParams): Promise<CheckFilePublicResponse> => {
    const response = await publicFileControllerCheckFile({ body: params });
    return response as CheckFilePublicResponse;
  },

  checkChunk: async (params: {
    fileHash: string;
    chunk: number;
    chunks: number;
  }): Promise<{ exist: boolean }> => {
    const response = await publicFileControllerCheckChunk({ body: params });
    return response as { exist: boolean };
  },

  uploadChunk: async (formData: FormData): Promise<UploadChunkResponse> => {
    const response = await publicFileControllerUploadChunk({ body: formData as never });
    return response as UploadChunkResponse;
  },

  mergeChunks: async (params: {
    hash: string;
    name: string;
    size: number;
    chunks: number;
  }): Promise<MergeChunksResponse> => {
    const response = await publicFileControllerMergeChunks({ body: params });
    return response as MergeChunksResponse;
  },

  getFileAccessUrl: (hash: string, filename?: string): string => {
    if (filename) {
      return `/api/v1/public-file/access/${hash}/${filename}`;
    }
    return `/api/v1/public-file/access/${hash}.mxweb`;
  },

  uploadFile: async (
    file: File,
    chunkSize: number = 5 * 1024 * 1024,
    onProgress?: (percentage: number) => void,
    noCache?: boolean
  ): Promise<MergeChunksResponse> => {
    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / chunkSize);

    const { calculateFileHash } = await import('../utils/hashUtils');
    const hash = await calculateFileHash(file);

    if (!noCache) {
      const checkResult = await publicFileApi.checkFile({
        filename: file.name,
        fileHash: hash,
      });

      if (checkResult.exist && checkResult.hash) {
        return {
          ret: 'success',
          hash: checkResult.hash,
          fileName: checkResult.fileName || file.name,
        };
      }
    }

    let uploadedChunks = 0;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, totalSize);
      const chunk = file.slice(start, end);

      const formData = new FormData();
      formData.append('hash', hash);
      formData.append('name', file.name);
      formData.append('size', totalSize.toString());
      formData.append('chunk', i.toString());
      formData.append('chunks', totalChunks.toString());
      formData.append('file', chunk);

      await publicFileApi.uploadChunk(formData);

      uploadedChunks++;
      if (onProgress) {
        onProgress((uploadedChunks / totalChunks) * 100);
      }
    }

    const result = await publicFileApi.mergeChunks({
      hash,
      name: file.name,
      size: totalSize,
      chunks: totalChunks,
    });

    console.log('[publicFileApi] mergeChunks result:', JSON.stringify(result));

    return result;
  },

  uploadExtReference: async (
    file: File,
    srcFileHash: string,
    extRefFileName: string,
    fileHash?: string
  ): Promise<{ ret: string; hash?: string; message?: string }> => {
    const formData = new FormData();
    formData.append('srcFileHash', srcFileHash);
    formData.append('extRefFile', extRefFileName);
    if (fileHash) {
      formData.append('hash', fileHash);
    }
    formData.append('file', file);

    const response = await publicFileControllerUploadExtReference({ body: formData as never });
    return response as { ret: string; hash?: string; message?: string };
  },

  checkExtReference: async (
    srcFileHash: string,
    extRefFileName: string
  ): Promise<{ exists: boolean }> => {
    const response = await publicFileControllerCheckExtReference({
      query: { srcHash: srcFileHash, fileName: extRefFileName },
    });
    return response as { exists: boolean };
  },

  getPreloadingData: async (hash: string) => {
    try {
      const response = await publicFileControllerGetPreloadingData({ path: { hash } });
      return response;
    } catch (error) {
      console.warn('[publicFileApi] getPreloadingData failed:', error);
      return null;
    }
  },
};
