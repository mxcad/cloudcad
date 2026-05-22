import { thumbnailControllerCheckThumbnail, thumbnailControllerUploadThumbnail } from '../api-sdk';

export function generateThumbnail(): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const canvas = document.getElementById('mxCanvas') as HTMLCanvasElement;
      if (!canvas) {
        resolve(null);
        return;
      }
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png', 0.5);
    } catch {
      resolve(null);
    }
  });
}

export async function uploadThumbnailForNode(nodeId: string): Promise<boolean> {
  try {
    const blob = await generateThumbnail();
    if (!blob) return false;

    const checkResult = await thumbnailControllerCheckThumbnail({ path: { nodeId } });
    if (!checkResult.error) {
      return true;
    }

    const file = new File([blob], 'thumbnail.png', { type: 'image/png' });
    const result = await thumbnailControllerUploadThumbnail({
      path: { nodeId },
      body: { file },
    });
    return !result.error;
  } catch {
    return false;
  }
}
