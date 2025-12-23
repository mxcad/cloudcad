import React, { useState } from 'react';
import { Download, Trash2, Edit } from 'lucide-react';
import { Button } from './ui/Button';
import { FileSystemNode } from '../../types/filesystem';
import { getFileIcon, formatDate, formatFileSize } from '../utils/fileUtils';

interface FileItemProps {
  node: FileSystemNode;
  isSelected: boolean;
  viewMode: 'grid' | 'list';
  onSelect: (nodeId: string) => void;
  onEnter: (node: FileSystemNode) => void;
  onDownload: (node: FileSystemNode) => void;
  onDelete: (node: FileSystemNode) => void;
  onRename: (node: FileSystemNode) => void;
}

export const FileItem: React.FC<FileItemProps> = ({
  node,
  isSelected,
  viewMode,
  onSelect,
  onEnter,
  onDownload,
  onDelete,
  onRename,
}) => {
  const [showActions, setShowActions] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd + 点击：多选
      onSelect(node.id);
    } else if (e.shiftKey) {
      // Shift + 点击：范围选择（这里简化为单选）
      onSelect(node.id);
    } else {
      // 普通点击
      onSelect(node.id);
      onEnter(node);
    }
  };

  const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    action();
    setShowActions(false);
  };

  if (viewMode === 'grid') {
    return (
      <div
        className={`relative group cursor-pointer rounded-lg border-2 transition-all ${
          isSelected
            ? 'border-blue-500 bg-blue-50'
            : 'border-transparent hover:border-slate-300 hover:bg-slate-50'
        }`}
        onClick={handleClick}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        <div className="p-4">
          <div className="flex flex-col items-center text-center">
            <div className="text-4xl mb-2">
              {getFileIcon(node)}
            </div>
            <h3 className="font-medium text-slate-900 truncate w-full" title={node.name}>
              {node.name}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {node.isFolder ? `${node._count?.children || 0} 项` : formatFileSize(node.size)}
            </p>
          </div>
        </div>

        {/* 操作按钮 */}
        {showActions && (
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => handleActionClick(e, () => onDownload(node))}
              disabled={node.isFolder}
              title="下载"
            >
              <Download size={14} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => handleActionClick(e, () => onRename(node))}
              title="重命名"
            >
              <Edit size={14} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => handleActionClick(e, () => onDelete(node))}
              title="删除"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        )}
      </div>
    );
  }

  // 列表视图
  return (
    <div
      className={`flex items-center gap-3 p-3 border-b hover:bg-slate-50 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50 border-blue-200' : 'border-slate-200'
      }`}
      onClick={handleClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="text-2xl">
        {getFileIcon(node)}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-slate-900 truncate" title={node.name}>
          {node.name}
        </h3>
        <p className="text-xs text-slate-500">
          {formatDate(node.updatedAt)}
          {!node.isFolder && ` • ${formatFileSize(node.size)}`}
        </p>
      </div>
      
      {showActions && (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => handleActionClick(e, () => onDownload(node))}
            disabled={node.isFolder}
            title="下载"
          >
            <Download size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => handleActionClick(e, () => onRename(node))}
            title="重命名"
          >
            <Edit size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => handleActionClick(e, () => onDelete(node))}
            title="删除"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      )}
    </div>
  );
};