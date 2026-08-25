import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import {
  FileText,
  Search,
  Loader2,
  Check,
  Square,
  AlertCircle,
} from 'lucide-react';
import {
  nodeControllerSearch,
  projectControllerGetPersonalSpace,
  projectControllerGetProjects,
  nodeControllerGetChildren,
} from '@/api-sdk';
import type { FileSystemNode } from '@/types/filesystem';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { FileTree } from '../ui/FileTree';
import type { FileTreeNode } from '../ui/FileTree';

export interface SelectedFile {
  fileId: string;
  fileName: string;
}

interface SelectFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (files: SelectedFile[]) => void;
}

interface SearchResult {
  id: string;
  name: string;
}

interface FileEntry {
  id: string;
  name: string;
  isFolder: boolean;
  expanded: boolean;
  loading: boolean;
  children: FileEntry[];
}

export const SelectFileModal: React.FC<SelectFileModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedNames, setSelectedNames] = useState<Map<string, string>>(
    new Map()
  );
  const [searched, setSearched] = useState(false);
  const [treeNodes, setTreeNodes] = useState<FileEntry[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setKeyword('');
    setResults([]);
    setSelectedIds(new Set());
    setSelectedNames(new Map());
    setSearched(false);
    setTreeNodes([]);
    setTreeLoading(true);
    setError('');

    setTimeout(() => inputRef.current?.focus(), 100);

    const loadRoots = async () => {
      try {
        const [psRes, projectsRes] = await Promise.all([
          projectControllerGetPersonalSpace(),
          projectControllerGetProjects({
            query: { filter: 'all', limit: 100 },
          }),
        ]);
        // SDK 默认不抛错：失败时错误在 result.error，显式抛出才能在 UI 提示
        if (psRes.error) throw psRes.error;
        if (projectsRes.error) throw projectsRes.error;

        const roots: FileEntry[] = [];

        const psData = psRes.data as { id: string; name?: string } | undefined;
        if (psData?.id) {
          roots.push({
            id: psData.id,
            name: t('个人空间'),
            isFolder: true,
            expanded: false,
            loading: false,
            children: [],
          });
        }

        const projectsData = projectsRes.data as
          { nodes?: Array<{ id: string; name?: string }> } | undefined;
        const projectNodes = projectsData?.nodes ?? [];
        if (projectNodes.length > 0) {
          const projectChildren: FileEntry[] = projectNodes
            .filter((p) => p.id)
            .map((p) => ({
              id: p.id,
              name: p.name || t('未命名项目'),
              isFolder: true,
              expanded: false,
              loading: false,
              children: [],
            }));

          roots.push({
            id: '__virtual__my_projects__',
            name: t('我的项目'),
            isFolder: true,
            expanded: false,
            loading: false,
            children: projectChildren,
          });
        }

        setTreeNodes(roots);
      } catch (err) {
        setTreeNodes([]);
        setError(getErrorMessage(err) || t('加载文件列表失败'));
      } finally {
        setTreeLoading(false);
      }
    };

    loadRoots();
  }, [isOpen]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }

    setSearching(true);
    setSearched(true);
    try {
      const result = await nodeControllerSearch({
        query: {
          keyword: q.trim(),
          type: 'file',
          scope: 'all_projects',
          limit: 20,
        },
      });
      if (result.error) {
        setResults([]);
        setError(getErrorMessage(result.error) || t('搜索失败'));
        return;
      }
      setError('');
      const data = result.data as { nodes?: FileSystemNode[] } | undefined;
      const nodes = data?.nodes ?? [];
      setResults(
        nodes
          .filter(
            (n): n is FileSystemNode & { id: string } => !!n.id && !n.isFolder
          )
          .map((n) => ({ id: n.id, name: n.name || t('未命名') }))
      );
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setKeyword(val);
      setSelectedIds(new Set());
      setSelectedNames(new Map());

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(val), 300);
    },
    [doSearch]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        doSearch(keyword);
      }
    },
    [keyword, doSearch]
  );

  // ref 模式：展开回调保持稳定引用，避免 FileTreeRow memo 因 onToggleExpand
  // 引用变化而失效（否则每次展开都会整树重渲染导致闪烁）
  const treeNodesRef = useRef<FileEntry[]>(treeNodes);
  treeNodesRef.current = treeNodes;
  // 懒加载进行中的节点：防连点重复请求（loading 帧已去掉，无法用 loading 字段判断）
  const expandingNodeIdsRef = useRef<Set<string>>(new Set());

  const toggleExpand = useCallback(async (nodeId: string) => {
    const updateNode = async (nodes: FileEntry[]): Promise<FileEntry[]> => {
      const result: FileEntry[] = [...nodes];
      for (let i = 0; i < result.length; i++) {
        const node = result[i];
        if (!node) continue;

        if (node.id === nodeId) {
          if (node.loading) return nodes;
          if (!node.expanded && node.children.length === 0) {
            // 不渲染 loading 帧（箭头切 spinner 会造成闪烁感）：
            // 一次性 await 后展开，配合 FileTree 的 grid 展开动画平滑出现
            if (expandingNodeIdsRef.current.has(nodeId)) return nodes;
            expandingNodeIdsRef.current.add(nodeId);
            try {
              const childrenRes = await nodeControllerGetChildren({
                path: { nodeId },
              });
              if (childrenRes.error) throw childrenRes.error;
              const nodesData = childrenRes.data as
                | {
                    nodes?: Array<{
                      id: string;
                      name?: string;
                      isFolder?: boolean;
                    }>;
                  }
                | undefined;
              const raw = nodesData?.nodes ?? [];
              const children: FileEntry[] = raw
                .filter((c) => c.id)
                .map((c) => ({
                  id: c.id,
                  name: c.name || t('未命名'),
                  isFolder: c.isFolder ?? false,
                  expanded: false,
                  loading: false,
                  children: [],
                }));
              result[i] = {
                ...node,
                expanded: true,
                loading: false,
                children,
              };
            } catch (err) {
              setError(getErrorMessage(err) || t('加载文件夹失败'));
              result[i] = {
                ...node,
                expanded: true,
                loading: false,
                children: [],
              };
            } finally {
              expandingNodeIdsRef.current.delete(nodeId);
            }
          } else {
            result[i] = { ...node, expanded: !node.expanded };
          }
          return result;
        }

        if (node.children.length > 0) {
          result[i] = { ...node, children: await updateNode(node.children) };
        }
      }
      return result;
    };

    const updated = await updateNode(treeNodesRef.current);
    setTreeNodes(updated);
  }, []);

  const toggleSelect = useCallback((id: string, name: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedNames((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, name);
      return next;
    });
  }, []);

  const handleTreeSelect = useCallback(
    (node: FileTreeNode) => {
      // 多选模式下文件夹点击由 FileTree 直接展开，这里只处理文件勾选
      if (!node.isFolder) {
        toggleSelect(node.id, node.name);
      }
    },
    [toggleSelect]
  );

  const handleConfirm = () => {
    if (selectedIds.size > 0) {
      const files: SelectedFile[] = Array.from(selectedIds).map((id) => ({
        fileId: id,
        fileName: selectedNames.get(id) || '',
      }));
      onConfirm(files);
    }
  };

  const handleClose = () => {
    setSelectedIds(new Set());
    setSelectedNames(new Map());
    onClose();
  };

  const showSearchResults = keyword.trim().length > 0;
  const selectedCount = selectedIds.size;

  const renderSelectedFiles = () => {
    if (selectedCount === 0) return null;
    const names = Array.from(selectedNames.values());
    const displayText =
      names.length <= 3
        ? names.join('、')
        : `${names.slice(0, 3).join('、')}${t('等 {count} 个文件', { count: String(names.length) })}`;
    return (
      <div
        style={{
          padding: '8px 12px',
          background: 'var(--primary-50)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--primary-200)',
          fontSize: 'var(--text-sm)',
          color: 'var(--primary-700)',
        }}
      >
        {t('已选 {count} 个: {names}', {
          count: String(selectedCount),
          names: displayText,
        })}
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('选择要分享的图纸')}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            {t('取消')}
          </Button>
          <Button onClick={handleConfirm} disabled={selectedCount === 0}>
            {selectedCount > 0
              ? t('选择 ({count})', { count: String(selectedCount) })
              : t('选择文件')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Input
          ref={inputRef}
          value={keyword}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={t('搜索文件名或在下方浏览...')}
          leftIcon={Search}
          size="md"
        />

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--error-light)',
              color: 'var(--error)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {showSearchResults ? (
          <>
            {searching && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: '24px',
                }}
              >
                <Loader2
                  size={20}
                  className="animate-spin"
                  style={{ color: 'var(--primary-500)' }}
                />
              </div>
            )}

            {!searching && results.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px',
                  color: 'var(--text-tertiary)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {t('没有找到匹配的文件')}
              </div>
            )}

            {!searching && results.length > 0 && (
              <div
                style={{
                  maxHeight: '320px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-lg)',
                }}
              >
                {results.map((file) => {
                  const isFileSelected = selectedIds.has(file.id);
                  return (
                    <div
                      key={file.id}
                      onClick={() => toggleSelect(file.id, file.name)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-default)',
                        background: isFileSelected
                          ? 'var(--primary-50)'
                          : 'transparent',
                        color: isFileSelected
                          ? 'var(--primary-700)'
                          : 'var(--text-primary)',
                        fontWeight: isFileSelected ? 500 : 400,
                      }}
                      onMouseEnter={(e) => {
                        if (!isFileSelected)
                          e.currentTarget.style.background =
                            'var(--bg-tertiary)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isFileSelected)
                          e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {isFileSelected ? (
                          <Check size={14} style={{ color: 'var(--info)' }} />
                        ) : (
                          <Square
                            size={14}
                            style={{ color: 'var(--text-tertiary)' }}
                          />
                        )}
                      </div>
                      <FileText
                        size={16}
                        style={{
                          flexShrink: 0,
                          color: isFileSelected
                            ? 'var(--primary-500)'
                            : 'var(--text-tertiary)',
                        }}
                      />
                      <span
                        style={{
                          fontSize: 'var(--text-sm)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {file.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            {treeLoading && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: '24px',
                }}
              >
                <Loader2
                  size={20}
                  className="animate-spin"
                  style={{ color: 'var(--primary-500)' }}
                />
              </div>
            )}

            {!treeLoading && treeNodes.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px',
                  color: 'var(--text-tertiary)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {t('暂无可用文件')}
              </div>
            )}

            {!treeLoading && treeNodes.length > 0 && (
              <div
                style={{
                  maxHeight: '320px',
                  overflowY: 'auto',
                  // 预留滚动条槽位：展开/折叠后滚动条出现/消失不再引起行位移抖动
                  scrollbarGutter: 'stable',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-primary)',
                }}
              >
                <FileTree
                  nodes={treeNodes}
                  selectedIds={selectedIds}
                  multiSelect
                  onToggleExpand={toggleExpand}
                  onSelect={handleTreeSelect}
                />
              </div>
            )}
          </>
        )}

        {renderSelectedFiles()}
      </div>
    </Modal>
  );
};

export default SelectFileModal;
