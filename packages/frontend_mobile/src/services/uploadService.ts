import {
  mxCadControllerUploadFile,
  mxCadControllerCheckFileExist,
} from '../api-sdk';
import { calculateFileHash } from '../utils/hashUtils';
import { getApiBaseUrl } from '../utils/apiConfig';
import { sanitizeFileName } from '../utils/sanitizeFileName';
import { uploadFile } from './mobileUploadService';

export async function uploadFileForConversion(blob: Blob, fileName: string = 'file.mxweb'): Promise<string | null> {
  try {
    const safeFileName = sanitizeFileName(fileName);
    const file = new File([blob], safeFileName, { type: blob.type || 'application/octet-stream' });
    const hash = await calculateFileHash(file);

    await uploadFile({
      file,
      hash,
      nodeId: '',
      skipDb: true,
    });
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
    const safeName = sanitizeFileName(file.name);

    const ext = safeName.includes('.') ? safeName.substring(safeName.lastIndexOf('.')) : '.mxweb';
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
        filename: safeName,
        nodeId: '',
      },
    });

    if (existResult.data?.exists) {
      return { hash, url, isCached: true, fileName: safeName };
    }

    const uploadResult = await mxCadControllerUploadFile({
      body: {
        file,
        hash,
        name: safeName,
        size: file.size,
        nodeId: '',
      },
    });

    if (uploadResult.error) return null;

    return { hash, url, isCached: false, fileName: safeName };
  } catch {
    return null;
  }
}
