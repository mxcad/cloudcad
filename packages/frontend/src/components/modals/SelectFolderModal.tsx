import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { FileNameText } from '../ui/TruncateText';
import { Folder } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { Check } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { fileSystemControllerGetChildren } from '@/api-sdk';
import { FileSystemNode } from '../../types/filesystem';
import { handleError } from '@/utils/errorHandler';

interface SelectFolderModalProps {
  isOpen: boolean;
  currentNodeId: string; // 当前节点 ID（排除自身及其子节点）
  projectId?: string; // 项目 ID
  onClose: () => void;
  onConfirm: (targetParentId: string) => void;
  /** 确认按钮文字，默认为"确认" */
  confirmButtonText?: string;
}

interface FolderNode extends FileSystemNode {
  /** 节点 ID（必需） */
  id: string;
  /** 是否展开（前端 UI 状态） */
  expanded: boolean;
  /** 子文件夹 */
  children?: FolderNode[];
  /** 是否正在加载 */
  loading?: boolean;
  /** 是否有子节点 */
  hasChildren?: boolean;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

export const SelectFolderModal: React.FC<SelectFolderModalProps> = ({
  isOpen,
  currentNodeId,
  projectId,
  onClose,
  onConfirm,
  confirmButtonText = '确认',
}) => {
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('');

  // 懒加载子文件夹
  const loadChildren = useCallback(
    async (nodeId: string, excludeNodeId: string): Promise<FolderNode[]> => {
      try {
        const childrenResponse = await fileSystemControllerGetChildren({ path: { nodeId } });

        let children: FileSystemNode[] = [];

        if (childrenResponse?.nodes) {
          children = childrenResponse.nodes as unknown as FileSystemNode[];
        }

        const folders: FolderNode[] = children
          .filter((child) => {
            const isFolder = child.isFolder === true;
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
      } catch (err) {
        handleError(err, 'loadChildren');
        return [];
      }
    },
    []
  );

  // 加载根文件夹
  const loadFolderTree = useCallback(async () => {
    if (!isOpen) {
      return;
    }

    const rootId = projectId;

    if (!rootId) {
      setError('请先选择保存位置');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tree = await loadChildren(rootId, currentNodeId);
      setFolderTree(tree);
      setProjectName('根目录');
    } catch (err) {
      handleError(err, 'loadFolderTree');
      setError('加载文件夹列表失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, currentNodeId, isOpen, loadChildren]);

  useEffect(() => {
    if (isOpen) {
      loadFolderTree();
      // 默认选择项目根目录
      if (projectId) {
        setSelectedFolderId(projectId);
      } else {
        setSelectedFolderId(null);
      }
    }
  }, [isOpen, loadFolderTree, projectId]);

  // 切换文件夹展开/折叠（懒加载）
  const toggleExpand = useCallback(
    async (nodeId: string) => {
      const updateNode = async (nodes: FolderNode[]): Promise<FolderNode[]> => {
        const result: FolderNode[] = [...nodes];
        for (let i = 0; i < result.length; i++) {
          const node = result[i];
          if (!node) continue;

          if (node.id === nodeId) {
            // 如果是展开操作且子文件夹未加载，则懒加载
            if (
              !node.expanded &&
              (!node.children || node.children.length === 0)
            ) {
              const updatedNode = { ...node, loading: true } as FolderNode;
              result[i] = updatedNode;
              setFolderTree([...result]);

              const children = await loadChildren(nodeId, currentNodeId);
              result[i] = {
                ...node,
                expanded: true,
                children,
                loading: false,
              } as FolderNode;
            } else {
              // 切换展开/折叠状态
              result[i] = { ...node, expanded: !node.expanded } as FolderNode;
            }
            return result;
          }

          if (node.children) {
            result[i] = {
              ...node,
              children: await updateNode(node.children),
            } as FolderNode;
          }
        }
        return result;
      };

      const updatedTree = await updateNode(folderTree);
      setFolderTree(updatedTree);
    },
    [folderTree, loadChildren, currentNodeId]
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
    if (!nodes || nodes.length === 0) {
      return null;
    }

    return nodes.map((node) => (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200
            ${
              selectedFolderId === node.id
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                : 'hover:bg-slate-50 border border-transparent'
            }
          `}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
          onClick={() => selectFolder(node.id)}
        >
          {/* 展开/折叠图标 */}
          {node.hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
              className="p-0.5 hover:bg-slate-200 rounded transition-colors flex-shrink-0"
              disabled={node.loading}
            >
              {node.loading ? (
                <Loader2 size={14} className="text-slate-400 animate-spin" />
              ) : node.expanded ? (
                <ChevronDown size={14} className="text-slate-500" />
              ) : (
                <ChevronRight size={14} className="text-slate-500" />
              )}
            </button>
          ) : (
            <div className="w-5 h-5 flex-shrink-0" />
          )}

          {/* 文件夹图标 */}
          <Folder
            size={18}
            className={`flex-shrink-0 transition-colors ${
              selectedFolderId === node.id
                ? 'text-indigo-600'
                : 'text-amber-500'
            }`}
          />

          {/* 文件夹名称 */}
          <FileNameText
            className={`flex-1 text-sm transition-colors ${
              selectedFolderId === node.id ? 'font-medium' : 'text-slate-700'
            }`}
          >
            {node.name}
          </FileNameText>

          {/* 选中标记 */}
          {selectedFolderId === node.id && (
            <Check size={18} className="text-indigo-600 flex-shrink-0" />
          )}
        </div>

        {/* 子文件夹 */}
        {node.expanded && node.children && node.children.length > 0 && (
          <div className="border-l border-slate-200 ml-6">
            {renderFolderTree(node.children, level + 1)}
          </div>
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
            {confirmButtonText}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* 项目信息 */}
        {projectName && projectId && (
          <div 
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 cursor-pointer
              ${selectedFolderId === projectId ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 border-slate-200'}
            `}
            onClick={() => selectFolder(projectId)}
          >
            <Folder 
              size={16} 
              className={selectedFolderId === projectId ? 'text-indigo-600' : 'text-amber-500'} 
            />
            <span className={`text-sm font-medium ${selectedFolderId === projectId ? 'text-indigo-700' : 'text-slate-700'}`}>
              {projectName}
            </span>
            <span className="text-xs text-slate-500 ml-auto">项目根目录</span>
            {selectedFolderId === projectId && (
              <Check size={16} className="text-indigo-600" />
            )}
          </div>
        )}

        {/* 加载状态 */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 size={32} className="text-indigo-600 animate-spin mb-3" />
            <p className="text-slate-500 text-sm">加载文件夹列表...</p>
          </div>
        )}

        {/* 错误状态 */}
        {error && (
          <div className="flex items-center justify-center py-8">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* 空状态 */}
        {!loading && !error && folderTree.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <Folder size={48} className="text-slate-300 mb-3" />
            <p className="text-slate-500 text-sm">暂无可用文件夹</p>
          </div>
        )}

        {/* 文件夹树 */}
        {!loading && !error && folderTree.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 px-1">
              点击文件夹名称选择，点击箭头展开/折叠
            </p>
            <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-lg bg-white">
              {renderFolderTree(folderTree)}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default SelectFolderModal;