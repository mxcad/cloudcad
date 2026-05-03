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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyUppyFile = UppyFile<any, Record<string, unknown>>;

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const up = instance as any;

    instance.use(Tus, {
      endpoint: `${apiBaseUrl}/api/v1/files`,
      chunkSize: 5 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000],
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      metadata: (file: AnyUppyFile): Record<string, string> => {
        const fileMeta = file.meta || {};
        return {
          filename: file.name,
          fileHash: String(fileMeta.fileHash || ''),
          fileSize: String(file.size ?? ''),
          nodeId: config.nodeId || '',
          fileType: file.type ?? '',
        };
      },
    });

    up.on('file-added', async (file: AnyUppyFile) => {
      try {
        const hash = await calculateFileHash(file.data as File);
        instance.setFileMeta(file.id, { fileHash: hash });
        config.onFileQueued?.(file.data as File);
      } catch (error) {
        console.error('[useUppyUpload] 文件哈希计算失败:', error);
      }
    });

    up.on('upload-started', () => {
      config.onBeginUpload?.();
    });

    up.on('total-progress', (progress: { bytesTotal: number; bytesUploaded: number }) => {
      if (progress.bytesTotal > 0) {
        const percentage = Math.round(
          (progress.bytesUploaded / progress.bytesTotal) * 100,
        );
        config.onProgress?.(percentage);
      }
    });

    up.on('complete', (result: AnyUppyFile[]) => {
      if (result && result.length > 0) {
        const file = result[0];
        const successParam: LoadFileParam = {
          file: file.data as File,
          id: file.meta?.fileHash || file.id,
          name: file.name,
          size: file.size ?? 0,
          type: file.type ?? '',
          hash: file.meta?.fileHash || '',
          isUseServerExistingFile: false,
          isInstantUpload: false,
          nodeId: config.nodeId,
        };
        config.onSuccess?.(successParam);
      } else {
        config.onError?.('上传失败');
      }
      up.close();
    });

    up.on('upload-error', (file: AnyUppyFile, error: unknown) => {
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
      (uppy.value as any).close();
      uppy.value = null;
    }
  }

  return {
    selectFiles,
    destroy,
  };
}