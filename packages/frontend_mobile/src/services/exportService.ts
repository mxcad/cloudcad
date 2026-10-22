import { getMxwebBlob } from './saveService';
import { uploadFileForConversion } from './uploadService';
import { publicFileControllerConvertAndDownload } from '../api-sdk';
import { handleApiError } from '../utils/apiConfig';
import { unwrap } from '../utils/apiError';
import { triggerBlobDownload } from '../utils/download';
import { showToast } from 'vant';
import { t } from '@/languages';
import { useEditorStore } from '../stores/editor';

export type ExportFormat = 'dwg' | 'dxf' | 'pdf' | 'mxweb';

export interface PdfOptions {
  width?: string;
  height?: string;
  colorPolicy?: 'mono' | 'color';
}

export interface DwgOptions {
  dwgVersion: number;
}

const DWG_VERSION_MAP: Record<string, number> = {
  'CAD2000': 23,
  'CAD2004': 25,
  'CAD2007': 27,
  'CAD2010': 29,
  'CAD2018': 33,
};

export async function exportDrawing(
  format: ExportFormat,
  fileName?: string,
  pdfOptions?: PdfOptions,
  dwgOptions?: DwgOptions,
): Promise<void> {
  const baseName = fileName || useEditorStore().state.fileName.replace(/\.[^/.]+$/, '') || 'drawing';
  const blob = await getMxwebBlob();

  if (format === 'mxweb') {
    // MXWEB 是源格式、不转换：这是「本地另存为」的唯一实现，
    // 命令 Mx_SaveAsMxWeb 与导出面板「另存为」都走这里（勿在别处重写取 blob 逻辑）
    triggerBlobDownload(blob, `${baseName}.mxweb`);
    showToast(t('文件已保存到本地'));
    return;
  }

  showToast(t('正在转换...'));
  const hash = await uploadFileForConversion(blob, `${baseName}.mxweb`);
  if (!hash) {
    showToast(t('上传文件失败'));
    return;
  }

  try {
    let params: Record<string, unknown> | undefined;
    if (format === 'pdf' && pdfOptions) {
      params = { ...pdfOptions };
    } else if ((format === 'dwg' || format === 'dxf') && dwgOptions) {
      params = { dwgVersion: dwgOptions.dwgVersion };
    }

    const result = await publicFileControllerConvertAndDownload({
      body: {
        fileHash: hash,
        format,
        params,
      },
    });

    unwrap(result);

    const convertedBlob = result?.data as Blob | undefined;
    if (!convertedBlob || convertedBlob.size === 0) {
      showToast(t('转换失败：无返回数据'));
      return;
    }

    triggerBlobDownload(convertedBlob, `${baseName}.${format}`);
    showToast(t('下载完成'));
  } catch (e) {
    handleApiError(e, t('转换失败'));
  }
}
