import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Folder } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { Check } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { libraryControllerGetDrawingLibrary, libraryControllerGetDrawingChildren, libraryControllerGetBlockLibrary, libraryControllerGetBlockChildren } from '@/api-sdk';
import { FileSystemNode } from '../../types/filesystem';

interface LibrarySelectFolderModalProps {
  isOpen: boolean;
  libraryType: 'drawing' | 'block';
  currentNodeId: string;
  onClose: () => void;
  onConfirm: (targetParentId: string) => void;
}

interface FolderNode extends FileSystemNode {
  expanded: boolean;
  children?: FolderNode[];
  loading?: boolean;
  hasChildren?: boolean;
}

export const LibrarySelectFolderModal: React.FC<
  LibrarySelectFolderModalProps
> = ({ isOpen, libraryType, currentNodeId, onClose, onConfirm }) => {
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryName, setLibraryName] = useState<string>('');

  const getChildrenApi =
    libraryType === 'drawing'
      ? libraryControllerGetDrawingChildren
      : libraryControllerGetBlockChildren;

  const getLibraryApi =
    libraryType === 'drawing'
      ? libraryControllerGetDrawingLibrary
      : libraryControllerGetBlockLibrary;

  const loadChildren = useCallback(
    async (nodeId: string, excludeNodeId: string): Promise<FolderNode[]> => {
      try {
        const response = await getChildrenApi({ path: { nodeId }, query: { page: 1, limit: 100 } });
        let children: FileSystemNode[] = [];

        if (response && (response as any).nodes) {
          children = (response as any).nodes as unknown as FileSystemNode[];
        }

        const folders: FolderNode[] = children
          .filter((child) => {
            const isFolder = child.isFolder;
            const isExcluded = child.id === excludeNodeId;
            return isFolder && !isExcluded && child.id;
          })
          .map((folder) => ({
            ...folder,
            id: folder.id!,
            expanded: false,
            children: [],
            loading: false,
            hasChildren: true,
          }));

        return folders;
      } catch {
        return [];
      }
    },
    [getChildrenApi]
  );

  const loadFolderTree = useCallback(async () => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    try {
      const library = await getLibraryApi() as any as { id: string; name: string };
      setLibraryName(library.name);

      const rootFolders = await loadChildren(library.id, currentNodeId);

      setFolderTree([
        {
          id: library.id,
          name: library.name,
          isFolder: true,
          isRoot: true,
          createdAt: '',
          updatedAt: '',
          path: '',
          ownerId: '',
          expanded: true,
          children: rootFolders,
          loading: false,
          hasChildren: rootFolders.length > 0,
        },
      ]);
    } catch (err) {
      setError('加载文件夹失败');
      setFolderTree([]);
    } finally {
      setLoading(false);
    }
  }, [isOpen, getLibraryApi, getChildrenApi, loadChildren, currentNodeId]);

  useEffect(() => {
    if (isOpen) {
      loadFolderTree();
      setSelectedFolderId(null);
    }
  }, [isOpen, loadFolderTree]);

  const handleToggleFolder = useCallback(
    async (nodeId: string) => {
      const updateTree = (nodes: FolderNode[]): FolderNode[] => {
        return nodes.map((node) => {
          if (node.id === nodeId) {
            if (node.expanded) {
              return { ...node, expanded: false };
            } else {
              if (!node.children || node.children.length === 0) {
                loadChildren(nodeId, currentNodeId).then((children) => {
                  setFolderTree((prev) =>
                    updateTreeAndSet(prev, nodeId, {
                      ...node,
                      children,
                      expanded: true,
                      hasChildren: children.length > 0,
                    })
                  );
                });
                return { ...node, loading: true };
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
    [loadChildren, currentNodeId]
  );

  const handleSelectFolder = useCallback((nodeId: string) => {
    setSelectedFolderId(nodeId);
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedFolderId) {
      onConfirm(selectedFolderId);
    }
  }, [selectedFolderId, onConfirm]);

  const renderFolderTree = (nodes: FolderNode[], depth: number = 0) => {
    return nodes.map((node) => (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
            selectedFolderId === node.id
              ? 'bg-blue-100 text-blue-700'
              : 'hover:bg-gray-100'
          }`}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => handleSelectFolder(node.id)}
        >
          {node.isRoot || node.hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!node.loading) {
                  handleToggleFolder(node.id);
                }
              }}
              className="p-0.5 hover:bg-gray-200 rounded"
              disabled={node.loading}
            >
              {node.loading ? (
                <Loader2 size={14} className="animate-spin text-gray-400" />
              ) : node.expanded ? (
                <ChevronDown size={14} className="text-gray-400" />
              ) : (
                <ChevronRight size={14} className="text-gray-400" />
              )}
            </button>
          ) : (
            <span className="w-[14px]" />
          )}

          <Folder size={16} className="text-yellow-500" />

          <span className="flex-1 truncate text-sm">{node.name}</span>

          {selectedFolderId === node.id && (
            <Check size={16} className="text-blue-500" />
          )}
        </div>

        {node.expanded && node.children && (
          <div>{renderFolderTree(node.children, depth + 1)}</div>
        )}
      </div>
    ));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`选择目标文件夹`}>
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="max-h-80 overflow-y-auto border rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : folderTree.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              暂无文件夹
            </div>
          ) : (
            renderFolderTree(folderTree)
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!selectedFolderId}
          >
            确认
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default LibrarySelectFolderModal;