export const DOWNLOAD_FORMATS = ['mxweb', 'dwg', 'dxf', 'pdf'] as const;
export type DownloadFormat = (typeof DOWNLOAD_FORMATS)[number];
export const FORMAT_LABELS: Record<DownloadFormat, string> = {
  mxweb: 'MXWEB',
  dwg: 'DWG',
  dxf: 'DXF',
  pdf: 'PDF',
};
