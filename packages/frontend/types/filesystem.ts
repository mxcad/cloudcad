export interface FileSystemNode {
  id: string;
  name: string;
  isFolder: boolean;
  isRoot: boolean;
  parentId: string | null;
  originalName?: string;
  path?: string;
  size?: number | null;
  mimeType?: string | null;
  extension?: string | null;
  fileStatus?: 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DELETED';
  fileHash?: string | null;
  description?: string | null;
  projectStatus?: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  children?: FileSystemNode[];
  _count?: {
    children: number;
    files: number;
    folders: number;
  };
}

export interface BreadcrumbItem {
  id: string;
  name: string;
  isRoot: boolean;
}

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  type?: 'danger' | 'warning' | 'info';
}