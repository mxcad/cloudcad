import type { RefObject } from 'react';
import type { BatchActionBarProps } from '@/components/common/BatchActionBar';
import type { FileSystemHeaderProps } from './FileSystemHeader';
import type { FileSystemContentProps } from './FileSystemContent';
import type { FileSystemModalsProps } from './FileSystemModals';
import type { FileSystemStatesProps } from './FileSystemStates';

export interface FileSystemManagerViewProps {
  containerRef: RefObject<HTMLDivElement | null>;
  isMobile: boolean;
  /** 上传权限（用于文件拖拽覆盖层） */
  canUpload: boolean;
  /** 文件拖拽上传 handlers（原始，未做权限判断） */
  fileDropHandlers?: FileSystemContentProps['fileDropHandlers'];
  headerProps: FileSystemHeaderProps;
  statesProps: FileSystemStatesProps;
  contentProps: FileSystemContentProps;
  batchBarProps: BatchActionBarProps | null;
  modalsProps: FileSystemModalsProps;
}
