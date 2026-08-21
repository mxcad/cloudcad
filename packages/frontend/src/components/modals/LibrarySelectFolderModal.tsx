import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Loader2 } from 'lucide-react';
import {
  libraryControllerGetDrawingLibrary,
  libraryControllerGetDrawingChildren,
  libraryControllerGetBlockLibrary,
  libraryControllerGetBlockChildren,
} from '@/api-sdk';
import type { FileSystemNode } from '../../types/filesystem';
import { FileTree } from '../ui/FileTree';
import { t } from '@/languages';

interface LibrarySelectFolderModalProps {
  isOpen: boolean;
  libraryType?: 'drawing' | 'block';
  libraryTypes?: ('drawing' | 'block')[];
  currentNodeId: string;
  onClose: () => void;
  onConfirm: (targetParentId: string, folderName?: string) => void;
}

interface FolderNode extends FileSystemNode {
  expanded: boolean;
  children?: FolderNode[];
  loading?: boolean;
  hasChildren?: boolean;
}

async function loadLibraryTree(
  libraryType: 'drawing' | 'block',
  excludeNodeId: string
): Promise<FolderNode> {
  const getLibraryApi =
    libraryType === 'drawing'
      ? libraryControllerGetDrawingLibrary
      : libraryControllerGetBlockLibrary;
  const getChildrenApi =
    libraryType === 'drawing'
      ? libraryControllerGetDrawingChildren
      : libraryControllerGetBlockChildren;

  const libResult = await getLibraryApi();
  if (libResult.error || !libResult.data)
    throw libResult.error || new Error('Failed to load library');
  const libData = libResult.data as { id: string; name: string };

  const childrenResult = await getChildrenApi({
    path: { nodeId: libData.id },
    query: { page: 1, limit: 100 },
  });

  const children: FileSystemNode[] =
    (childrenResult.data as { nodes?: FileSystemNode[] })?.nodes || [];
  const folders: FolderNode[] = children
    .filter((child) => child.isFolder && child.id !== excludeNodeId && child.id)
    .map((folder) => ({
      ...folder,
      id: folder.id!,
      expanded: false,
      children: [],
      loading: false,
      hasChildren: true,
    }));

  return {
    id: libData.id,
    name: libData.name,
    nodeType: 'FOLDER',
    isFolder: true,
    isRoot: true,
    createdAt: '',
    updatedAt: '',
    path: '',
    ownerId: '',
    expanded: true,
    children: folders,
    loading: false,
    hasChildren: folders.length > 0,
  };
}

async function loadChildren(
  libraryType: 'drawing' | 'block',
  nodeId: string,
  excludeNodeId: string
): Promise<FolderNode[]> {
  const getChildrenApi =
    libraryType === 'drawing'
      ? libraryControllerGetDrawingChildren
      : libraryControllerGetBlockChildren;
  try {
    const result = await getChildrenApi({
      path: { nodeId },
      query: { page: 1, limit: 100 },
    });
    const children: FileSystemNode[] =
      (result.data as { nodes?: FileSystemNode[] })?.nodes || [];
    return children
      .filter(
        (child) => child.isFolder && child.id !== excludeNodeId && child.id
      )
      .map((folder) => ({
        ...folder,
        id: folder.id!,
        expanded: false,
        children: [],
        loading: false,
        hasChildren: true,
      }));
  } catch {
    return [];
  }
}

export const LibrarySelectFolderModal: React.FC<
  LibrarySelectFolderModalProps
