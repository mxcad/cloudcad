import React from 'react';
import { ChevronRight, ChevronDown, Folder, FileText, Check, Loader2 } from 'lucide-react';

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
}

export const FileTree: React.FC<FileTreeProps> = ({
  nodes,
  selectedId,
  onToggleExpand,
  onSelect,
  indent = 5,
  showConnector = true,
  className,
}) => {
  const renderTree = (items: FileTreeNode[], level: number): React.ReactNode => {
    return items.map((node) => {
      const isSelected = node.id === selectedId;
      const showExpandButton = node.isFolder && node.hasChildren !== false;

      return (
        <div key={node.id}>
          <div
            className="flex items-center gap-1.5 px-2 h-[24px] text-xs rounded-[3px] cursor-pointer select-none transition-colors duration-150"
            style={{
              paddingLeft: `${level * indent + 8}px`,
              color: isSelected ? 'var(--info)' : node.isFolder ? 'var(--text-secondary)' : 'var(--text-primary)',
              background: isSelected ? 'rgba(0,156,255,0.1)' : 'transparent',
              fontWeight: isSelected ? 500 : 400,
            }}
            onClick={() => onSelect(node)}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = 'var(--menu-highlight)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = node.isFolder ? 'var(--text-secondary)' : 'var(--text-primary)';
              }
            }}
          >
            {showExpandButton ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(node.id);
                }}
                className="flex items-center justify-center w-5 h-5 flex-shrink-0 p-0 bg-transparent border-none cursor-pointer"
                disabled={node.loading}
              >
                {node.loading ? (
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
                ) : node.expanded ? (
                  <ChevronDown size={14} style={{ color: 'var(--text-tertiary)' }} />
                ) : (
                  <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
                )}
              </button>
            ) : (
              <div className="w-5 flex-shrink-0" />
            )}

            {node.isFolder ? (
              <Folder size={14} className="flex-shrink-0" style={{ color: isSelected ? 'var(--info)' : undefined }} />
            ) : (
              <FileText size={14} className="flex-shrink-0" style={{ color: isSelected ? 'var(--info)' : 'var(--text-tertiary)' }} />
            )}

            <span className="flex-1 truncate">{node.name}</span>

            {isSelected && (
              <Check size={14} className="flex-shrink-0" style={{ color: 'var(--info)' }} />
            )}
          </div>

          {node.expanded && node.children && node.children.length > 0 && (
            <div className={showConnector ? 'border-l ml-1' : ''} style={{ borderColor: 'var(--border-default)' }}>
              {renderTree(node.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return <div className={className}>{renderTree(nodes, 0)}</div>;
};
