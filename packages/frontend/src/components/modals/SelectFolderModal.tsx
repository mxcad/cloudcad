import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { FileNameText } from '../ui/TruncateText';
import {
  Folder,
  ChevronRight,
  ChevronDown,
  Check,
  Home,
  Loader2,
} from 'lucide-react';
import { projectsApi } from '../../services/projectsApi';
import { FileSystemNode } from '../../types/filesystem';

interface SelectFolderModalProps {
  isOpen: boolean;
  currentNodeId: string; // 当前节点 ID（排除自身及其子节点）
  projectId?: string; // 项目 ID
  onClose: () => void;
  onConfirm: (targetParentId: string) => void;
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
        const childrenResponse = await projectsApi.getChildren(nodeId);

        // API 返回格式: { data: { data: nodes[], meta: {...} } }
        // 解包后 childrenResponse.data 是 NodeListResponseDto = { data: nodes[], meta: {...} }
        let children: FileSystemNode[] = [];

        if (childrenResponse.data) {
          const responseData = childrenResponse.data;
          if (Array.isArray(responseData.data)) {
            // 正确格式: { data: nodes[], meta: {...} }
            children = responseData.data as unknown as FileSystemNode[];
          }
        }

        // 过滤出文件夹，并排除当前节点及其子节点
        const folders: FolderNode[] = children
          .filter((child) => {
            const isFolder = child.isFolder;
            const isExcluded = child.id === excludeNodeId;
            return isFolder && !isExcluded && child.id; // 确保 id 存在
          })
          .map((folder) => ({
            ...folder,
            id: folder.id!, // 断言 id 存在（已通过 filter 过滤）
            expanded: false,
            children: [],
            loading: false,
            hasChildren: true,
          }));

        return folders;
      } catch (err) {
        // 错误已通过 setError 显示
        return [];
      }
    },
    []
  );

  // 加载项目根文件夹
  const loadFolderTree = useCallback(async () => {
    if (!projectId || !isOpen) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 获取项目根节点
      const projectResponse = await projectsApi.get(projectId);

      const project = projectResponse.data;

      if (!project) {
        setError('项目不存在');
        setLoading(false);
        return;
      }

      setProjectName(project.name);

      // 验证 project.id
      if (!project.id) {
        setError('项目 ID 无效');
        setLoading(false);
        return;
      }

      // 只加载第一层文件夹，不递归加载
      const tree = await loadChildren(project.id, currentNodeId);

      setFolderTree(tree);
    } catch (err) {
      setError('加载文件夹列表失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, currentNodeId, isOpen, loadChildren]);

  useEffect(() => {
    if (isOpen) {
      loadFolderTree();
      setSelectedFolderId(null);
    }
  }, [isOpen, loadFolderTree]);

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
            确认移动
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* 项目信息 */}
        {projectName && (
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
            <Folder size={16} className="text-amber-500" />
            <span className="text-sm font-medium text-slate-700">
              {projectName}
            </span>
            <span className="text-xs text-slate-500 ml-auto">项目根目录</span>
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
