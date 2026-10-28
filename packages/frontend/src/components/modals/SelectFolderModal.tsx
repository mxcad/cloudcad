import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import {
  Folder,
  Check,
  Loader2,
  AlertCircle,
  FolderPlus,
  Plus,
} from 'lucide-react';
import { useFolderChildren } from './hooks/useFolderChildren';
import { FileSystemNode } from '../../types/filesystem';
import { handleError } from '@/utils/errorHandler';
import { validateFolderName } from '@/utils/fileUtils';
import { FileTree } from '../ui/FileTree';
import { t } from '@/languages';
import {
  nodeControllerCreateFolder,
  projectControllerCreateProject,
} from '@/api-sdk';
import {
  evaluateCrossProjectTransfer,
  fetchProjectTransferSettings,
} from '@/lib/crossProjectPaste';
import type { CrossProjectTransferVerdict } from '@/lib/crossProjectPaste';

/** 跨项目目标根（根切换器数据源：项目 / 个人空间） */
export interface TransferTargetRoot {
  id: string;
  name: string;
  kind: 'project' | 'personal-space';
}

interface SelectFolderModalProps {
  isOpen: boolean;
  currentNodeId: string; // 当前节点 ID（排除自身及其子节点）
  /** 批量移动/复制：全部源节点 id 集合（从目标树剔除，防选入任一源的子树） */
  excludeNodeIds?: string[];
  projectId?: string; // 当前项目 ID
  /** 可选：跨项目根切换器（传入多个根时顶部显示切换；缺省仅 projectId 单根） */
  roots?: TransferTargetRoot[];
  /** 跨项目转移门控：源项目 id（源为个人空间时不传 → 不做策略拦截） */
  sourceProjectId?: string;
  /** 当前操作类型：move=移动 / copy=复制（按此匹配项目 transfer 策略） */
  operation?: 'move' | 'copy';
  /** 查询项目 6 域 transfer 设置（测试可注入；缺省走 SDK） */
  getProjectTransferSettings?: typeof fetchProjectTransferSettings;
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

export const SelectFolderModal: React.FC<SelectFolderModalProps> = ({
  isOpen,
  currentNodeId,
  excludeNodeIds,
  projectId,
  roots,
  sourceProjectId,
  operation,
  getProjectTransferSettings,
  onClose,
  onConfirm,
  confirmButtonText = t('确认'),
}) => {
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRootId, setActiveRootId] = useState<string | null>(null);
  const [transferVerdict, setTransferVerdict] =
    useState<CrossProjectTransferVerdict | null>(null);

  // 选择界面内就地创建（新建文件夹 / 新建项目）
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  /** 本弹窗内新建的项目（本地追加到根切换器，不依赖父组件刷新） */
  const [createdRoots, setCreatedRoots] = useState<TransferTargetRoot[]>([]);

  const { loadChildren } = useFolderChildren();

  /** 根切换器数据源：父组件传入的根 + 本弹窗内新建的项目 */
  const localRoots = useMemo(
    () => [...(roots ?? []), ...createdRoots],
    [roots, createdRoots]
  );

  /** 项目 transfer 设置查询（缺省走 SDK；测试可注入） */
  const fetchTransfer =
    getProjectTransferSettings ?? fetchProjectTransferSettings;

  /** 当前目标根（roots 缺省时按当前项目根处理） */
  const activeRoot = localRoots.find((r) => r.id === activeRootId) ?? null;

  /** 当前根名称（roots 缺省时用 projectId 单根） */
  const activeRootName =
    localRoots.find((r) => r.id === activeRootId)?.name ?? t('根目录');

