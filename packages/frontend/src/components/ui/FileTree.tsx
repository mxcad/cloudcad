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
            className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all duration-200 hover:bg-slate-50 border border-transparent"
            style={{
              paddingLeft: `${level * indent + 8}px`,
              ...(isSelected && {
                background: 'var(--primary-50)',
                color: 'var(--primary-700)',
                borderColor: 'var(--primary-200)',
              }),
            }}
            onClick={() => onSelect(node)}
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
              <Folder size={18} className="flex-shrink-0" style={{ color: isSelected ? 'var(--primary-600)' : undefined }} />
            ) : (
              <FileText size={18} className="flex-shrink-0" style={{ color: isSelected ? 'var(--primary-600)' : 'var(--text-tertiary)' }} />
            )}

            <span
              className="flex-1 truncate"
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: isSelected ? 500 : 400,
                color: isSelected ? 'var(--primary-700)' : node.isFolder ? 'var(--text-secondary)' : 'var(--text-primary)',
              }}
            >
              {node.name}
            </span>

            {isSelected && (
              <Check size={18} className="flex-shrink-0" style={{ color: 'var(--primary-600)' }} />
            )}
          </div>

          {node.expanded && node.children && node.children.length > 0 && (
            <div className={showConnector ? 'border-l border-slate-200 ml-1' : ''}>
              {renderTree(node.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return <div className={className}>{renderTree(nodes, 0)}</div>;
};