> = ({
  isOpen,
  libraryType,
  libraryTypes,
  currentNodeId,
  onClose,
  onConfirm,
}) => {
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const types: ('drawing' | 'block')[] =
    libraryTypes || (libraryType ? [libraryType] : ['drawing', 'block']);

  const loadFolderTree = useCallback(async () => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    try {
      const allTrees = await Promise.all(
        types.map((lt) => loadLibraryTree(lt, currentNodeId))
      );
      setFolderTree(allTrees);
    } catch (err) {
      setError(t('加载文件夹失败'));
      setFolderTree([]);
    } finally {
      setLoading(false);
    }
  }, [isOpen, types, currentNodeId]);

  useEffect(() => {
    if (isOpen) {
      loadFolderTree();
      setSelectedFolderId(null);
    }
  }, [isOpen, loadFolderTree]);

  // ref 模式：展开回调保持稳定引用，避免 FileTreeRow memo 因 onToggleExpand
  // 引用变化而失效（否则每次展开都会整树重渲染导致闪烁）
  const folderTreeRef = useRef(folderTree);
  folderTreeRef.current = folderTree;
  const currentNodeIdRef = useRef(currentNodeId);
  currentNodeIdRef.current = currentNodeId;
  const typesRef = useRef(types);
  typesRef.current = types;

  const getNodeLibraryType = useCallback((nodeId: string): 'drawing' | 'block' => {
    for (const root of folderTreeRef.current) {
      if (root.id === nodeId)
        return root.name.includes('图纸') ? 'drawing' : 'block';
      const findInChildren = (nodes: FolderNode[]): boolean => {
        for (const n of nodes) {
          if (n.id === nodeId) return true;
          if (n.children && findInChildren(n.children)) return true;
        }
        return false;
      };
      if (root.children && findInChildren(root.children)) {
        return root.name.includes('图纸') ? 'drawing' : 'block';
      }
    }
    return typesRef.current[0]!;
  }, []);

  const handleToggleFolder = useCallback(
    async (nodeId: string) => {
      const lt = getNodeLibraryType(nodeId);

      const updateTree = (nodes: FolderNode[]): FolderNode[] => {
        return nodes.map((node) => {
          if (node.id === nodeId) {
            if (node.expanded) {
              return { ...node, expanded: false };
            } else {
              if (!node.children || node.children.length === 0) {
                // 不渲染 loading 帧（箭头切 spinner 会造成闪烁感）：
                // 数据返回后由 then 回调展开，配合 FileTree 的 grid 展开动画平滑出现
                loadChildren(lt, nodeId, currentNodeIdRef.current).then(
                  (children) => {
                    setFolderTree((prev) =>
                      updateTreeAndSet(prev, nodeId, {
                        ...node,
                        children,
                        expanded: true,
                        hasChildren: children.length > 0,
                      })
                    );
                  }
                );
                return node;
              }
              return { ...node, expanded: true };
            }
          }
          if (node.children) {
            return { ...node, children: updateTree(node.children) };
          }
          return node;
        });
      };

      const updateTreeAndSet = (
        nodes: FolderNode[],
        targetId: string,
        updatedNode: FolderNode
      ): FolderNode[] => {
        return nodes.map((node) => {
          if (node.id === targetId) {
            return updatedNode;
          }
          if (node.children) {
            return {
              ...node,
              children: updateTreeAndSet(node.children, targetId, updatedNode),
            };
          }
          return node;
        });
      };

      setFolderTree((prev) => updateTree(prev));
    },
    [getNodeLibraryType]
  );

  const handleSelectFolder = useCallback((nodeId: string) => {
    setSelectedFolderId(nodeId);
  }, []);

  const findNodeById = (
    nodes: FolderNode[],
    id: string
  ): FolderNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return undefined;
  };

  const handleConfirm = useCallback(() => {
    if (selectedFolderId) {
      const node = findNodeById(folderTree, selectedFolderId);
      onConfirm(selectedFolderId, node?.name);
    }
  }, [selectedFolderId, folderTree, onConfirm]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('选择目标文件夹')}>
      <div className="space-y-4">
        {error && (
          <div
            className="p-3 rounded-lg"
            style={{
              background: 'var(--bg-error)',
              border: '1px solid var(--border-error)',
              color: 'var(--error)',
            }}
          >
            {error}
          </div>
        )}

        <div
          className="max-h-80 overflow-y-auto border rounded-[3px]"
          style={{
            borderColor: 'var(--border-default)',
            background: 'var(--bg-primary)',
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2
                size={24}
                className="animate-spin"
                style={{ color: 'var(--text-muted)' }}
              />
            </div>
          ) : folderTree.length === 0 ? (
            <div
              className="p-4 text-center"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('暂无文件夹')}
            </div>
          ) : (
            <FileTree
              nodes={folderTree}
              selectedId={selectedFolderId}
              onToggleExpand={handleToggleFolder}
              onSelect={(node) => handleSelectFolder(node.id)}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            {t('取消')}
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!selectedFolderId}
          >
            {t('确认')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default LibrarySelectFolderModal;
