import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  DownloadIcon,
  DeleteIcon,
  EditIcon,
  MoreIcon,
  UsersIcon,
  RestoreIcon,
  GalleryIcon,
  getFileIconComponent,
} from './FileIcons';
import { FileSystemNode } from '../../types/filesystem';
import { formatDate, formatFileSize } from '../utils/fileUtils';
import { getThumbnailUrl } from '../utils/fileUtils';
import { AlertTriangle, Upload } from 'lucide-react';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { ExternalReferenceModal } from './modals/ExternalReferenceModal';

interface FileItemProps {
  node: FileSystemNode;
  isSelected: boolean;
  viewMode: 'grid' | 'list';
  isMultiSelectMode?: boolean;
  isTrash?: boolean; // 是否在回收站场景
  onSelect: (nodeId: string, isMultiSelect?: boolean) => void;
  onEnter: (node: FileSystemNode) => void;
  onDownload: (node: FileSystemNode) => void;
  onDelete: (node: FileSystemNode) => void;
  onRename: (node: FileSystemNode) => void;
  onRefresh?: () => void; // 刷新文件列表
  // 项目特有操作（仅 isRoot 时使用）
  onEdit?: (e: React.MouseEvent) => void;
  onDeleteNode?: (e: React.MouseEvent) => void;
  onShowMembers?: (e: React.MouseEvent) => void;
  // 回收站特有操作
  onRestore?: (node: FileSystemNode) => void;
  // 移动和拷贝操作
  onMove?: (node: FileSystemNode) => void;
  onCopy?: (node: FileSystemNode) => void;
  // 添加到图库操作
  onAddToGallery?: (node: FileSystemNode) => void;
  // 拖拽操作
  onDragStart?: (e: React.DragEvent, node: FileSystemNode) => void;
  onDragOver?: (e: React.DragEvent, node: FileSystemNode) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent, node: FileSystemNode) => void;
  isDropTarget?: boolean;
}

