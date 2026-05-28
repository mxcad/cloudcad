import { mxCadControllerUploadExtReferenceImage } from '../api-sdk';

interface PendingImage {
  url: string;
  fileName: string;
  entity?: unknown;
}

const pendingImages: PendingImage[] = [];

export function addPendingImage(image: PendingImage): void {
  const exists = pendingImages.some((img) => img.fileName === image.fileName);
  if (!exists) {
    pendingImages.push(image);
  }
}

export function getPendingImages(): readonly PendingImage[] {
  return pendingImages;
}

export function clearPendingImages(): void {
  pendingImages.length = 0;
}

export async function processPendingImages(nodeId: string): Promise<void> {
  if (!nodeId || pendingImages.length === 0) return;

  const validImages = pendingImages.filter((img) => {
    if (
      img.entity &&
      typeof img.entity === 'object' &&
      'isErased' in img.entity
    ) {
      try {
        return !(img.entity as { isErased(): boolean }).isErased();
      } catch {
        return true;
      }
    }
    return true;
  });

  if (validImages.length === 0) {
    pendingImages.length = 0;
    return;
  }

  for (const img of validImages) {
    try {
      const response = await fetch(img.url);
      const blob = await response.blob();
      const file = new File([blob], img.fileName, {
        type: blob.type || 'image/png',
      });

      await mxCadControllerUploadExtReferenceImage({
        body: {
          file,
          hash: nodeId,
          ext_ref_file: img.fileName,
        },
      });
    } catch {
      // Silently fail individual image uploads
    }
  }

  pendingImages.length = 0;
}

export const pendingImageCount = () => pendingImages.length;
