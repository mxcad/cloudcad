import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { FileText, Search, Loader2 } from 'lucide-react';
import {
  fileSystemControllerSearch,
  fileSystemControllerGetPersonalSpace,
  fileSystemControllerGetProjects,
  fileSystemControllerGetChildren,
} from '@/api-sdk';
import type { FileSystemNode } from '@/types/filesystem';
import { t } from '@/languages';
import { FileTree } from '../ui/FileTree';
import type { FileTreeNode } from '../ui/FileTree';

interface SelectFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (fileId: string, fileName: string) => void;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [treeNodes, setTreeNodes] = useState<FileEntry[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setKeyword('');
    setResults([]);
    setSelectedId(null);
    setSelectedName(null);
    setSearched(false);
    setTreeNodes([]);
    setTreeLoading(true);

    setTimeout(() => inputRef.current?.focus(), 100);

    const loadRoots = async () => {
      try {
        const [psRes, projectsRes] = await Promise.all([
          fileSystemControllerGetPersonalSpace(),
          fileSystemControllerGetProjects({ query: { filter: 'all', limit: 100 } }),
        ]);

        const roots: FileEntry[] = [];

        const psData = psRes.data as { id: string; name?: string } | undefined;
        if (psData?.id) {
          roots.push({
            id: psData.id,
            name: psData.name || t('我的图纸'),
            isFolder: true,
            expanded: false,
            loading: false,
            children: [],
          });
        }

        const projectsData = projectsRes.data as { nodes?: Array<{ id: string; name?: string }> } | undefined;
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
      } catch {
        setTreeNodes([]);
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
      const result = await fileSystemControllerSearch({
        query: {
          keyword: q.trim(),
          type: 'file',
          scope: 'all_projects',
          limit: 20,
        },
      });
      if (result.error) {
        setResults([]);
        return;
      }
      const data = result.data as { nodes?: FileSystemNode[] } | undefined;
      const nodes = data?.nodes ?? [];
      setResults(
        nodes
          .filter((n): n is FileSystemNode & { id: string } => !!n.id && !n.isFolder)
          .map((n) => ({ id: n.id, name: n.name || t('未命名') })),
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
      setSelectedId(null);
      setSelectedName(null);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(val), 300);
    },
    [doSearch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        doSearch(keyword);
      }
    },
    [keyword, doSearch],
  );

  const toggleExpand = useCallback(
    async (nodeId: string) => {
      const updateNode = async (nodes: FileEntry[]): Promise<FileEntry[]> => {
        const result: FileEntry[] = [...nodes];
        for (let i = 0; i < result.length; i++) {
          const node = result[i];
          if (!node) continue;

          if (node.id === nodeId) {
            if (!node.expanded && node.children.length === 0) {
              result[i] = { ...node, loading: true };
              setTreeNodes([...result]);

              try {
                const childrenRes = await fileSystemControllerGetChildren({
                  path: { nodeId },
                });
                const nodesData = childrenRes.data as { nodes?: Array<{ id: string; name?: string; isFolder?: boolean }> } | undefined;
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
                result[i] = { ...node, expanded: true, loading: false, children };
              } catch {
                result[i] = { ...node, expanded: true, loading: false, children: [] };
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

      const updated = await updateNode(treeNodes);
      setTreeNodes(updated);
    },
    [treeNodes],
  );

  const handleSelect = useCallback((id: string, name: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
    setSelectedName((prev) => (prev === name ? null : name));
  }, []);

  const handleTreeSelect = useCallback(
    (node: FileTreeNode) => {
      if (node.isFolder) {
        toggleExpand(node.id);
      } else {
        handleSelect(node.id, node.name);
      }
    },
    [handleSelect, toggleExpand],
  );

  const handleConfirm = () => {
    if (selectedId && selectedName) {
      onConfirm(selectedId, selectedName);
    }
  };

  const handleClose = () => {
    setSelectedId(null);
    setSelectedName(null);
    onClose();
  };

  const showSearchResults = keyword.trim().length > 0;

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
          <Button onClick={handleConfirm} disabled={!selectedId}>
            {t('选择此文件')}
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

        {showSearchResults ? (
          <>
            {searching && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                <Loader2 size={20} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
              </div>
            )}

            {!searching && results.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                {t('没有找到匹配的文件')}
              </div>
            )}

            {!searching && results.length > 0 && (
              <div
                style={{
                  maxHeight: '320px', overflowY: 'auto',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-lg)',
                }}
              >
                {results.map((file) => {
                  const isFileSelected = file.id === selectedId;
                  return (
                    <div
                      key={file.id}
                      onClick={() => handleSelect(file.id, file.name)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 12px', cursor: 'pointer',
                        borderBottom: '1px solid var(--border-default)',
                        background: isFileSelected ? 'var(--primary-50)' : 'transparent',
                        color: isFileSelected ? 'var(--primary-700)' : 'var(--text-primary)',
                        fontWeight: isFileSelected ? 500 : 400,
                      }}
                      onMouseEnter={(e) => {
                        if (!isFileSelected) e.currentTarget.style.background = 'var(--bg-tertiary)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isFileSelected) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <FileText size={16} style={{ flexShrink: 0, color: isFileSelected ? 'var(--primary-500)' : 'var(--text-tertiary)' }} />
                      <span style={{ fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                <Loader2 size={20} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
              </div>
            )}

            {!treeLoading && treeNodes.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                {t('暂无可用文件')}
              </div>
            )}

            {!treeLoading && treeNodes.length > 0 && (
              <div
                style={{
                  maxHeight: '320px', overflowY: 'auto',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-primary)',
                }}
              >
                <FileTree
                  nodes={treeNodes}
                  selectedId={selectedId}
                  onToggleExpand={toggleExpand}
                  onSelect={handleTreeSelect}
                />
              </div>
            )}
          </>
        )}

        {selectedName && (
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
            {t('已选: {name}', { name: selectedName })}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default SelectFileModal;
