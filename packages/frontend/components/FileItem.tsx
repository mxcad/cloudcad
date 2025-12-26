import React, { useState, useCallback } from 'react';
import {
  DownloadIcon,
  DeleteIcon,
  EditIcon,
  MoreIcon,
  UsersIcon,
  RestoreIcon,
  getFileIconComponent,
} from './FileIcons';
import { Button } from './ui/Button';
import { FileSystemNode } from '../../types/filesystem';
import { formatDate, formatFileSize } from '../utils/fileUtils';
import { getThumbnailUrl } from '../utils/fileUtils';

interface FileItemProps {
  node: FileSystemNode;
  isSelected: boolean;
  viewMode: 'grid' | 'list';
  isMultiSelectMode?: boolean;
  onSelect: (nodeId: string, isMultiSelect?: boolean) => void;
  onEnter: (node: FileSystemNode) => void;
  onDownload: (node: FileSystemNode) => void;
  onDelete: (node: FileSystemNode) => void;
  onRename: (node: FileSystemNode) => void;
  // 项目特有操作（仅 isRoot 时使用）
  onEdit?: (e: React.MouseEvent) => void;
  onDeleteNode?: (e: React.MouseEvent) => void;
  onShowMembers?: (e: React.MouseEvent) => void;
  // 回收站特有操作
  onRestore?: (node: FileSystemNode) => void;
}

