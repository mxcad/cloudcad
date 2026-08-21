import React from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  Check,
  Loader2,
  Square,
} from 'lucide-react';

export interface FileTreeNode {
  id: string;
  name: string;
  isFolder?: boolean;
  expanded: boolean;
  loading?: boolean;
  children?: FileTreeNode[];
  hasChildren?: boolean;
}

export interface FileTreeProps {
  nodes: FileTreeNode[];
  selectedId?: string | null;
  onToggleExpand: (nodeId: string) => void;
  onSelect: (node: FileTreeNode) => void;
  indent?: number;
  showConnector?: boolean;
  className?: string;
  /** 多选模式 */
  multiSelect?: boolean;
  /** 多选时选中的 ID 集合 */
  selectedIds?: Set<string>;
}

interface FileTreeRowProps {
  node: FileTreeNode;
  level: number;
  indent: number;
  showConnector: boolean;
  multiSelect: boolean;
  selectedIds?: Set<string>;
  selectedId?: string | null;
  onToggleExpand: (nodeId: string) => void;
  onSelect: (node: FileTreeNode) => void;
}

/**
 * FileTreeRow - 单行树节点（memo 化）
 *
 * 展开/折叠只变更目标路径上的节点对象引用，兄弟行 node 引用不变时
 * React 直接跳过重渲染，避免整树重绘导致的卡顿/闪烁。
 * 展开状态变化会让目标行重渲染（箭头翻转 + 子节点插入），其余行不动。
 */
const FileTreeRow: React.FC<FileTreeRowProps> = React.memo(
  function FileTreeRow({
    node,
    level,
    indent,
    showConnector,
    multiSelect,
    selectedIds,
    selectedId,
    onToggleExpand,
    onSelect,
  }) {
    const isSelected = multiSelect
      ? (selectedIds?.has(node.id) ?? false)
      : node.id === selectedId;
    const showExpandButton = node.isFolder && node.hasChildren !== false;

    const handleClick = () => {
      if (multiSelect && node.isFolder) {
        // 多选模式下点击文件夹名称直接展开/折叠（与箭头等价）
        onToggleExpand(node.id);
      } else {
        onSelect(node);
      }
    };

    const handleExpandClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleExpand(node.id);
    };

    return (
      <div>
        <div
          className={`flex items-center gap-1.5 px-2 h-[24px] text-xs rounded-[3px] cursor-pointer select-none transition-colors duration-150 ${
            isSelected
              ? 'bg-[rgba(0,156,255,0.1)] text-[var(--info)] font-medium'
              : `${node.isFolder ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'} hover:bg-[var(--menu-highlight)] hover:text-[var(--text-primary)] active:bg-[var(--menu-highlight)]`
          }`}
          style={{ paddingLeft: `${level * indent + 8}px` }}
          onClick={handleClick}
        >
          {showExpandButton ? (
            <button
              type="button"
              onClick={handleExpandClick}
              className="flex items-center justify-center w-5 h-5 flex-shrink-0 p-0 bg-transparent border-none cursor-pointer"
              disabled={node.loading}
            >
              {node.loading ? (
                <Loader2
                  size={14}
                  className="animate-spin"
                  style={{ color: 'var(--text-tertiary)' }}
                />
              ) : node.expanded ? (
                <ChevronDown
                  size={14}
                  style={{ color: 'var(--text-tertiary)' }}
                />
              ) : (
                <ChevronRight
                  size={14}
                  style={{ color: 'var(--text-tertiary)' }}
                />
              )}
            </button>
          ) : (
            <div className="w-5 flex-shrink-0" />
          )}

          {multiSelect && !node.isFolder && (
            <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
              {isSelected ? (
                <Check size={14} style={{ color: 'var(--info)' }} />
              ) : (
                <Square size={14} style={{ color: 'var(--text-tertiary)' }} />
              )}
            </div>
          )}

          {node.isFolder ? (
            <Folder
              size={14}
              className="flex-shrink-0"
              style={{
                color: isSelected ? 'var(--info)' : 'var(--warning-500)',
              }}
            />
          ) : (
            <FileText
              size={14}
              className="flex-shrink-0"
              style={{
                color: isSelected ? 'var(--info)' : 'var(--text-tertiary)',
              }}
            />
          )}

          <span className="flex-1 truncate">{node.name}</span>
        </div>

        {showExpandButton && (
          <div
            className={showConnector ? 'border-l ml-1' : ''}
            style={{
              borderColor: 'var(--border-default)',
              display: 'grid',
              gridTemplateRows: node.expanded ? '1fr' : '0fr',
              // 展开/折叠平滑过渡：避免子节点瞬间插入导致整树布局跳动（闪烁）
              transition: 'grid-template-rows 180ms ease',
            }}
            aria-hidden={!node.expanded}
          >
            <div className="overflow-hidden">
              {node.children?.map((child) => (
                <FileTreeRow
                  key={child.id}
                  node={child}
                  level={level + 1}
                  indent={indent}
                  showConnector={showConnector}
                  multiSelect={multiSelect}
                  selectedIds={selectedIds}
                  selectedId={selectedId}
                  onToggleExpand={onToggleExpand}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);

export const FileTree: React.FC<FileTreeProps> = ({
  nodes,
  selectedId,
  onToggleExpand,
  onSelect,
  indent = 5,
  showConnector = true,
  className,
  multiSelect = false,
  selectedIds,
}) => {
  const renderTree = (
    items: FileTreeNode[],
    level: number
  ): React.ReactNode => {
    return items.map((node) => (
      <FileTreeRow
        key={node.id}
        node={node}
        level={level}
        indent={indent}
        showConnector={showConnector}
        multiSelect={multiSelect}
        selectedIds={selectedIds}
        selectedId={selectedId}
        onToggleExpand={onToggleExpand}
        onSelect={onSelect}
      />
    ));
  };

  return <div className={className}>{renderTree(nodes, 0)}</div>;
};
