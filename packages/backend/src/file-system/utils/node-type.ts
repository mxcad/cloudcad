import { NodeType } from '@cloudcad/db';
import type { FileSystemNodeDto } from '../dto/file-system-response.dto';
import { FileStatus } from '../../common/enums/file-status.enum';

type NodeLike = {
  nodeType: NodeType | null;
  ownerId?: string | null;
  libraryKey?: string | null;
  isRoot?: boolean | null;
  isFolder?: boolean | null;
};

export function isRootNode(node: NodeLike): boolean {
  switch (node.nodeType) {
    case NodeType.PROJECT:
    case NodeType.PERSONAL_SPACE:
    case NodeType.LIBRARY_DRAWING:
    case NodeType.LIBRARY_BLOCK:
      return true;
    default:
      return false;
  }
}

export function isFolderNode(node: NodeLike): boolean {
  return node.nodeType !== NodeType.FILE;
}

export function isLibraryNode(node: NodeLike): boolean {
  return node.nodeType === NodeType.LIBRARY_DRAWING || node.nodeType === NodeType.LIBRARY_BLOCK;
}

export function getLibraryKeyFromNodeType(nodeType: NodeType): string | undefined {
  if (nodeType === NodeType.LIBRARY_DRAWING) return 'drawing';
  if (nodeType === NodeType.LIBRARY_BLOCK) return 'block';
  return undefined;
}

type ToDtoResult<T> = Omit<FileSystemNodeDto, 'fileStatus'> &
  Omit<T, 'fileStatus' | 'children'> & {
    fileStatus?: FileStatus;
    children?: FileSystemNodeDto[];
  };

export function toDto<T extends Record<string, unknown>>(raw: T): ToDtoResult<T> {
  const nodeType = raw.nodeType as NodeType;
  return {
    ...raw,
    isFolder: isFolderNode(raw as unknown as NodeLike),
    isRoot: isRootNode(raw as unknown as NodeLike),
    libraryKey: getLibraryKeyFromNodeType(nodeType),
  } as unknown as ToDtoResult<T>;
}