export const FileItem: React.FC<FileItemProps> = ({
  node,
  isSelected,
  viewMode,
  isMultiSelectMode = false,
  onSelect,
  onEnter,
  onDownload,
  onDelete,
  onRename,
  onEdit,
  onDeleteNode,
  onShowMembers,
  onRestore,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isRoot = node.isRoot;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isMultiSelectMode) {
        // 多选模式：处理选择
        const isCtrl = e.ctrlKey || e.metaKey;
        onSelect(node.id, isCtrl || true);
      } else {
        // 非多选模式：直接进入
        onEnter(node);
      }
    },
    [node, isMultiSelectMode, onSelect, onEnter]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      onEnter(node);
    },
    [node, onEnter]
  );

  const handleMenuAction = useCallback(
    (action: () => void) => {
      action();
      setShowMenu(false);
    },
    []
  );

  // 网格视图
  if (viewMode === 'grid') {
    // 非多选模式下，不显示选中样式（点击直接进入）
    const showSelection = isMultiSelectMode && isSelected;
    
    return (
      <div
        className={`group relative rounded-xl transition-all duration-200 cursor-pointer
          ${showSelection 
            ? 'bg-indigo-50 border-2 border-indigo-500 shadow-md' 
            : 'bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-lg hover:-translate-y-0.5'
          }
        `}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setShowMenu(false);
        }}
      >
        {/* 选择指示器 - 仅在多选模式下显示 */}
        {isMultiSelectMode && (
          <div
            className={`absolute top-3 left-3 w-5 h-5 rounded-full border-2 transition-all duration-200 z-10 cursor-pointer
              ${isSelected
                ? 'bg-indigo-500 border-indigo-500'
                : 'bg-white/80 border-slate-300 group-hover:border-indigo-400'
              }
            `}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(node.id, true); // 点击选择框使用多选模式（toggle）
            }}
            title={isSelected ? '单击取消选择' : '单击选择'}
          >
            {isSelected && (
              <svg
                className="w-full h-full text-white p-0.5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        )}

        {/* 图标区域 */}
        <div className="p-6 pb-4">
          <div
            className={`w-16 h-16 mx-auto mb-4 transition-transform duration-200 
              ${isHovered && !showSelection ? 'scale-110' : ''}
              ${showSelection ? 'scale-105' : ''}
            `}
          >
            {/* 图片文件显示缩略图 */}
            {!node.isFolder && ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(node.extension?.toLowerCase() || '') ? (
              <img
                src={getThumbnailUrl(node)}
                alt={node.name}
                className="w-full h-full object-cover rounded-lg"
                onError={(e) => {
                  // 缩略图加载失败时显示默认图标
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.parentElement!.innerHTML = getFileIconComponent(node, 64);
                }}
              />
            ) : (
              getFileIconComponent(node, 64)
            )}
          </div>

          {/* 文件名 */}
          <h3
            className="font-medium text-slate-900 text-center truncate px-2"
            title={node.name}
          >
            {node.name}
          </h3>

          {/* 文件信息 */}
          <p className="text-xs text-slate-500 text-center mt-1 truncate px-2" title={node.description || undefined}>
            {isRoot
              ? node.description || '暂无描述'
              : node.isFolder
              ? `${node._count?.children || 0} 个项目`
              : formatFileSize(node.size)}
          </p>
        </div>

        {/* 操作菜单 */}
        <div
          className={`absolute top-3 right-3 transition-opacity duration-200 ${
            isHovered || showMenu ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="w-8 h-8 rounded-full bg-white/90 hover:bg-white shadow-sm border border-slate-200 
                         flex items-center justify-center text-slate-500 hover:text-slate-700
                         transition-colors"
            >
              <MoreIcon size={16} />
            </button>

            {/* 下拉菜单 */}
            {showMenu && (
              <div
                className="absolute right-0 top-10 bg-white rounded-lg shadow-xl border border-slate-200 
                           py-1 min-w-[120px] z-20 animate-scale-in origin-top-right"
              >
                {/* 项目根节点显示编辑和成员 */}
                {isRoot ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMenuAction(() => onEdit?.(e));
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 
                                 flex items-center gap-2 transition-colors"
                    >
                      <EditIcon size={16} />
                      编辑
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMenuAction(() => onShowMembers?.(e));
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 
                                 flex items-center gap-2 transition-colors"
                    >
                      <UsersIcon size={16} />
                      成员
                    </button>
                    <hr className="my-1 border-slate-100" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMenuAction(() => onDelete(node));
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 
                                 flex items-center gap-2 transition-colors"
                    >
                      <DeleteIcon size={16} />
                      删除
                    </button>
                  </>
                ) : (
                  <>
                    {!node.isFolder && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMenuAction(() => onDownload(node));
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 
                                   flex items-center gap-2 transition-colors"
                      >
                        <DownloadIcon size={16} />
                        下载
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMenuAction(() => onRename(node));
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50
                                 flex items-center gap-2 transition-colors"
                    >
                      <EditIcon size={16} />
                      重命名
                    </button>
                    {onRestore && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMenuAction(() => onRestore(node));
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-green-600 hover:bg-green-50
                                   flex items-center gap-2 transition-colors"
                      >
                        <RestoreIcon size={16} />
                        恢复
                      </button>
                    )}
                    <hr className="my-1 border-slate-100" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMenuAction(() => onDelete(node));
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50
                                 flex items-center gap-2 transition-colors"
                    >
                      <DeleteIcon size={16} />
                      {onRestore ? '彻底删除' : '删除'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 底部装饰 */}
        <div
          className={`h-1 rounded-b-xl transition-colors duration-200 ${
            showSelection ? 'bg-indigo-500' : 'bg-transparent group-hover:bg-indigo-100'
          }`}
        />
      </div>
    );
  }

  // 列表视图
  // 非多选模式下，不显示选中样式
  const showListSelection = isMultiSelectMode && isSelected;
  
  return (
    <div
      className={`group flex items-center gap-4 p-3 rounded-lg transition-all duration-200 cursor-pointer
        ${showListSelection
          ? 'bg-indigo-50 border border-indigo-200'
          : 'hover:bg-slate-50 border border-transparent hover:border-slate-200'
        }
      `}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowMenu(false);
      }}
    >
      {/* 选择框 - 仅在多选模式下显示 */}
      {isMultiSelectMode && (
        <div
          className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-all duration-200 cursor-pointer ${
            isSelected
              ? 'bg-indigo-500 border-indigo-500'
              : 'border-slate-300 group-hover:border-indigo-400'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(node.id, true); // 点击选择框使用多选模式（toggle）
          }}
          title={isSelected ? '单击取消选择' : '单击选择'}
        >
          {isSelected && (
            <svg
              className="w-full h-full text-white p-0.5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
      )}

      {/* 图标 */}
      <div className="w-10 h-10 flex-shrink-0">
        {/* 图片文件显示缩略图 */}
        {!node.isFolder && ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(node.extension?.toLowerCase() || '') ? (
          <img
            src={getThumbnailUrl(node)}
            alt={node.name}
            className="w-full h-full object-cover rounded-lg"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              target.parentElement!.innerHTML = getFileIconComponent(node, 40);
            }}
          />
        ) : (
          getFileIconComponent(node, 40)
        )}
      </div>

      {/* 文件信息 */}
      <div className="flex-1 min-w-0">
        <h3
          className="font-medium text-slate-900 truncate"
          style={{
            direction: 'rtl',
            textAlign: 'left',
          }}
          title={node.name}
        >
          <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>
            {node.name}
          </span>
        </h3>
        <p className="text-xs text-slate-500">
          {formatDate(node.updatedAt)}
          {!node.isFolder && ` • ${formatFileSize(node.size)}`}
        </p>
      </div>

      {/* 类型标签 - 固定宽度对齐 */}
      <div className="hidden sm:flex w-16 justify-end">
        <span
          className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${
            isRoot
              ? 'bg-indigo-100 text-indigo-700'
              : node.isFolder
              ? 'bg-amber-100 text-amber-700'
              : node.extension === '.dwg'
              ? 'bg-blue-100 text-blue-700'
              : node.extension === '.dxf'
              ? 'bg-green-100 text-green-700'
              : node.extension === '.pdf'
              ? 'bg-red-100 text-red-700'
              : 'bg-slate-100 text-slate-700'
          }`}
        >
          {isRoot ? '项目' : node.isFolder ? '文件夹' : node.extension?.toUpperCase().replace('.', '')}
        </span>
      </div>

      {/* 操作菜单 */}
      <div
        className={`flex items-center gap-1 transition-opacity duration-200 ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* 项目根节点显示编辑和成员 */}
        {isRoot ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(e);
              }}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              title="编辑"
            >
              <EditIcon size={18} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShowMembers?.(e);
              }}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              title="成员"
            >
              <UsersIcon size={18} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node);
              }}
              className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50"
              title="删除"
            >
              <DeleteIcon size={18} />
            </button>
          </>
        ) : (
          <>
            {!node.isFolder && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload(node);
                }}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                title="下载"
              >
                <DownloadIcon size={18} />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRename(node);
              }}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              title="重命名"
            >
              <EditIcon size={18} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node);
              }}
              className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50"
              title="删除"
            >
              <DeleteIcon size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// 包装组件，保持向后兼容
export const FileIconComponent: React.FC<{ node: FileSystemNode; size?: number }> = ({
  node,
  size = 48,
}) => {
  return null; // 实际实现在 FileIcons.tsx 中
};
