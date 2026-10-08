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

/**
 * 触发浏览器直链下载（无 Blob，服务端流式响应）。
 *
 * 「URL 锚点下载」唯一出口：单文件直下、批量下载 zip/单项产物等统一走这里。
 * 文件名默认由服务端 Content-Disposition 决定；仅当传入非空 filename 才设置
 * download 属性（该属性存在时优先于响应头）。注意：download 属性设为空串会
 * 让浏览器强制取 URL 末段当文件名（忽略 Content-Disposition），故无文件名时
 * 必须整体省略该属性而非赋空串。
 */
export function triggerUrlDownload(url: string, filename?: string): void {
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
