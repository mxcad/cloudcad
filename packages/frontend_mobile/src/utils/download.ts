/**
 * 触发浏览器下载一个 Blob 文件。
 *
 * 唯一出口：库下载、导出、外部参照下载等「拿到 Blob 后落盘」的逻辑统一走这里，
 * 各调用方不再各自 createElement('a') + click + revoke。
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
