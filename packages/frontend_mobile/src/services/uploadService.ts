import {
  mxCadControllerUploadFile,
  mxCadControllerCheckFileExist,
} from '../api-sdk';
import { calculateFileHash } from '../utils/hashUtils';
import { getApiBaseUrl } from '../utils/apiConfig';

export async function uploadFileForConversion(blob: Blob, fileName: string = 'file.mxweb'): Promise<string | null> {
  try {
    const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
    const hash = await calculateFileHash(file);

    const result = await mxCadControllerUploadFile({
      body: {
        file,
        hash,
        name: fileName,
        size: file.size,
        skipDb: true,
      },
    });
    if (result.error) return null;
    return hash;
  } catch {
    return null;
  }
}

export interface PublicUploadResult {
  hash: string;
  url: string;
  isCached: boolean;
  fileName: string;
}

export async function uploadPublicFile(file: File): Promise<PublicUploadResult | null> {
  try {
    const hash = await calculateFileHash(file);

    const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '.mxweb';
    const mxwebFilename = `${hash}${ext}.mxweb`;
    const apiBaseUrl = getApiBaseUrl();
    const baseUrl = (() => {
      try { return new URL(apiBaseUrl).origin; } catch { return ''; }
    })();
    const url = `${baseUrl}/api/v1/public-file/access/${mxwebFilename}`;

    const existResult = await mxCadControllerCheckFileExist({
      body: {
        fileSize: file.size,
        fileHash: hash,
        filename: file.name,
        nodeId: '',
      },
    });

    if (existResult.data?.exists) {
      return { hash, url, isCached: true, fileName: file.name };
    }

    const uploadResult = await mxCadControllerUploadFile({
      body: {
        file,
        hash,
        name: file.name,
        size: file.size,
        nodeId: '',
      },
    });

    if (uploadResult.error) return null;

    return { hash, url, isCached: false, fileName: file.name };
  } catch {
    return null;
  }
}
