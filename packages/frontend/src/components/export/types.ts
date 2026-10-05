/**
 * ExportModals 内部状态类型（ADR-0040）
 *
 * 4 组 modal state 的形状，仅供 components/export/ 内部消费。
 */
import type { ExternalReferenceFile } from '@/types/filesystem';

export interface DownloadFormatState {
  show: boolean;
  setShow: React.Dispatch<React.SetStateAction<boolean>>;
  nodeId: string;
  setNodeId: React.Dispatch<React.SetStateAction<string>>;
  fileName: string;
  setFileName: React.Dispatch<React.SetStateAction<string>>;
  loading: boolean;
}

export interface ExtRefFormatState {
  show: boolean;
  setShow: React.Dispatch<React.SetStateAction<boolean>>;
  file: ExternalReferenceFile | null;
  setFile: React.Dispatch<React.SetStateAction<ExternalReferenceFile | null>>;
  loading: boolean;
}

export interface PdfExportState {
  show: boolean;
  setShow: React.Dispatch<React.SetStateAction<boolean>>;
  blob: Blob | null;
  setBlob: React.Dispatch<React.SetStateAction<Blob | null>>;
  fileName: string;
  setFileName: React.Dispatch<React.SetStateAction<string>>;
}

export interface DwgExportState {
  show: boolean;
  setShow: React.Dispatch<React.SetStateAction<boolean>>;
  blob: Blob | null;
  setBlob: React.Dispatch<React.SetStateAction<Blob | null>>;
  fileName: string;
  setFileName: React.Dispatch<React.SetStateAction<string>>;
  format: 'dwg' | 'dxf';
  setFormat: React.Dispatch<React.SetStateAction<'dwg' | 'dxf'>>;
}
