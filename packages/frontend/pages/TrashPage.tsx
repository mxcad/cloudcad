import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Trash, Check, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ToastContainer } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { FileItem } from '../components/FileItem';
import { trashApi } from '../services/apiService';
import { FileSystemNode } from '../types/filesystem';
import { ToastType, Toast } from '../components/ui/Toast';

interface TrashItem extends FileSystemNode {
  itemType: 'project' | 'node';
}

export const TrashPage: React.FC = () => {
  const navigate = useNavigate();

  // 状态
  const [loading, setLoading] = useState(false);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'warning',
  });

  // Toast 操作
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // 确认对话框操作
  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void,
      type: 'danger' | 'warning' | 'info' = 'warning'
    ) => {
      setConfirmDialog({
        isOpen: true,
        title,
        message,
        onConfirm: () => {
          onConfirm();
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        },
        type,
      });
    },
    []
  );

  // 加载回收站数据
  const loadTrashItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await trashApi.getList();
      setTrashItems(response.data || []);
      setSelectedIds(new Set()); // 清空选择
    } catch (err) {
      const errorMessage =
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
        (err as Error).message ||
        '加载回收站失败';
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadTrashItems();
  }, [loadTrashItems]);

  // 选择/取消选择
  const handleSelect = useCallback((id: string, isMultiSelect = true) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (isMultiSelect) {
        // 多选模式：切换选择状态
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
      } else {
        // 单选模式：只选择当前项
        newSet.clear();
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  // 全选/取消全选
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === trashItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(trashItems.map((item) => item.id)));
    }
  }, [selectedIds.size, trashItems]);

  // 批量恢复
  const handleRestoreSelected = useCallback(() => {
    if (selectedIds.size === 0) {
      showToast('请选择要恢复的项目', 'info');
      return;
    }

    showConfirm(
      '确认恢复',
      `确定要恢复选中的 ${selectedIds.size} 个项目吗？`,
      async () => {
        try {
          await trashApi.restoreItems(Array.from(selectedIds));
          showToast(`已恢复 ${selectedIds.size} 个项目`, 'success');
          loadTrashItems();
        } catch (err) {
          const errorMessage =
            (err as Error & { response?: { data?: { message?: string } } })
              .response?.data?.message ||
            (err as Error).message ||
            '恢复失败';
          showToast(errorMessage, 'error');
        }
      },
      'warning'
    );
  }, [selectedIds, showConfirm, showToast, loadTrashItems]);

  // 批量彻底删除
  const handlePermanentlyDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) {
      showToast('请选择要删除的项目', 'info');
      return;
    }

    showConfirm(
      '确认彻底删除',
      `确定要彻底删除选中的 ${selectedIds.size} 个项目吗？此操作不可恢复。`,
      async () => {
        try {
          await trashApi.permanentlyDeleteItems(Array.from(selectedIds));
          showToast(`已彻底删除 ${selectedIds.size} 个项目`, 'success');
          loadTrashItems();
        } catch (err) {
          const errorMessage =
            (err as Error & { response?: { data?: { message?: string } } })
              .response?.data?.message ||
            (err as Error).message ||
            '删除失败';
          showToast(errorMessage, 'error');
        }
      },
      'danger'
    );
  }, [selectedIds, showConfirm, showToast, loadTrashItems]);

  // 清空回收站
  const handleClearTrash = useCallback(() => {
    if (trashItems.length === 0) {
      showToast('回收站已经是空的', 'info');
      return;
    }

    showConfirm(
      '确认清空回收站',
      `确定要清空回收站吗？此操作将彻底删除所有 ${trashItems.length} 个项目/文件，且不可恢复。`,
      async () => {
        try {
          await trashApi.clear();
          showToast('回收站已清空', 'success');
          loadTrashItems();
        } catch (err) {
          const errorMessage =
            (err as Error & { response?: { data?: { message?: string } } })
              .response?.data?.message ||
            (err as Error).message ||
            '清空失败';
          showToast(errorMessage, 'error');
        }
      },
      'danger'
    );
  }, [trashItems.length, showConfirm, showToast, loadTrashItems]);

  // 返回文件管理
  const handleGoBack = useCallback(() => {
    navigate('/projects');
  }, [navigate]);

  // 渲染空状态
  const renderEmpty = () => (
    <div className="flex flex-col items-center justify-center py-16">
      <Trash2 size={64} className="text-slate-300 mb-4" />
      <h3 className="text-base font-semibold text-slate-900 mb-2">
        回收站是空的
      </h3>
      <p className="text-slate-500 text-sm">删除的项目和文件会出现在这里</p>
      <Button
        onClick={handleGoBack}
        variant="outline"
        size="sm"
        className="mt-4"
      >
        返回文件管理
      </Button>
    </div>
  );

  // 渲染项目列表
  const renderItems = () => {
    if (trashItems.length === 0) return null;

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-6">
        {trashItems.map((item) => (
          <FileItem
            key={item.id}
            node={item}
            isSelected={selectedIds.has(item.id)}
            viewMode="grid"
            isMultiSelectMode={true}
            isTrash={true}
            onSelect={handleSelect}
            onEnter={() => {}}
            onDownload={() => {}}
            onDelete={() => {}}
            onRename={() => {}}
            onRestore={handleRestoreSingle}
          />
        ))}
      </div>
    );
  };

  // 恢复单个文件
  const handleRestoreSingle = useCallback(
    async (node: FileSystemNode) => {
      showConfirm(
        '确认恢复',
        `确定要恢复 "${node.name}" 吗？`,
        async () => {
          try {
            await trashApi.restoreItems([node.id]);
            showToast(`已恢复 "${node.name}"`, 'success');
            loadTrashItems();
          } catch (err) {
            const errorMessage =
              err.response?.data?.message || err.message || '恢复失败';
            showToast(errorMessage, 'error');
          }
        },
        'warning'
      );
    },
    [showConfirm, showToast, loadTrashItems]
  );

  const hasSelection = selectedIds.size > 0;
  const isAllSelected =
    selectedIds.size === trashItems.length && trashItems.length > 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 relative">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() =>
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
        }
        type={confirmDialog.type}
      />

      {/* 头部 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleGoBack}
              className="p-1.5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all"
              title="返回"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 12H5M5 12L12 19M5 12L12 5" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">回收站</h1>
              <p className="text-sm text-slate-500">
                {trashItems.length} 个项目
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadTrashItems}
              disabled={loading}
            >
              <RefreshCw
                size={16}
                className={`mr-2 ${loading ? 'animate-spin' : ''}`}
              />
              刷新
            </Button>

            {trashItems.length > 0 && (
              <>
                {!hasSelection && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearTrash}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <Trash size={16} className="mr-2" />
                    清空回收站
                  </Button>
                )}

                {hasSelection && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                    >
                      {isAllSelected ? (
                        <Check size={16} className="mr-2" />
                      ) : null}
                      {isAllSelected ? '取消全选' : '全选'}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRestoreSelected}
                    >
                      <RefreshCw size={16} className="mr-2" />
                      恢复 ({selectedIds.size})
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePermanentlyDeleteSelected}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Trash size={16} className="mr-2" />
                      删除 ({selectedIds.size})
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 内容 */}
      <div className="bg-white rounded-2xl border border-slate-200 min-h-[400px] shadow-sm overflow-hidden">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-slate-200" />
              <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
            </div>
            <p className="mt-4 text-slate-500 font-medium">加载中...</p>
          </div>
        )}

        {!loading && trashItems.length === 0 && renderEmpty()}

        {!loading && trashItems.length > 0 && renderItems()}
      </div>
    </div>
  );
};

export default TrashPage;
