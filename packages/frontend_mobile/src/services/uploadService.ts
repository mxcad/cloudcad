import { calculateFileHash } from '../utils/hashUtils';
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
