/**
 * ExportModals 内部共享 — blob 上传 + 公开转换下载（ADR-0040）
 *
 * 供下载格式/PDF/DWG 三个导出簇共用：先把 blob 作为临时文件上传取 hash，
 * 再走公开转换端点下载目标格式。纯函数，无 React 状态。
 */
import { calculateFileHash } from '@/utils/hashUtils';
import { uploadFile } from '@/utils/mxcadUploadUtils';
import { publicFileControllerConvertAndDownload } from '@/api-sdk';
import { t } from '@/languages';
import type { DownloadFormat } from '@/types/download-format';

export async function uploadAndConvert(
  blob: Blob,
  format: DownloadFormat,
  params?: Record<string, unknown>
): Promise<Blob> {
  const file = new File([blob], 'export.mxweb', {
    type: 'application/octet-stream',
  });
  const hash = await calculateFileHash(file);
  await uploadFile({
    file,
    hash,
    nodeId: '',
    forceUpload: true,
    skipDb: true,
  });

  const result = await publicFileControllerConvertAndDownload({
    body: {
      fileHash: hash,
      format: format as 'dwg' | 'dxf' | 'mxweb' | 'pdf',
      params,
    },
  });

  if (result?.error) throw result.error;
  const resultBlob = result?.data as Blob | undefined;
  if (!resultBlob) throw new Error(t('转换失败：无返回数据'));
  return resultBlob;
}
