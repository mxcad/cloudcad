import React, { useState, useEffect, useRef, useCallback } from 'react';
import X from 'lucide-react/dist/esm/icons/x';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import Box from 'lucide-react/dist/esm/icons/box';
import Check from 'lucide-react/dist/esm/icons/check';
import Search from 'lucide-react/dist/esm/icons/search';
import Edit2 from 'lucide-react/dist/esm/icons/edit-2';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import Plus from 'lucide-react/dist/esm/icons/plus';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import { galleryApi } from '../../services/galleryApi';
import { useNotification } from '../../contexts/NotificationContext';
import { GALLERY_CONFIG } from '../../constants/appConfig';

type GalleryType = 'drawings' | 'blocks';

// 从配置获取最大层级
const MAX_LEVEL = GALLERY_CONFIG.MAX_TYPE_LEVEL;

interface GalleryTypeData {
  id: number;
  pid: number;
  name: string;
  pname: string;
  status: number;
}

interface AddToGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  nodeId: string;
  fileName: string;
}

// 分类选择器组件
interface CategorySelectProps {
  types: GalleryTypeData[];
  level: number;
  parentId: number;
  value: number;
  onChange: (value: number) => void;
  placeholder: string;
  disabled: boolean;
  galleryType: GalleryType;
  onRefresh: () => Promise<void>;
  showToast: (
    message: string,
    type?: 'success' | 'error' | 'info' | 'warning'
  ) => void;
  showConfirm: (options: {
    title: string;
    message: string;
    type?: 'danger' | 'warning' | 'info';
  }) => Promise<boolean>;
}

