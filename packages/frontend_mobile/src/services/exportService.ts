import { getMxwebBlob } from './saveService';
import { showToast } from 'vant';

export type ExportFormat = 'dwg' | 'dxf' | 'pdf' | 'mxweb';

export async function exportDrawing(format: ExportFormat, fileName: string = 'drawing'): Promise<void> {
  const blob = await getMxwebBlob();

  if (format === 'mxweb') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.mxweb`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('下载完成');
    return;
  }

  showToast('暂时仅支持 mxweb 格式直接导出');
}

export async function showExportDialog(): Promise<void> {
  await exportDrawing('mxweb');
}
