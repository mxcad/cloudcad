import {
  publicFileControllerGetPreloadingData,
  publicFileControllerCheckExtReference,
  publicFileControllerUploadExtReference,
} from '../api-sdk';
import { getApiBaseUrl } from '../utils/apiConfig';

export interface PublicPreloadingData {
  tz: boolean;
  src_file_md5: string;
  images: string[];
  externalReference: string[];
}

export function isHashLike(id: string): boolean {
  return /^[a-f0-9]{32}$/i.test(id);
}

export async function getPublicPreloadingData(
  hash: string
): Promise<PublicPreloadingData | null> {
  try {
    const result = await publicFileControllerGetPreloadingData({
      path: { hash },
    });
    if (result.error) return null;
    return result.data as unknown as PublicPreloadingData;
  } catch {
    return null;
  }
}

export async function checkPublicExtReference(
  srcHash: string,
  fileName: string
): Promise<boolean> {
  try {
    const result = await publicFileControllerCheckExtReference({
      query: { srcHash, fileName },
    });
    const data = result.data as unknown as { exists: boolean };
    return data?.exists ?? false;
  } catch {
    return false;
  }
}

export async function uploadPublicExtReferenceFile(params: {
  srcHash: string;
  file: File;
  extRefFile: string;
}): Promise<boolean> {
  try {
    const result = await publicFileControllerUploadExtReference({
      body: {
        file: params.file,
        srcFileHash: params.srcHash,
        extRefFile: params.extRefFile,
      } as never,
    });
    return !result.error;
  } catch {
    return false;
  }
}

export function buildPublicMxwebUrl(hash: string): string {
  const apiBaseUrl = getApiBaseUrl();
  const baseUrl = (() => {
    try {
      return new URL(apiBaseUrl).origin;
    } catch {
      return '';
    }
  })();
  const timestamp = Date.now();
  return `${baseUrl}/api/v1/public-file/access/${hash}.mxweb?t=${timestamp}`;
}

export function resolvePublicExtRefUrl(hash: string, fileName: string): string {
  const apiBaseUrl = getApiBaseUrl();
  const baseUrl = (() => {
    try {
      return new URL(apiBaseUrl).origin;
    } catch {
      return '';
    }
  })();
  return `${baseUrl}/api/v1/public-file/access/${hash}/${fileName}`;
}
