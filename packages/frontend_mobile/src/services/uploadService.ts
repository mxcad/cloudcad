import { mxCadControllerUploadFile } from '../api-sdk';
import { calculateFileHash } from '../utils/hashUtils';

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
