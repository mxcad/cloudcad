import { mxcadExternalRefControllerUploadExtReferenceImage } from '../api-sdk';

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
      // eslint-disable-next-line no-restricted-globals -- 豁免：任意外部图片 URL（用户/图纸指定的外部资源，非后端 API，同 PC 端 ADR-0034 豁免清单）
      const response = await fetch(img.url);
      const blob = await response.blob();
      const file = new File([blob], img.fileName, {
        type: blob.type || 'image/png',
      });

      await mxcadExternalRefControllerUploadExtReferenceImage({
        path: { nodeId },
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
