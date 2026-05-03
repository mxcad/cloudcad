import { ref } from 'vue';
import Uppy, { type UppyFile } from '@uppy/core';
import Tus from '@uppy/tus';
import { calculateFileHash } from '@/utils/hashUtils';

export interface LoadFileParam {
  file: File;
  id: string;
  name: string;
  size: number;
  type: string;
  hash: string;
  isUseServerExistingFile: boolean;
  isInstantUpload?: boolean;
  nodeId?: string;
}

export interface MxCadUploadConfig {
  nodeId?: string;
  onBeginUpload?: () => void;
  onProgress?: (percentage: number) => void;
  onSuccess?: (param: LoadFileParam) => void;
  onError?: (error: string) => void;
  onFileQueued?: (file: File) => void;
}

interface UppyFileMeta {
  fileHash?: string;
  [key: string]: unknown;
}

interface UppyTotalProgress {
  bytesTotal?: number;
  bytesUploaded?: number;
  [key: string]: unknown;
}

interface UppyCompleteResult {
  successful?: Array<UppyFile<File, UppyFileMeta>>;
  failed?: Array<{ file: UppyFile<File, UppyFileMeta>; error: unknown }>;
}

export function useUppyUpload() {
  const uppy = ref<Uppy | null>(null);

  function getApiBaseUrl(): string {
    return import.meta.env.VITE_API_BASE_URL || '';
  }

  function getAuthToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  function createUppyInstance(config: MxCadUploadConfig): Uppy {
    const apiBaseUrl = getApiBaseUrl();
    const token = getAuthToken();

    const instance = new Uppy({
      debug: false,
      autoProceed: true,
      allowMultipleUploads: false,
      restrictions: {
        maxFileSize: 100 * 1024 * 1024,
        allowedFileTypes: ['.dwg', '.dxf', '.mxweb', '.mxwbe'],
        maxNumberOfFiles: 1,
      },
    });

    instance.use(Tus, {
      endpoint: `${apiBaseUrl}/api/v1/files`,
      chunkSize: 5 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000],
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      metadata: (file: UppyFile<File, UppyFileMeta>) => {
        const fileMeta = file.meta || {};
        return {
          filename: file.name,
          fileHash: fileMeta.fileHash || '',
          fileSize: String(file.size),
          nodeId: config.nodeId || '',
          fileType: file.type,
        };
      },
    });

    instance.on('file-added', async (file: UppyFile<File, UppyFileMeta>) => {
      try {
        const hash = await calculateFileHash(file.data);
        instance.setFileMeta(file.id, { fileHash: hash });
        config.onFileQueued?.(file.data);
      } catch (error) {
        console.error('[useUppyUpload] 文件哈希计算失败:', error);
      }
    });

    instance.on('upload-started', () => {
      config.onBeginUpload?.();
    });

    instance.on('total-progress', (progress: UppyTotalProgress) => {
      if (
        progress &&
        typeof progress.bytesTotal === 'number' &&
        progress.bytesTotal > 0
      ) {
        const percentage = Math.round(
          (progress.bytesUploaded / progress.bytesTotal) * 100,
        );
        config.onProgress?.(percentage);
      }
    });

    instance.on('complete', (result: UppyCompleteResult) => {
      if (result.successful && result.successful.length > 0) {
        const file = result.successful[0];
        const successParam: LoadFileParam = {
          file: file.data,
          id: file.meta?.fileHash || file.id,
          name: file.name,
          size: file.size,
          type: file.type,
          hash: file.meta?.fileHash || '',
          isUseServerExistingFile: false,
          isInstantUpload: false,
          nodeId: config.nodeId,
        };
        config.onSuccess?.(successParam);
      } else if (result.failed && result.failed.length > 0) {
        const failedItem = result.failed[0];
        const error = failedItem.error;
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : '上传失败';
        config.onError?.(errorMessage);
      }
      instance.close();
    });

    instance.on('upload-error', (file: UppyFile<File, UppyFileMeta>, error: unknown) => {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : '上传失败';
      config.onError?.(`文件 ${file.name} 上传失败: ${errorMessage}`);
    });

    return instance;
  }

  function selectFiles(config: MxCadUploadConfig): void {
    const instance = createUppyInstance(config);
    uppy.value = instance;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dwg,.dxf,.mxweb,.mxwbe';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        Array.from(files).forEach((file) => {
          instance.addFile({
            source: 'local',
            name: file.name,
            type: file.type,
            data: file,
          });
        });

        setTimeout(() => {
          instance.upload();
        }, 100);
      }
      document.body.removeChild(input);
    };

    input.click();
  }

  function destroy(): void {
    if (uppy.value) {
      uppy.value.close();
      uppy.value = null;
    }
  }

  return {
    selectFiles,
    destroy,
  };
}