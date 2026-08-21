import { t } from '@/languages';
import {
  mxcadExternalRefControllerUploadExtReferenceImage,
  mxcadExternalRefControllerCheckExternalReference,
} from '@/api-sdk';
import { MxCADSelectionSet, McDbRasterImage } from 'mxcad';
import { MxFun } from 'mxdraw';
import { handleError } from '@/utils/errorHandler';
import { globalShowToast } from '@/utils/notificationEvents';
import { mxcadManager } from '../mxcadManager';
import type { PendingImage } from '../mxcadTypes';
import type { Command, CommandContext, CommandResult } from './types';

let pendingImages: PendingImage[] = [];

export async function processPendingImages(): Promise<void> {
  const currentInfo = mxcadManager.getCurrentFileInfo();
  if (!currentInfo?.fileId || pendingImages.length === 0) return;

  const { MxCADResbuf, DxfCode } = await import('mxcad');
  const selectionSet = new MxCADSelectionSet();
  const imgIds = new Set<number>();
  selectionSet.allSelect();
  selectionSet.forEach((id) => {
    const entity = id.getMcDbEntity();
    if (entity instanceof McDbRasterImage) {
      imgIds.add(entity.imageDefId().id);
    }
  });

  const validImages = pendingImages.filter((img) => {
    try {
      return imgIds.has(img.entity.imageDefId().id);
    } catch {
      return false;
    }
  });

  if (validImages.length === 0) {
    pendingImages = [];
    return;
  }

  const failedImages: string[] = [];
  for (const img of validImages) {
    try {
      // eslint-disable-next-line no-restricted-globals -- 豁免：任意外部图片 URL（用户/图纸指定的外部资源，非后端 API，ADR-0034 豁免清单）
      const response = await fetch(img.url);
      if (!response.ok)
        throw new Error(`${t('下载图片失败: ')}${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], img.fileName, { type: blob.type });

      const result = await mxcadExternalRefControllerUploadExtReferenceImage({
        path: { nodeId: currentInfo.fileId },
        body: {
          file,
          nodeId: currentInfo.fileId,
          ext_ref_file: img.fileName,
          updatePreloading: true,
        },
      });
      // SDK 默认不抛错：失败时错误在 result.error，不检查会静默丢图
      if (result.error) throw result.error;

      try {
        const checkResult =
          await mxcadExternalRefControllerCheckExternalReference({
            path: { nodeId: currentInfo.fileId },
            body: { fileName: img.fileName },
          });
        const exists =
          (checkResult?.data as { exists?: boolean } | null)?.exists ?? false;
        if (!exists) {
          const nameWithoutExt = img.fileName.replace(/\.[^/.]+$/, '');
          if (nameWithoutExt !== img.fileName) {
            await mxcadExternalRefControllerCheckExternalReference({
              path: { nodeId: currentInfo.fileId },
              body: { fileName: nameWithoutExt },
            });
          }
        }
      } catch {
        // verify failure does not block main flow
      }
    } catch (error) {
      failedImages.push(img.fileName);
      handleError(error, 'mxcadManager: processPendingImages');
    }
  }

  if (failedImages.length > 0) {
    globalShowToast(
      t(`部分图片上传失败: ${failedImages.join(', ')}，请重新插入并保存`),
      'warning'
    );
    if (failedImages.length < validImages.length) {
      const failedNames = new Set(failedImages);
      pendingImages = pendingImages.filter((img) =>
        failedNames.has(img.fileName)
      );
    }
  } else {
    pendingImages = [];
  }
}

export class InsertImageCommand implements Command {
  readonly name = 'Mx_InsertImageWithUpload';

  async execute(_ctx: CommandContext): Promise<CommandResult> {
    MxFun.sendStringToExecute(
      '_InsertImage',
      async (data: {
        url: string;
        fileName: string;
        entity: McDbRasterImage;
      }) => {
        if (!data) return;
        const { url, fileName, entity } = data;
        const isDuplicate = pendingImages.some(
          (img) => img.entity.imageDefId().id === entity.imageDefId().id
        );
        if (isDuplicate) return;
        pendingImages.push({ url, fileName, entity });
        globalShowToast(t('图片已插入，将在保存时自动上传'), 'success');
      }
    );
    return { success: true };
  }
}