export const FileItem: React.FC<FileItemProps> = ({
  node,
  isSelected,
  viewMode,
  isMultiSelectMode = false,
  isTrash = false,
  onSelect,
  onEnter,
  onDownload,
  onDelete,
  onRename,
  onRefresh,
  onEdit,
  onDeleteNode,
  onShowMembers,
  onRestore,
  onMove,
  onCopy,
  onAddToGallery,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  isDropTarget = false,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const isRoot = node.isRoot;
  const modalRef = useRef<{
    checkMissingReferences: () => Promise<boolean>;
  } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  // 监听菜单状态变化
  useEffect(() => {
    // console.log('[FileItem] showMenu 状态变化:', {
    //   showMenu,
    //   menuPosition,
    //   node: node.name,
    // });
  }, [showMenu, menuPosition, node.name]);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!showMenu) return;

    console.log('[FileItem] 添加外部点击监听器');

    const handleClickOutside = (e: MouseEvent) => {
      console.log('[FileItem] 外部点击事件触发', {
        target: e.target,
        menuButtonRefCurrent: menuButtonRef.current,
        menuContainerRefCurrent: menuContainerRef.current,
        menuButtonContains: menuButtonRef.current?.contains(e.target as Node),
        menuContainerContains: menuContainerRef.current?.contains(e.target as Node),
      });

      const isClickInMenuButton = menuButtonRef.current?.contains(e.target as Node);
      const isClickInMenuContainer = menuContainerRef.current?.contains(e.target as Node);

      if (!isClickInMenuButton && !isClickInMenuContainer) {
        console.log('[FileItem] 点击在菜单外部，关闭菜单');
        setShowMenu(false);
        setMenuPosition(null);
      } else {
        console.log('[FileItem] 点击在菜单内部，不关闭菜单');
      }
    };

    const handleScroll = () => {
      if (showMenu && menuButtonRef.current) {
        const rect = menuButtonRef.current.getBoundingClientRect();
        setMenuPosition({
          top: rect.bottom + 4,
          left: rect.right - 120,
        });
      }
    };

    // 使用 setTimeout 延迟添加事件监听器，避免菜单按钮点击时立即触发
    const timeoutId = setTimeout(() => {
      console.log('[FileItem] 延迟 100ms 后添加外部点击监听器');
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
    }, 100);

    return () => {
      console.log('[FileItem] 移除外部点击监听器');
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [showMenu]);

  // 外部参照上传 Hook（任务008/009）
  const externalReferenceUpload = useExternalReferenceUpload({
    nodeId: node.id, // 传递节点 ID 用于权限验证
    fileHash: node.fileHash || '',
    onSuccess: () => {
      console.log('[FileItem] 外部参照上传成功');
      window.location.reload();
    },
    onError: (error) => {
      console.error('[FileItem] 外部参照上传失败:', error);
    },
    onSkip: () => {
      console.log('[FileItem] 用户跳过外部参照上传');
    },
  });

  // 阻止文件项点击的标志
  const blockItemClickRef = useRef(false);

  /**
   * 处理上传外部参照（任务009 - 随时上传）
   * 只有在有缺失外部参照时才打开文件选择对话框
   */
  const handleUploadExternalReference = useCallback(
    async (e: React.MouseEvent) => {
      console.log('[FileItem] handleUploadExternalReference 被调用');
      e.stopPropagation();
      e.preventDefault();
      setShowMenu(false);

      // 设置标志，阻止文件项点击
      blockItemClickRef.current = true;
      console.log('[FileItem] 设置 blockItemClickRef = true');

      // 延迟执行，确保菜单完全关闭
      await new Promise((resolve) => setTimeout(resolve, 50));

      if (!node.fileHash) {
        console.error('[FileItem] 文件哈希不存在');
        blockItemClickRef.current = false;
        return;
      }

      // 检查是否有缺失的外部参照
      const hasMissing = await externalReferenceUpload.checkMissingReferences();

      if (hasMissing) {
        console.log('[FileItem] 有缺失外部参照，打开文件选择对话框');
        // 有缺失时，打开模态框让用户选择要上传的文件
        externalReferenceUpload.openModalForUpload();
      } else {
        console.log('[FileItem] 无缺失外部参照，刷新文件列表');
        // 无缺失时，刷新文件列表以更新 hasMissingExternalReferences 字段
        onRefresh?.();
        alert('所有外部参照已存在，无需上传');
      }

      // 模态框打开后，等待一段时间再重置标志
      // 这样可以确保在模态框打开期间，文件项的点击事件被阻止
      setTimeout(() => {
        console.log('[FileItem] 1秒后重置 blockItemClickRef = false');
        blockItemClickRef.current = false;
      }, 1000);
    },
    [node.fileHash, externalReferenceUpload]
  );

  /**
   * 检查是否为 CAD 文件（支持外部参照上传）
   */
  const isCadFile = useCallback(() => {
    if (node.isFolder || node.isRoot) return false;
    const ext = node.extension?.toLowerCase();
    return ext === '.dwg' || ext === '.dxf';
  }, [node.extension, node.isFolder, node.isRoot]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // 检查是否应该阻止点击（例如：刚从菜单操作返回）
      if (blockItemClickRef.current) {
        console.log('[FileItem] 阻止文件项点击');
        blockItemClickRef.current = false;
        return;
      }

      if (isMultiSelectMode) {
        // 多选模式：处理选择
        const isCtrl = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;
        onSelect(node.id, isCtrl || true, isShift);
      } else {
        // 非多选模式：直接进入
        console.log('[FileItem] 调用 onEnter:', node.name);
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

  const handleMenuAction = useCallback((action: () => void) => {
    console.log('[FileItem] handleMenuAction 被调用');
    action();
    setShowMenu(false);
  }, []);

  // 网格视图
  if (viewMode === 'grid') {
    // 非多选模式下，不显示选中样式（点击直接进入）
    const showSelection = isMultiSelectMode && isSelected;

    return (
      <div
        className={`group relative rounded-xl transition-all duration-200 cursor-pointer pointer-events-auto
          ${
            showSelection
              ? 'bg-indigo-50 border-2 border-indigo-500 shadow-md'
              : isDropTarget
                ? 'bg-green-50 border-2 border-green-500 shadow-md'
                : 'bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-lg hover:-translate-y-0.5'
          }
        `}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setShowMenu(false);
          onDragLeave?.();
        }}
        draggable={!!onDragStart && !node.isRoot}
        onDragStart={(e) => onDragStart?.(e, node)}
        onDragOver={(e) => onDragOver?.(e, node)}
        onDrop={(e) => onDrop?.(e, node)}
      >
        {/* 选择指示器 - 仅在多选模式下显示 */}
        {isMultiSelectMode && (
          <div
            className={`absolute top-3 left-3 w-5 h-5 rounded-full border-2 transition-all duration-200 z-10 cursor-pointer
              ${
                isSelected
                  ? 'bg-indigo-500 border-indigo-500'
                  : 'bg-white/80 border-slate-300 group-hover:border-indigo-400'
              }
            `}
            onClick={(e) => {
              e.stopPropagation();
              const isShift = e.shiftKey;
              onSelect(node.id, true, isShift); // 点击选择框使用多选模式（toggle）
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
            {!node.isFolder &&
            ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(
              node.extension?.toLowerCase() || ''
            ) ? (
              imageLoadError ? (
                getFileIconComponent(node, 64)
              ) : (
                <img
                  src={getThumbnailUrl(node)}
                  alt={node.name}
                  className="w-full h-full object-cover rounded-lg"
                  onError={() => setImageLoadError(true)}
                />
              )
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

          {/* 缺失外部参照警告（任务008） */}
          {node.hasMissingExternalReferences && (
            <div className="flex items-center justify-center gap-1 mt-1 px-2">
              <AlertTriangle
                size={12}
                className="text-amber-500 flex-shrink-0"
              />
              <span className="text-xs text-amber-600 whitespace-nowrap">
                缺失 {node.missingExternalReferencesCount || 0} 个外部参照
              </span>
            </div>
          )}

          {/* 文件信息 */}
          <p
            className="text-xs text-slate-500 text-center mt-1 truncate px-2"
            title={node.description || undefined}
          >
            {isRoot
              ? node.description || '暂无描述'
              : node.isFolder
                ? `${node._count?.children || 0} 个项目`
                : formatFileSize(node.size)}
          </p>
        </div>

        {/* 操作菜单 */}
        <div
          className={`absolute top-3 right-3 transition-opacity duration-200 z-20 pointer-events-auto ${
            isHovered || showMenu ? 'opacity-100' : 'opacity-100'
          }`}
        >
          <div className="relative flex items-center gap-1">
            <button
              ref={menuButtonRef}
              onClick={(e) => {
                console.log('[FileItem] 菜单按钮被点击', {
                  showMenu,
                  event: e,
                  menuButtonRefExists: !!menuButtonRef.current,
                  menuButtonRefCurrent: menuButtonRef.current,
                });
                e.stopPropagation();

                const newShowMenu = !showMenu;
                console.log('[FileItem] 切换菜单状态:', { from: showMenu, to: newShowMenu });

                if (!showMenu && menuButtonRef.current) {
                  const rect = menuButtonRef.current.getBoundingClientRect();
                  const newPosition = {
                    top: rect.bottom + 4,
                    left: rect.right - 120,
                  };
                  console.log('[FileItem] 设置菜单位置:', {
                    rect,
                    newPosition,
                  });
                  setMenuPosition(newPosition);
                } else {
                  console.log('[FileItem] 清除菜单位置', {
                    showMenu,
                    menuButtonRefCurrent: menuButtonRef.current,
                  });
                  setMenuPosition(null);
                }

                setShowMenu(newShowMenu);
                console.log('[FileItem] 菜单状态切换完成');
              }}
              className="w-8 h-8 rounded-full bg-white/90 hover:bg-white shadow-sm border border-slate-200
                         flex items-center justify-center text-slate-500 hover:text-slate-700
                         transition-colors"
            >
              <MoreIcon size={16} />
            </button>
          </div>
        </div>
        {/* 下拉菜单 - 使用 Portal 渲染到 body 层级 */}
        {showMenu &&
          menuPosition &&
          (() => {
            console.log('[FileItem] 下拉菜单即将渲染', {
              node: node.name,
              isTrash,
              isRoot,
              menuPosition,
            });
            return createPortal(
              <div
                ref={menuContainerRef}
                className="fixed bg-white rounded-lg shadow-xl border border-slate-200
                           py-1 min-w-[120px] z-[99999] animate-scale-in origin-top-right pointer-events-auto"
                style={{
                  top: `${menuPosition.top}px`,
                  left: `${menuPosition.left}px`,
                }}
                onClick={(e) => {
                  console.log('[FileItem] 下拉菜单容器被点击', { event: e });
                  e.stopPropagation();
                }}
              >
              {/* 回收站场景：只显示恢复和删除 */}
              {isTrash ? (
                <>
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
                    彻底删除
                  </button>
                </>
              ) : (
                <>
                  {/* 上传外部参照按钮（任务009 - 仅在有缺失外部参照时显示） */}
                  {isCadFile() && node.hasMissingExternalReferences && (
                    <button
                      onClick={handleUploadExternalReference}
                      className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors text-amber-600 hover:bg-amber-50"
                    >
                      <Upload size={16} />
                      上传外部参照
                    </button>
                  )}

                  {/* 项目根节点显示编辑和成员 */}
                  {isRoot ? (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log('[FileItem] 编辑按钮被点击', { node, onEdit });
                          handleMenuAction(() => {
                            console.log('[FileItem] 执行 onEdit 回调');
                            onEdit?.();
                          });
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
                          console.log('[FileItem] 成员按钮被点击', { node, onShowMembers });
                          handleMenuAction(() => {
                            console.log('[FileItem] 执行 onShowMembers 回调');
                            onShowMembers?.();
                          });
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
                          console.log('[FileItem] 删除按钮被点击', { node });
                          handleMenuAction(() => {
                            console.log('[FileItem] 执行 onDelete 回调');
                            onDelete(node);
                          });
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
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log('[FileItem] 下载按钮被点击', { node });
                              handleMenuAction(() => {
                                console.log('[FileItem] 执行 onDownload 回调');
                                onDownload(node);
                              });
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50
                                       flex items-center gap-2 transition-colors"
                          >
                            <DownloadIcon size={16} />
                            下载
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log('[FileItem] 添加到图库按钮被点击', { node });
                              handleMenuAction(() => {
                                console.log('[FileItem] 执行 onAddToGallery 回调');
                                onAddToGallery?.(node);
                              });
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-indigo-600 hover:bg-indigo-50
                                       flex items-center gap-2 transition-colors"
                          >
                            <GalleryIcon size={16} />
                            添加到图库
                          </button>
                        </>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log('[FileItem] 重命名按钮被点击', { node });
                          handleMenuAction(() => {
                            console.log('[FileItem] 执行 onRename 回调');
                            onRename(node);
                          });
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50
                                   flex items-center gap-2 transition-colors"
                      >
                        <EditIcon size={16} />
                        重命名
                      </button>
                      {onMove && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            console.log('[FileItem] 移动到按钮被点击', { node });
                            handleMenuAction(() => {
                              console.log('[FileItem] 执行 onMove 回调');
                              onMove(node);
                            });
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50
                                     flex items-center gap-2 transition-colors"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M5 9l7-7 7 7M5 15l7 7 7-7" />
                          </svg>
                          移动到...
                        </button>
                      )}
                      {onCopy && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            console.log('[FileItem] 复制到按钮被点击', { node });
                            handleMenuAction(() => {
                              console.log('[FileItem] 执行 onCopy 回调');
                              onCopy(node);
                            });
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50
                                     flex items-center gap-2 transition-colors"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <rect
                              x="9"
                              y="9"
                              width="13"
                              height="13"
                              rx="2"
                              ry="2"
                            />
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                          </svg>
                          复制到...
                        </button>
                      )}
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
                </>
              )}
            </div>,
              document.body
            );
          })()}

        {/* 外部参照上传模态框（任务008） */}
        <ExternalReferenceModal
          isOpen={externalReferenceUpload.isOpen}
          files={externalReferenceUpload.files}
          loading={externalReferenceUpload.loading}
          onSelectAndUpload={externalReferenceUpload.selectAndUploadFiles}
          onComplete={externalReferenceUpload.complete}
          onSkip={externalReferenceUpload.skip}
          onClose={externalReferenceUpload.close}
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
        ${
          showListSelection
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
        onDragLeave?.();
      }}
      draggable={!!onDragStart && !node.isRoot}
      onDragStart={(e) => onDragStart?.(e, node)}
      onDragOver={(e) => onDragOver?.(e, node)}
      onDrop={(e) => onDrop?.(e, node)}
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
            const isShift = e.shiftKey;
            onSelect(node.id, true, isShift); // 点击选择框使用多选模式（toggle）
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
        {!node.isFolder &&
        ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(
          node.extension?.toLowerCase() || ''
        ) ? (
          imageLoadError ? (
            getFileIconComponent(node, 40)
          ) : (
            <img
              src={getThumbnailUrl(node)}
              alt={node.name}
              className="w-full h-full object-cover rounded-lg"
              onError={() => setImageLoadError(true)}
            />
          )
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
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-500">
            {formatDate(node.updatedAt)}
            {!node.isFolder && ` • ${formatFileSize(node.size)}`}
          </p>
          {/* 缺失外部参照警告（任务008） */}
          {node.hasMissingExternalReferences && (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangle size={10} />
              缺失 {node.missingExternalReferencesCount || 0} 个外部参照
            </span>
          )}
        </div>
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
          {isRoot
            ? '项目'
            : node.isFolder
              ? '文件夹'
              : node.extension?.toUpperCase().replace('.', '')}
        </span>
      </div>

      {/* 操作菜单 - 列表模式下始终显示 */}
      <div className="flex items-center gap-1 opacity-100 transition-opacity duration-200">
        {/* 回收站场景：只显示恢复和删除 */}
        {isTrash ? (
          <>
            {onRestore && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore(node);
                }}
                className="p-2 rounded-lg text-slate-500 hover:text-green-600 hover:bg-green-50"
                title="恢复"
              >
                <RestoreIcon size={18} />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node);
              }}
              className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50"
              title="彻底删除"
            >
              <DeleteIcon size={18} />
            </button>
          </>
        ) : (
          <>
            {/* 上传外部参照按钮（任务009 - 仅在有缺失外部参照时显示） */}
            {isCadFile() && node.hasMissingExternalReferences && (
              <button
                onClick={handleUploadExternalReference}
                className="p-2 rounded-lg transition-colors text-amber-600 hover:bg-amber-50"
                title="上传外部参照"
              >
                <Upload size={18} />
              </button>
            )}

            {/* 项目根节点显示编辑和成员 */}
            {isRoot ? (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.();
                  }}
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  title="编辑"
                >
                  <EditIcon size={18} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowMembers?.();
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
                  <>
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToGallery?.(node);
                      }}
                      className="p-2 rounded-lg text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50"
                      title="添加到图库"
                    >
                      <GalleryIcon size={18} />
                    </button>
                  </>
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
                {onMove && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(node);
                    }}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    title="移动到"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M5 9l7-7 7 7M5 15l7 7 7-7" />
                    </svg>
                  </button>
                )}
                {onCopy && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopy(node);
                    }}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    title="复制到"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  </button>
                )}
                {onRestore && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestore(node);
                    }}
                    className="p-2 rounded-lg text-slate-500 hover:text-green-600 hover:bg-green-50"
                    title="恢复"
                  >
                    <RestoreIcon size={18} />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(node);
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    onRestore
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-slate-500 hover:text-red-600 hover:bg-red-50'
                  }`}
                  title={onRestore ? '彻底删除' : '删除'}
                >
                  <DeleteIcon size={18} />
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// 包装组件，保持向后兼容
export const FileIconComponent: React.FC<{
  node: FileSystemNode;
  size?: number;
}> = ({ node, size = 48 }) => {
  return null; // 实际实现在 FileIcons.tsx 中
};
