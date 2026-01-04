import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Folder, ChevronRight, ChevronDown, Check } from 'lucide-react';
import { projectsApi } from '../../services/apiService';
import { FileSystemNode } from '../../types/filesystem';

interface SelectFolderModalProps {
  isOpen: boolean;
  currentNodeId: string; // 当前节点 ID（排除自身及其子节点）
  projectId: string; // 项目 ID
  onClose: () => void;
  onConfirm: (targetParentId: string) => void;
}

interface FolderNode extends FileSystemNode {
  children?: FolderNode[];
  expanded: boolean;
}

export const SelectFolderModal: React.FC<SelectFolderModalProps> = ({
  isOpen,
  currentNodeId,
  projectId,
  onClose,
  onConfirm,
}) => {
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载项目文件夹树
  const loadFolderTree = useCallback(async () => {
    if (!projectId || !isOpen) {
      console.warn('[SelectFolderModal] projectId 或 isOpen 为空，跳过加载');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 获取项目根节点
      const project = await projectsApi.get(projectId);

      if (!project) {
        setError('项目不存在');
        setLoading(false);
        return;
      }

      // 递归构建文件夹树
      const buildTree = async (
        nodeId: string,
        excludeNodeId: string
      ): Promise<FolderNode[]> => {
        // 验证 nodeId
        if (!nodeId) {
          console.warn('[SelectFolderModal] buildTree: nodeId 为空，跳过');
          return [];
        }

        const children = await projectsApi.getChildren(nodeId);

        // 过滤出文件夹，并排除当前节点及其子节点
        const folders = children
          .filter((child) => child.isFolder && child.id !== excludeNodeId)
          .map((folder) => ({
            ...folder,
            expanded: false,
            children: [],
          }));

        // 递归加载子文件夹
        for (const folder of folders) {
          if (folder.id) {
            folder.children = await buildTree(folder.id, excludeNodeId);
          }
        }

        return folders;
      };

      // 验证 project.id
      if (!project.id) {
        setError('项目 ID 无效');
        setLoading(false);
        return;
      }

      const tree = await buildTree(project.id, currentNodeId);

      setFolderTree(tree);
    } catch (err) {
      console.error('加载文件夹树失败:', err);
      setError('加载文件夹列表失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, currentNodeId, isOpen]);

  useEffect(() => {
    loadFolderTree();
  }, [loadFolderTree]);

  // 切换文件夹展开/折叠
  const toggleExpand = useCallback(
    (nodeId: string) => {
      const updateNode = (nodes: FolderNode[]): FolderNode[] => {
        return nodes.map((node) => {
          if (node.id === nodeId) {
            return { ...node, expanded: !node.expanded };
          }
          if (node.children) {
            return { ...node, children: updateNode(node.children) };
          }
          return node;
        });
      };

      setFolderTree(updateNode(folderTree));
    },
    [folderTree]
  );

  // 选择文件夹
  const selectFolder = useCallback(
    (nodeId: string) => {
      setSelectedFolderId(nodeId === selectedFolderId ? null : nodeId);
    },
    [selectedFolderId]
  );

  // 递归渲染文件夹树
  const renderFolderTree = (
    nodes: FolderNode[],
    level: number = 0
  ): React.ReactNode => {
    return nodes.map((node) => (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors
            ${selectedFolderId === node.id ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50'}
          `}
          style={{ paddingLeft: `${level * 16 + 12}px` }}
          onClick={() => selectFolder(node.id)}
        >
          {/* 展开/折叠图标 */}
          {node.children && node.children.length > 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
              className="p-0.5 hover:bg-slate-200 rounded transition-colors"
            >
              {node.expanded ? (
                <ChevronDown size={14} className="text-slate-500" />
              ) : (
                <ChevronRight size={14} className="text-slate-500" />
              )}
            </button>
          ) : (
            <div className="w-5 h-5" />
          )}

          {/* 文件夹图标 */}
          <Folder size={16} className="text-amber-500 flex-shrink-0" />

          {/* 文件夹名称 */}
          <span className="flex-1 text-sm truncate">{node.name}</span>

          {/* 选中标记 */}
          {selectedFolderId === node.id && (
            <Check size={16} className="text-indigo-600 flex-shrink-0" />
          )}
        </div>

        {/* 子文件夹 */}
        {node.expanded && node.children && node.children.length > 0 && (
          <div>{renderFolderTree(node.children, level + 1)}</div>
        )}
      </div>
    ));
  };

  const handleConfirm = () => {
    if (selectedFolderId) {
      onConfirm(selectedFolderId);
    }
  };

  const handleClose = () => {
    setSelectedFolderId(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="选择目标文件夹"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedFolderId || loading}
          >
            确认
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-4 border-slate-200" />
              <div className="absolute top-0 left-0 w-10 h-10 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
            </div>
            <p className="ml-3 text-slate-500 text-sm">加载中...</p>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-8">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && folderTree.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <p className="text-slate-500 text-sm">暂无可用文件夹</p>
          </div>
        )}

        {!loading && !error && folderTree.length > 0 && (
          <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
            {renderFolderTree(folderTree)}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default SelectFolderModal;
