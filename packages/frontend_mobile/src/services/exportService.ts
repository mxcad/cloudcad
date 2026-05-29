import { getMxwebBlob } from './saveService';
import { uploadFileForConversion } from './uploadService';
import { publicFileControllerConvertAndDownload } from '../api-sdk';
import { showToast } from 'vant';
import { h, createApp } from 'vue';
import { ActionSheet } from 'vant';

export type ExportFormat = 'dwg' | 'dxf' | 'pdf' | 'mxweb';

export interface PdfOptions {
  width?: string;
  height?: string;
  colorPolicy?: 'mono' | 'color';
}

export async function exportDrawing(
  format: ExportFormat,
  fileName: string = 'drawing',
  pdfOptions?: PdfOptions,
): Promise<void> {
  const blob = await getMxwebBlob();

  if (format === 'mxweb') {
    downloadBlob(blob, `${fileName}.mxweb`);
    showToast('下载完成');
    return;
  }

  showToast('正在转换...');
  const hash = await uploadFileForConversion(blob, `${fileName}.mxweb`);
  if (!hash) {
    showToast('上传文件失败');
    return;
  }

  try {
    const result = await publicFileControllerConvertAndDownload({
      body: {
        fileHash: hash,
        format,
        params: format === 'pdf' ? pdfOptions : undefined,
      },
    });

    if (result.error) {
      showToast('转换失败');
      return;
    }

    const convertedBlob = await result.response.blob();
    if (!convertedBlob || convertedBlob.size === 0) {
      showToast('转换失败：无返回数据');
      return;
    }

    downloadBlob(convertedBlob, `${fileName}.${format}`);
    showToast('下载完成');
  } catch {
    showToast('转换失败');
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

function showPdfOptionsDialog(): Promise<PdfOptions | null> {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let app: ReturnType<typeof createApp> | null = null;

    import('../../pages/home/components/PdfOptionsPopup.vue').then((mod) => {
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
        title: '选择导出格式',
        cancelText: '取消',
        onSelect: async (action: { name: string }) => {
          const format = formatMap[action.name];
          if (!format) return;
          if (format === 'pdf') {
            const pdfOptions = await showPdfOptionsDialog();
            if (pdfOptions) {
              exportDrawing(format, undefined, pdfOptions);
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
