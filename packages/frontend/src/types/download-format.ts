/**
 * 下载格式相关类型定义
 *
 * 从 DownloadFormatModal 组件中提取，供 hooks 和组件共享使用
 */

export type DownloadFormat = 'dwg' | 'dxf' | 'mxweb' | 'pdf';

export interface PdfOptions {
  width?: string;
  height?: string;
  colorPolicy?: 'mono' | 'color';
}

export interface DwgOptions {
  dwgVersion: number;
}
