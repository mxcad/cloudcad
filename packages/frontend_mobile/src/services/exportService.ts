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
  colorPolicy?: 'mono' | 'default';
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
        onSelect: (action: { name: string }) => {
          const format = formatMap[action.name];
          if (format) {
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
