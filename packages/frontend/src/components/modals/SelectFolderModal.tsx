import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Folder, Check, Loader2 } from 'lucide-react';
import { useFolderChildren } from './hooks/useFolderChildren';
import { FileSystemNode } from '../../types/filesystem';
import { handleError } from '@/utils/errorHandler';
import { FileTree } from '../ui/FileTree';

interface SelectFolderModalProps {
  isOpen: boolean;
  currentNodeId: string; // 当前节点 ID（排除自身及其子节点）
  projectId?: string; // 项目 ID
  onClose: () => void;
  onConfirm: (targetParentId: string, folderName?: string) => void;
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

  const { loadChildren } = useFolderChildren();

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


  const findNodeById = (nodes: FolderNode[], id: string): FolderNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return undefined;
  };

  const handleConfirm = () => {
    if (selectedFolderId) {
      const node = findNodeById(folderTree, selectedFolderId);
      onConfirm(selectedFolderId, node?.name);
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
          <Button variant="secondary" onClick={handleClose}>
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
        {/* 加载状态 */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin mb-3" style={{ color: 'var(--primary-600)' }} />
            <p style={{ color: 'var(--text-tertiary)' }}>加载文件夹列表...</p>
          </div>
        )}

        {/* 错误状态 */}
        {error && (
          <div className="flex items-center justify-center py-8">
            <p style={{ color: 'var(--error)' }}>{error}</p>
          </div>
        )}

        {/* 空状态 */}
        {!loading && !error && folderTree.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <Folder size={48} className="mb-3" style={{ color: 'var(--text-muted)' }} />
            <p style={{ color: 'var(--text-tertiary)' }}>暂无可用文件夹</p>
          </div>
        )}

        {/* 文件夹列表 */}
        {!loading && !error && folderTree.length > 0 && (
          <div className="border rounded-[3px]" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-primary)' }}>
            <div className="px-2 pt-1.5 pb-0.5" style={{ color: 'var(--text-muted)' }}>
              点击文件夹名称选择，点击箭头展开/折叠
            </div>
            {projectName && projectId && (
              <div
                className="flex items-center gap-1.5 px-2 h-[24px] text-xs rounded-none cursor-pointer select-none transition-colors duration-150"
                style={{
                  color: selectedFolderId === projectId ? 'var(--info)' : 'var(--text-secondary)',
                  background: selectedFolderId === projectId ? 'rgba(0,156,255,0.1)' : '',
                  fontWeight: selectedFolderId === projectId ? 500 : 400,
                }}
                onClick={() => selectFolder(projectId)}
                onMouseEnter={(e) => {
                  if (selectedFolderId !== projectId) {
                    e.currentTarget.style.background = 'var(--menu-highlight)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedFolderId !== projectId) {
                    e.currentTarget.style.background = '';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
              >
                <Folder size={14} className="shrink-0" style={{ color: selectedFolderId === projectId ? 'var(--info)' : undefined }} />
                <span className="flex-1 truncate">{projectName}</span>
                {selectedFolderId === projectId && (
                  <Check size={14} className="shrink-0" style={{ color: 'var(--info)' }} />
                )}
              </div>
            )}
            <div className="max-h-80 overflow-y-auto">
              <FileTree
                nodes={folderTree}
                selectedId={selectedFolderId}
                onToggleExpand={toggleExpand}
                onSelect={(node) => selectFolder(node.id)}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default SelectFolderModal;