const CategorySelect: React.FC<CategorySelectProps> = ({
  types,
  level,
  parentId,
  value,
  onChange,
  placeholder,
  disabled,
  galleryType,
  onRefresh,
  showToast,
  showConfirm,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [editingType, setEditingType] = useState<GalleryTypeData | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const filteredTypes = types.filter(
    (t) =>
      t.pid === parentId &&
      (searchQuery === '' ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedType = types.find((t) => t.id === value);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setIsCreating(false);
        setEditingType(null);
        setEditingName('');
        setNewTypeName('');
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreate = () => {
    setIsCreating(true);
    setNewTypeName('');
    setSearchQuery('');
    setTimeout(() => createInputRef.current?.focus(), 100);
  };

  const handleSaveCreate = async () => {
    if (!newTypeName.trim()) {
      showToast('分类名称不能为空', 'warning');
      return;
    }

    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      await galleryApi.createType(galleryType, newTypeName.trim(), parentId);
      await onRefresh();
      setIsCreating(false);
      setNewTypeName('');
      setSearchQuery('');
    } catch (error) {
      const errorMessage = (error as Error).message || '创建分类失败';
      showToast(`创建分类失败: ${errorMessage}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (type: GalleryTypeData) => {
    setEditingType(type);
    setEditingName(type.name);
    setSearchQuery('');
    setIsCreating(false);
  };

  const handleSaveEdit = async () => {
    if (!editingType || !editingName.trim()) {
      showToast('分类名称不能为空', 'warning');
      return;
    }

    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      await galleryApi.updateType(
        galleryType,
        editingType.id,
        editingName.trim()
      );
      await onRefresh();
      setEditingType(null);
      setEditingName('');
    } catch (error) {
      const errorMessage = (error as Error).message || '更新分类失败';
      showToast(`更新分类失败: ${errorMessage}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (type: GalleryTypeData) => {
    const confirmed = await showConfirm({
      title: '确认删除',
      message: `确定要删除分类 "${type.name}" 吗？\n\n注意：只有空的分类才能删除。`,
      type: 'warning',
    });

    if (!confirmed) {
      return;
    }

    try {
      await galleryApi.deleteType(galleryType, type.id);
      await onRefresh();
      if (value === type.id) {
        onChange(-1);
      }
    } catch (error) {
      const errorMessage = (error as Error).message || '删除分类失败';
      showToast(`删除分类失败: ${errorMessage}`, 'error');
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 触发按钮 */}
      <button
        data-tour={`category-select-btn-level-${level}`} // 添加 data-tour 属性
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-4 py-3 rounded-lg text-left transition-all flex items-center justify-between ${
          disabled
            ? 'bg-[var(--bg-tertiary)] border border-[var(--border-default)] text-[var(--text-muted)] cursor-not-allowed'
            : isOpen
              ? 'bg-[var(--bg-secondary)] border border-[var(--border-strong)] ring-2 ring-[var(--primary-500)]'
              : 'bg-[var(--bg-secondary)] border border-[var(--border-default)] hover:border-[var(--border-strong)]'
        }`}
      >
        <span className={selectedType ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
          {selectedType ? selectedType.name : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* 下拉面板 */}
      {isOpen && (
        <div className="absolute z-10 w-full mt-2 bg-[var(--bg-elevated)] rounded-lg shadow-lg border border-[var(--border-default)] overflow-hidden">
          {/* 搜索栏 */}
          <div className="p-3 border-b border-[var(--border-subtle)]">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索分类"
                className="w-full pl-10 pr-4 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)] focus:border-transparent"
              />
            </div>
          </div>

          {/* 提示文本 */}
          <div className="px-4 py-2 text-xs text-[var(--text-tertiary)]">
            选择分类或创建新分类
          </div>

          {/* 选项列表 */}
          <div className="max-h-48 overflow-y-auto">
            {isCreating ? (
              <div className="p-3 bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)]">
                <input
                  data-tour="category-name-input"
                  ref={createInputRef}
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onKeyPress={(e) =>
                    e.key === 'Enter' && !isSubmitting && handleSaveCreate()
                  }
                  placeholder="输入分类名称"
                  className="w-full px-3 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
                  disabled={isSubmitting}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    data-tour="category-save-btn"
                    onClick={handleSaveCreate}
                    disabled={isSubmitting || !newTypeName.trim()}
                    className="px-3 py-1.5 text-xs bg-[var(--primary-600)] text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? '保存中...' : '保存'}
                  </button>
                  <button
                    onClick={() => setIsCreating(false)}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 text-xs border border-[var(--border-default)] rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <>
                {filteredTypes.length === 0 ? (
                  <div className="p-4 text-center text-[var(--text-muted)] text-sm">
                    {searchQuery ? '未找到匹配的分类' : '暂无分类'}
                  </div>
                ) : (
                  filteredTypes.map((type) => (
                    <div
                      key={type.id}
                      className={`group flex items-center justify-between px-4 py-2.5 hover:bg-[var(--bg-tertiary)] transition-colors ${
                        value === type.id ? 'bg-[var(--bg-tertiary)]' : ''
                      }`}
                    >
                      {editingType?.id === type.id ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyPress={(e) =>
                            e.key === 'Enter' &&
                            !isSubmitting &&
                            handleSaveEdit()
                          }
                          className="flex-1 px-2 py-1 text-sm bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
                          autoFocus
                          disabled={isSubmitting}
                        />
                      ) : (
                        <button
                          onClick={() => {
                            onChange(type.id);
                            setIsOpen(false);
                          }}
                          className={`flex-1 text-left text-sm ${value === type.id ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}`}
                        >
                          {type.name}
                        </button>
                      )}

                      <div className="flex items-center gap-1 ml-2">
                        {editingType?.id === type.id ? (
                          <>
                            <button
                              onClick={handleSaveEdit}
                              disabled={isSubmitting}
                              className="p-1 text-[var(--text-secondary)] hover:text-[var(--primary-500)] hover:bg-[var(--bg-tertiary)] rounded transition-colors disabled:opacity-50"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => {
                                setEditingType(null);
                                setEditingName('');
                              }}
                              disabled={isSubmitting}
                              className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors disabled:opacity-50"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            {value === type.id && (
                              <Check
                                size={14}
                                className="text-[var(--success)] mr-1"
                              />
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(type);
                              }}
                              className="p-1 text-[var(--text-muted)] hover:text-[var(--info)] hover:bg-[var(--bg-tertiary)] rounded transition-colors group-hover:opacity-100 opacity-0"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(type);
                              }}
                              className="p-1 text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--bg-tertiary)] rounded transition-colors group-hover:opacity-100 opacity-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>

          {/* 创建新分类按钮 */}
          {!isCreating && level < MAX_LEVEL && (
            <div className="p-2 border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
              <button
                data-tour="create-category-btn"
                onClick={handleCreate}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-[var(--primary-500)] hover:bg-[var(--bg-tertiary)] rounded transition-colors"
              >
                <Plus size={16} />
                创建新分类
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const AddToGalleryModal: React.FC<AddToGalleryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  nodeId,
  fileName,
}) => {
  const { showToast, showConfirm } = useNotification();
  const [galleryType, setGalleryType] = useState<GalleryType>('drawings');
  const [types, setTypes] = useState<GalleryTypeData[]>([]);
  const [selectedFirstType, setSelectedFirstType] = useState<number>(-1);
  const [selectedSecondType, setSelectedSecondType] = useState<number>(-1);
  const [selectedThirdType, setSelectedThirdType] = useState<number>(-1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 获取分类列表
  const fetchTypes = useCallback(async () => {
    try {
      setLoading(true);
      const response =
        galleryType === 'drawings'
          ? await galleryApi.getDrawingsTypes()
          : await galleryApi.getBlocksTypes();
      setTypes(response.data?.allblocks || []);
    } catch (error) {
      const errorMessage = (error as Error).message || '获取分类列表失败';
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  }, [galleryType, showToast]);

  // 初始化时获取分类列表
  useEffect(() => {
    if (isOpen) {
      fetchTypes();
    }
  }, [isOpen, galleryType, fetchTypes]);

  // 获取一级分类列表
  const firstLevelTypes = types.filter((t) => t.pid === 0);
  const selectedFirstTypeData = firstLevelTypes.find(
    (t) => t.id === selectedFirstType
  );

  // 获取二级分类列表
  const secondLevelTypes = types.filter((t) => t.pid === selectedFirstType);
  const selectedSecondTypeData = secondLevelTypes.find(
    (t) => t.id === selectedSecondType
  );

  // 获取三级分类列表
  const thirdLevelTypes = types.filter((t) => t.pid === selectedSecondType);

  // 处理提交
  const handleSubmit = async () => {
    // 确定最终选择的分类 ID
    const finalTypeId =
      selectedThirdType !== -1
        ? selectedThirdType
        : selectedSecondType !== -1
          ? selectedSecondType
          : selectedFirstType;

    if (finalTypeId === -1) {
      showToast('请选择分类', 'warning');
      return;
    }

    try {
      setSubmitting(true);

      // 调用后端 API 添加文件到图库
      await galleryApi.addToGallery(galleryType, {
        nodeId,
        firstType: selectedFirstType,
        secondType:
          selectedSecondType !== -1 ? selectedSecondType : selectedFirstType,
      });

      showToast('添加成功！', 'success');
      onSuccess();
      onClose();
    } catch (error) {
      const errorMessage = (error as Error).message || '添加失败';
      showToast(`添加失败: ${errorMessage}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // 重置选择
  const resetSelection = () => {
    setSelectedFirstType(-1);
    setSelectedSecondType(-1);
    setSelectedThirdType(-1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[var(--bg-overlay)] flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-elevated)] rounded-xl shadow-lg max-w-md w-full border border-[var(--border-default)]">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-default)]">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">添加到图库</h2>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">{fileName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6">
          {/* 图库类型选择 */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">
              选择图库类型
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setGalleryType('drawings');
                  resetSelection();
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  galleryType === 'drawings'
                    ? 'border-[var(--primary-500)] bg-[var(--bg-tertiary)] text-[var(--primary-500)]'
                    : 'border-[var(--border-default)] hover:border-[var(--border-strong)] text-[var(--text-secondary)]'
                }`}
              >
                <FileText size={16} />
                图纸库
              </button>
              <button
                onClick={() => {
                  setGalleryType('blocks');
                  resetSelection();
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  galleryType === 'blocks'
                    ? 'border-[var(--primary-500)] bg-[var(--bg-tertiary)] text-[var(--primary-500)]'
                    : 'border-[var(--border-default)] hover:border-[var(--border-strong)] text-[var(--text-secondary)]'
                }`}
              >
                <Box size={16} />
                图块库
              </button>
            </div>
          </div>

          {/* 分类选择 */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">
              选择分类
            </label>
            <div className="space-y-3">
              {/* 一级分类 */}
              <CategorySelect
                types={types}
                level={0}
                parentId={0}
                value={selectedFirstType}
                onChange={(val) => {
                  setSelectedFirstType(val);
                  setSelectedSecondType(-1);
                  setSelectedThirdType(-1);
                }}
                placeholder="请选择一级分类"
                disabled={loading}
                galleryType={galleryType}
                onRefresh={fetchTypes}
                showToast={showToast}
                showConfirm={showConfirm}
              />

              {/* 二级分类 */}
              <CategorySelect
                types={types}
                level={1}
                parentId={selectedFirstType}
                value={selectedSecondType}
                onChange={(val) => {
                  setSelectedSecondType(val);
                  setSelectedThirdType(-1);
                }}
                placeholder="请选择二级分类"
                disabled={!selectedFirstTypeData || loading}
                galleryType={galleryType}
                onRefresh={fetchTypes}
                showToast={showToast}
                showConfirm={showConfirm}
              />

              {/* 三级分类 */}
              <CategorySelect
                types={types}
                level={2}
                parentId={selectedSecondType}
                value={selectedThirdType}
                onChange={(val) => setSelectedThirdType(val)}
                placeholder="请选择三级分类（可选）"
                disabled={!selectedSecondTypeData || loading}
                galleryType={galleryType}
                onRefresh={fetchTypes}
                showToast={showToast}
                showConfirm={showConfirm}
              />
            </div>
          </div>

          {/* 提示信息 */}
          <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-4">
            <p className="text-sm text-[var(--text-tertiary)]">
              💡
              提示：点击分类名称选择，点击铅笔图标编辑，点击垃圾桶图标删除，点击「创建新分类」添加新分类。
            </p>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-3 p-6 border-t border-[var(--border-default)]">
          <button
            data-tour="modal-close-btn"
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-[var(--border-default)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedFirstType === -1 || submitting}
            data-tour="gallery-submit-btn"
            className="flex-1 px-4 py-3 bg-[var(--primary-600)] text-white rounded-lg hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                添加中...
              </>
            ) : (
              <>
                <Check size={16} />
                添加到图库
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