  // 打开时初始化活动根（当前项目优先，其次 roots 首项）
  useEffect(() => {
    if (isOpen) {
      const initialRoot = projectId ?? roots?.[0]?.id ?? null;
      setActiveRootId(initialRoot);
      setSelectedFolderId(initialRoot);
      cancelCreate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectId, roots]);

  // 加载根文件夹
  const loadFolderTree = useCallback(async () => {
    if (!isOpen) {
      return;
    }

    const rootId = activeRootId;

    if (!rootId) {
      setError(t('请先选择保存位置'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tree = await loadChildren(rootId, [
        ...(currentNodeId ? [currentNodeId] : []),
        ...(excludeNodeIds ?? []),
      ]);
      setFolderTree(tree);
    } catch (err) {
      handleError(err, 'loadFolderTree');
      setError(t('加载文件夹列表失败'));
    } finally {
      setLoading(false);
    }
  }, [activeRootId, currentNodeId, excludeNodeIds, isOpen, loadChildren]);

  useEffect(() => {
    if (isOpen) {
      loadFolderTree();
    }
  }, [isOpen, loadFolderTree]);

  /** 切换目标根（重载树 + 默认选中新根） */
  const switchRoot = (rootId: string) => {
    setActiveRootId(rootId);
    setSelectedFolderId(rootId);
  };

  // ref 模式：展开回调保持稳定引用，避免 FileTreeRow memo 因 onToggleExpand
  // 引用变化而失效（否则每次展开都会整树重渲染导致闪烁）
  const folderTreeRef = useRef<FolderNode[]>(folderTree);
  folderTreeRef.current = folderTree;
  /** 排除集合（源节点 id + 显式批量集合），懒加载子级时持续剔除 */
  const excludedIdsRef = useRef<Set<string>>(new Set());
  excludedIdsRef.current = new Set(
    excludeNodeIds ?? (currentNodeId ? [currentNodeId] : [])
  );

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
              // 不渲染 loading 帧（箭头切 spinner 会造成闪烁感）：
              // 一次性 await 后展开，配合 FileTree 的 grid 展开动画平滑出现
              const children = await loadChildren(
                nodeId,
                Array.from(excludedIdsRef.current)
              );
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

      const updatedTree = await updateNode(folderTreeRef.current);
      setFolderTree(updatedTree);
    },
    [loadChildren]
  );

  // 选择文件夹（单选：点击已选中项不取消——根目录打开时已默认选中，
  // 若点击「根目录」会切掉选中态导致确认按钮禁用、复制/移动静默无操作（P1-1））
  const selectFolder = useCallback(
    (nodeId: string) => {
      setSelectedFolderId(nodeId);
    },
    []
  );

  // 递归渲染文件夹树

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

  // 跨项目转移策略评估（源为项目、目标为其他项目/个人空间时，禁用确认 + 提示原因）。
  // 乐观允许：verdict 未就绪不拦截，查询完成后若禁止则收紧按钮（异步更新重新评估）。
  useEffect(() => {
    if (
      !isOpen ||
      !sourceProjectId ||
      !operation ||
      !activeRootId ||
      activeRootId === sourceProjectId
    ) {
      setTransferVerdict(null);
      return;
    }
    const targetRootKind = activeRoot?.kind ?? 'project';
    let cancelled = false;
    (async () => {
      const [sourceSettings, targetSettings] = await Promise.all([
        fetchTransfer(sourceProjectId),
        targetRootKind === 'project'
          ? fetchTransfer(activeRootId)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setTransferVerdict(
        evaluateCrossProjectTransfer({
          operation,
          sourceProjectId,
          targetProjectId: activeRootId,
          targetRootKind,
          sourceSettings,
          targetSettings,
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    sourceProjectId,
    operation,
    activeRootId,
    activeRoot?.kind,
    fetchTransfer,
  ]);

  // 递归把指定节点替换为 updater 的结果（就地插入新建文件夹用）
  const mapTreeNode = (
    nodes: FolderNode[],
    id: string,
    updater: (node: FolderNode) => FolderNode
  ): FolderNode[] =>
    nodes.map((node) => {
      if (node.id === id) return updater(node);
      if (node.children) {
        return { ...node, children: mapTreeNode(node.children, id, updater) };
      }
      return node;
    });

  const startCreateFolder = () => {
    setCreatingProject(false);
    setCreatingFolder(true);
    setNewFolderName('');
    setCreateError(null);
  };

  const startCreateProject = () => {
    setCreatingFolder(false);
    setCreatingProject(true);
    setNewProjectName('');
    setCreateError(null);
  };

  const cancelCreate = () => {
    setCreatingFolder(false);
    setCreatingProject(false);
    setCreateError(null);
  };

  /** 在选中文件夹下新建文件夹：成功后插入树并自动选中（移动/复制/另存为同用） */
  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    const validation = validateFolderName(name);
    if (!validation.valid) {
      setCreateError(validation.error || t('文件夹名称无效'));
      return;
    }
    if (!selectedFolderId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await nodeControllerCreateFolder({
        path: { parentId: selectedFolderId },
        body: { name },
        throwOnError: true,
      });
      const created = (res.data ?? {}) as Partial<FileSystemNode> & {
        id?: string;
      };
      const newId = created.id;
      if (!newId) {
        setCreateError(t('文件夹创建失败'));
        return;
      }
      const newNode: FolderNode = {
        ...(created as FileSystemNode),
        id: newId,
        name: created.name ?? name,
        isFolder: true,
        expanded: false,
        children: [],
        hasChildren: true,
      };
      if (selectedFolderId === activeRootId) {
        setFolderTree((prev) => [newNode, ...prev]);
      } else {
        setFolderTree((prev) =>
          mapTreeNode(prev, selectedFolderId, (node) => ({
            ...node,
            expanded: true,
            children: [...(node.children ?? []), newNode],
          }))
        );
      }
      setSelectedFolderId(newId);
      cancelCreate();
    } catch (err) {
      const appError = handleError(err, 'createFolder');
      setCreateError(appError.message || t('文件夹创建失败'));
    } finally {
      setCreating(false);
    }
  };

  /** 根切换器新建项目：成功后追加本地根并切换过去（树随 activeRootId 重载） */
  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    const validation = validateFolderName(name);
    if (!validation.valid) {
      setCreateError(validation.error || t('项目名称无效'));
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await projectControllerCreateProject({
        body: { name },
        throwOnError: true,
      });
      const created = res.data as unknown as { id?: string; name?: string };
      const newId = created?.id;
      if (!newId) {
        setCreateError(t('项目创建失败'));
        return;
      }
      const newRoot: TransferTargetRoot = {
        id: newId,
        name: created?.name ?? name,
        kind: 'project',
      };
      setCreatedRoots((prev) => [...prev, newRoot]);
      setActiveRootId(newId);
      setSelectedFolderId(newId);
      cancelCreate();
    } catch (err) {
      const appError = handleError(err, 'createProject');
      setCreateError(appError.message || t('项目创建失败'));
    } finally {
      setCreating(false);
    }
  };

  const handleConfirm = () => {
    // 防御性拦截：策略禁止时禁止确认（与按钮 disabled 双保险，防异步竞态）
    if (transferVerdict?.allowed === false) return;
    if (selectedFolderId) {
      const node = findNodeById(folderTree, selectedFolderId);
      onConfirm(selectedFolderId, node?.name);
    }
  };

  const handleClose = () => {
    setSelectedFolderId(null);
    cancelCreate();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('选择目标文件夹')}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            {t('取消')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              !selectedFolderId || loading || transferVerdict?.allowed === false
            }
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
            <Loader2
              size={32}
              className="animate-spin mb-3"
              style={{ color: 'var(--primary-600)' }}
            />
            <p style={{ color: 'var(--text-tertiary)' }}>
              {t('加载文件夹列表...')}
            </p>
          </div>
        )}

        {/* 错误状态 */}
        {error && (
          <div className="flex items-center justify-center py-8">
            <p style={{ color: 'var(--error)' }}>{error}</p>
          </div>
        )}

        {/* 文件夹列表（新建文件夹/新建项目入口恒可用，空树时同样显示） */}
        {!loading && !error && (
          <div
            className="border rounded-[3px]"
            style={{ borderColor: 'var(--border-default)' }}
          >
            <div
              className="flex items-center justify-between gap-2 px-2 pt-1.5 pb-0.5"
              style={{ color: 'var(--text-muted)' }}
            >
              <span className="truncate">
                {t('点击文件夹名称选择，点击箭头展开/折叠')}
              </span>
              <button
                type="button"
                className="flex items-center gap-1 px-1.5 h-[20px] text-xs rounded-[3px] cursor-pointer select-none shrink-0 transition-colors duration-150"
                style={{
                  color: 'var(--primary-600)',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-default)',
                }}
                onClick={startCreateFolder}
              >
                <FolderPlus size={12} />
                {t('新建文件夹')}
              </button>
            </div>
            {/* 新建文件夹内联表单（创建在选中文件夹下，成功后自动选中） */}
            {creatingFolder && (
              <div className="flex items-center gap-1.5 px-2 pb-1">
                <Input
                  size="sm"
                  wrapperClassName="flex-1"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
                  placeholder={t('请输入文件夹名称')}
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={handleCreateFolder}
                  disabled={creating || !newFolderName.trim()}
                >
                  {t('创建')}
                </Button>
                <Button size="sm" variant="secondary" onClick={cancelCreate}>
                  {t('取消')}
                </Button>
              </div>
            )}
            {creatingFolder && createError && (
              <div
                className="px-2 pb-1 text-xs"
                style={{ color: 'var(--error)' }}
              >
                {createError}
              </div>
            )}
            {/* 跨项目根切换器（多根时显示；含本弹窗内新建的项目） */}
            {localRoots.length > 1 && (
              <div className="flex flex-wrap items-center gap-1 px-2 pb-1">
                {localRoots.map((root) => {
                  const isActive = activeRootId === root.id;
                  return (
                    <button
                      key={root.id}
                      type="button"
                      className="px-2 h-[24px] text-xs rounded-[3px] cursor-pointer select-none transition-colors duration-150"
                      style={{
                        color: isActive
                          ? 'var(--info)'
                          : 'var(--text-secondary)',
                        background: isActive
                          ? 'rgba(0,156,255,0.1)'
                          : 'var(--bg-secondary)',
                        fontWeight: isActive ? 600 : 500,
                        border: '1px solid var(--border-default)',
                      }}
                      onClick={() => switchRoot(root.id)}
                    >
                      {root.kind === 'personal-space'
                        ? t('个人空间')
                        : root.name}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="flex items-center gap-0.5 px-2 h-[24px] text-xs rounded-[3px] cursor-pointer select-none transition-colors duration-150"
                  style={{
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-secondary)',
                    border: '1px dashed var(--border-default)',
                  }}
                  onClick={startCreateProject}
                >
                  <Plus size={12} />
                  {t('新建项目')}
                </button>
              </div>
            )}
            {creatingProject && (
              <div className="flex items-center gap-1.5 px-2 pb-1">
                <Input
                  size="sm"
                  wrapperClassName="flex-1"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateProject()}
                  placeholder={t('请输入项目名称')}
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={handleCreateProject}
                  disabled={creating || !newProjectName.trim()}
                >
                  {t('创建')}
                </Button>
                <Button size="sm" variant="secondary" onClick={cancelCreate}>
                  {t('取消')}
                </Button>
              </div>
            )}
            {creatingProject && createError && (
              <div
                className="px-2 pb-1 text-xs"
                style={{ color: 'var(--error)' }}
              >
                {createError}
              </div>
            )}
            {activeRootId && (
              <div
                className="flex items-center gap-1.5 px-2 h-[28px] text-xs cursor-pointer select-none transition-colors duration-150"
                style={{
                  color:
                    selectedFolderId === activeRootId
                      ? 'var(--info)'
                      : 'var(--text-secondary)',
                  background:
                    selectedFolderId === activeRootId
                      ? 'rgba(0,156,255,0.1)'
                      : 'var(--bg-secondary)',
                  fontWeight: selectedFolderId === activeRootId ? 600 : 500,
                  borderBottom: '1px solid var(--border-default)',
                }}
                onClick={() => selectFolder(activeRootId)}
                onMouseEnter={(e) => {
                  if (selectedFolderId !== activeRootId) {
                    e.currentTarget.style.background = 'var(--menu-highlight)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedFolderId !== activeRootId) {
                    e.currentTarget.style.background = 'var(--bg-secondary)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
              >
                <Folder
                  size={14}
                  className="shrink-0"
                  style={{ color: 'var(--warning-500)' }}
                />
                <span className="flex-1 truncate">{activeRootName}</span>
                <span
                  className="text-[10px] shrink-0 ml-1"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {t('保存到根目录')}
                </span>
                {selectedFolderId === activeRootId && (
                  <Check
                    size={14}
                    className="shrink-0 ml-1"
                    style={{ color: 'var(--info)' }}
                  />
                )}
              </div>
            )}
            <div
              className="max-h-80 overflow-y-auto"
              style={{ background: 'var(--bg-primary)' }}
            >
              {folderTree.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Folder
                    size={48}
                    className="mb-3"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <p style={{ color: 'var(--text-tertiary)' }}>
                    {t('暂无可用文件夹')}
                  </p>
                </div>
              ) : (
                <FileTree
                  nodes={folderTree}
                  selectedId={selectedFolderId}
                  onToggleExpand={toggleExpand}
                  onSelect={(node) => selectFolder(node.id)}
                />
              )}
            </div>
          </div>
        )}

        {/* 跨项目转移被拒原因（策略禁止时提示，确认按钮同步禁用） */}
        {transferVerdict?.allowed === false && transferVerdict.reasonKey && (
          <div
            className="flex items-center gap-1.5 text-xs px-1"
            style={{ color: 'var(--error)' }}
          >
            <AlertCircle size={14} className="shrink-0" />
            <span>
              {t(transferVerdict.reasonKey, {
                action: operation === 'move' ? t('移动') : t('复制'),
              })}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default SelectFolderModal;
