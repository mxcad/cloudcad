import { getMxwebBlob } from './saveService';
import { uploadFileForConversion } from './uploadService';
import { publicFileControllerConvertAndDownload } from '../api-sdk';
import { handleApiError } from '../utils/apiConfig';
import { showToast } from 'vant';
import { t } from '@/languages';
import { h, createApp } from 'vue';
import { ActionSheet } from 'vant';

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
  fileName: string = 'drawing',
  pdfOptions?: PdfOptions,
  dwgOptions?: DwgOptions,
): Promise<void> {
  const blob = await getMxwebBlob();

  if (format === 'mxweb') {
    downloadBlob(blob, `${fileName}.mxweb`);
    showToast(t('下载完成'));
    return;
  }

  showToast(t('正在转换...'));
  const hash = await uploadFileForConversion(blob, `${fileName}.mxweb`);
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

    if (result.error) {
      handleApiError(result.error, t('转换失败'));
      return;
    }

    const convertedBlob = result?.data as Blob | undefined;
    if (!convertedBlob || convertedBlob.size === 0) {
      showToast(t('转换失败：无返回数据'));
      return;
    }

    downloadBlob(convertedBlob, `${fileName}.${format}`);
    showToast(t('下载完成'));
  } catch (e) {
    handleApiError(e, t('转换失败'));
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function showDwgOptionsDialog(format: 'dwg' | 'dxf'): Promise<number | null> {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let app: ReturnType<typeof createApp> | null = null;

    import('../../src/pages/home/components/DwgOptionsPopup.vue').then((mod) => {
      const comp = mod.default || mod;
      app = createApp(comp, {
        format,
        onConfirm: (dwgVersion: number) => {
          resolve(dwgVersion);
          app?.unmount();
          container.remove();
        },
        onCancel: () => {
          resolve(null);
          app?.unmount();
          container.remove();
        },
      });
      app.mount(container);
    });
  });
}

export function showPdfOptionsDialog(): Promise<PdfOptions | null> {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let app: ReturnType<typeof createApp> | null = null;

    import('../../src/pages/home/components/PdfOptionsPopup.vue').then((mod) => {
      const comp = mod.default || mod;
      app = createApp(comp, {
        onConfirm: (options: PdfOptions) => {
          resolve(options);
          app?.unmount();
          container.remove();
        },
        onCancel: () => {
          resolve(null);
          app?.unmount();
          container.remove();
        },
      });
      app.mount(container);
    });
  });
}

export function showExportDialog() {
  const formatMap: Record<string, ExportFormat> = {
    DWG: 'dwg',
    DXF: 'dxf',
    PDF: 'pdf',
    MXWEB: 'mxweb',
  };
  const actions = Object.keys(formatMap).map((name) => ({ name }));

  const container = document.createElement('div');
  document.body.appendChild(container);

  const app = createApp({
    render() {
      return h(ActionSheet, {
        show: true,
        actions,
        closeOnClickAction: true,
        title: t('选择导出格式'),
        cancelText: t('取消'),
        onSelect: async (action: { name: string }) => {
          const format = formatMap[action.name];
          if (!format) return;
          if (format === 'pdf') {
            const pdfOptions = await showPdfOptionsDialog();
            if (pdfOptions) {
              exportDrawing(format, undefined, pdfOptions);
            }
          } else if (format === 'dwg' || format === 'dxf') {
            const dwgVersion = await showDwgOptionsDialog(format);
            if (dwgVersion) {
              exportDrawing(format, undefined, undefined, { dwgVersion });
            }
          } else {
            exportDrawing(format);
          }
        },
        'onUpdate:show': (val: boolean) => {
          if (!val) {
            app.unmount();
            container.remove();
          }
        },
      });
    },
  });

  app.mount(container);
}

export function showExportMenu() {
  const actions = [
    { name: t('导出 PDF') },
    { name: t('导出 DWG') },
    { name: t('导出 DXF') },
  ];

  const formatMap: Record<string, ExportFormat> = {
    [t('导出 PDF')]: 'pdf',
    [t('导出 DWG')]: 'dwg',
    [t('导出 DXF')]: 'dxf',
  };

  const container = document.createElement('div');
  document.body.appendChild(container);

  const app = createApp({
    render() {
      return h(ActionSheet, {
        show: true,
        actions,
        closeOnClickAction: true,
        title: t('导出'),
        cancelText: t('取消'),
        onSelect: async (action: { name: string }) => {
          const format = formatMap[action.name];
          if (!format) return;
          if (format === 'pdf') {
            const pdfOptions = await showPdfOptionsDialog();
            if (pdfOptions) {
              exportDrawing(format, undefined, pdfOptions);
            }
          } else if (format === 'dwg' || format === 'dxf') {
            const dwgVersion = await showDwgOptionsDialog(format);
            if (dwgVersion) {
              exportDrawing(format, undefined, undefined, { dwgVersion });
            }
          }
        },
        'onUpdate:show': (val: boolean) => {
          if (!val) {
            app.unmount();
            container.remove();
          }
        },
      });
    },
  });

  app.mount(container);
}
