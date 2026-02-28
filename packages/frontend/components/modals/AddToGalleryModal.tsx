import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  FileText,
  Box,
  Check,
  Search,
  Edit2,
  Trash2,
  Plus,
  ChevronDown,
} from 'lucide-react';
import { galleryApi } from '../../services/api';

type GalleryType = 'drawings' | 'blocks';

// 扩展 window 类型
declare global {
  interface Window {
    currentGalleryType?: GalleryType;
    fetchTypes?: () => Promise<void>;
  }
}

// 最大层级（支持三级分类）
const MAX_LEVEL = 3;

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
  onEdit: (type: GalleryTypeData) => void;
  onDelete: (type: GalleryTypeData) => void;
  onCreate: (parentId: number) => void;
  disabled: boolean;
}

const CategorySelect: React.FC<CategorySelectProps> = ({
  types,
  level,
  parentId,
  value,
  onChange,
  placeholder,
  onEdit,
  onDelete,
  onCreate,
  disabled,
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
      alert('分类名称不能为空');
      return;
    }

    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const galleryType = window.currentGalleryType as GalleryType;
      const response = await galleryApi.createType(
        galleryType,
        newTypeName.trim(),
        parentId
      );

      if (response.data?.code === 'success') {
        await window.fetchTypes?.();
        setIsCreating(false);
        setNewTypeName('');
        setSearchQuery('');
      } else {
        alert(response.data?.message || '创建分类失败');
      }
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;
      const errorMessage =
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message || '创建分类失败';

      if (status === 400) alert(errorMessage);
      else if (status === 401) alert('登录已过期，请重新登录');
      else if (status === 500) alert('服务器内部错误，请稍后重试');
      else alert(`创建分类失败: ${errorMessage}`);
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
      alert('分类名称不能为空');
      return;
    }

    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const galleryType = window.currentGalleryType as GalleryType;
      const response = await galleryApi.updateType(
        galleryType,
        editingType.id,
        editingName.trim()
      );

      if (response.data?.code === 'success') {
        await window.fetchTypes?.();
        setEditingType(null);
        setEditingName('');
      } else {
        alert(response.data?.message || '更新分类失败');
      }
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;
      const errorMessage =
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message || '更新分类失败';

      if (status === 400) alert(errorMessage);
      else if (status === 401) alert('登录已过期，请重新登录');
      else if (status === 500) alert('服务器内部错误，请稍后重试');
      else alert(`更新分类失败: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (type: GalleryTypeData) => {
    if (
      !confirm(
        `确定要删除分类 "${type.name}" 吗？\n\n注意：只有空的分类才能删除。`
      )
    ) {
      return;
    }

    try {
      const galleryType = window.currentGalleryType as GalleryType;
      const response = await galleryApi.deleteType(galleryType, type.id);

      if (response.data?.code === 'success') {
        await window.fetchTypes?.();
        if (value === type.id) {
          onChange(-1);
        }
      } else {
        alert(response.data?.message || '删除分类失败');
      }
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;
      const errorMessage =
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message || '删除分类失败';

      if (status === 400) alert(errorMessage);
      else if (status === 401) alert('登录已过期，请重新登录');
      else if (status === 500) alert('服务器内部错误，请稍后重试');
      else alert(`删除分类失败: ${errorMessage}`);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 触发按钮 */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-4 py-3 rounded-lg text-left transition-all flex items-center justify-between ${
          disabled
            ? 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
            : isOpen
              ? 'bg-gray-50 border border-gray-300 ring-2 ring-indigo-500'
              : 'bg-gray-50 border border-gray-200 hover:border-gray-300'
        }`}
      >
        <span className={selectedType ? 'text-gray-900' : 'text-gray-400'}>
          {selectedType ? selectedType.name : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* 下拉面板 */}
      {isOpen && (
        <div className="absolute z-10 w-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
          {/* 搜索栏 */}
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索分类"
                className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* 提示文本 */}
          <div className="px-4 py-2 text-xs text-gray-500">
            选择分类或创建新分类
          </div>

          {/* 选项列表 */}
          <div className="max-h-48 overflow-y-auto">
            {isCreating ? (
              <div className="p-3 bg-indigo-50 border-b border-indigo-100">
                <input
                  ref={createInputRef}
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onKeyPress={(e) =>
                    e.key === 'Enter' && !isSubmitting && handleSaveCreate()
                  }
                  placeholder="输入分类名称"
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={isSubmitting}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleSaveCreate}
                    disabled={isSubmitting || !newTypeName.trim()}
                    className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? '保存中...' : '保存'}
                  </button>
                  <button
                    onClick={() => setIsCreating(false)}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <>
                {filteredTypes.length === 0 ? (
                  <div className="p-4 text-center text-gray-400 text-sm">
                    {searchQuery ? '未找到匹配的分类' : '暂无分类'}
                  </div>
                ) : (
                  filteredTypes.map((type) => (
                    <div
                      key={type.id}
                      className={`group flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors ${
                        value === type.id ? 'bg-blue-50' : ''
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
                          className="flex-1 px-2 py-1 text-sm bg-white border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          autoFocus
                          disabled={isSubmitting}
                        />
                      ) : (
                        <button
                          onClick={() => {
                            onChange(type.id);
                            setIsOpen(false);
                          }}
                          className={`flex-1 text-left text-sm ${value === type.id ? 'text-gray-900 font-medium' : 'text-gray-700'}`}
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
                              className="p-1 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors disabled:opacity-50"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => {
                                setEditingType(null);
                                setEditingName('');
                              }}
                              disabled={isSubmitting}
                              className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            {value === type.id && (
                              <Check
                                size={14}
                                className="text-green-600 mr-1"
                              />
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(type);
                              }}
                              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors group-hover:opacity-100 opacity-0"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(type);
                              }}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors group-hover:opacity-100 opacity-0"
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
            <div className="p-2 border-t border-gray-100 bg-gray-50">
              <button
                onClick={handleCreate}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
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
  const [galleryType, setGalleryType] = useState<GalleryType>('drawings');
  const [types, setTypes] = useState<GalleryTypeData[]>([]);
  const [selectedFirstType, setSelectedFirstType] = useState<number>(-1);
  const [selectedSecondType, setSelectedSecondType] = useState<number>(-1);
  const [selectedThirdType, setSelectedThirdType] = useState<number>(-1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 获取分类列表
  const fetchTypes = async () => {
    try {
      setLoading(true);
      const response =
        galleryType === 'drawings'
          ? await galleryApi.getDrawingsTypes()
          : await galleryApi.getBlocksTypes();
      if (response.data?.code === 'success') {
        setTypes(response.data.result?.allblocks || []);
      }
    } catch (error) {
      // 错误已通过 alert 显示
    } finally {
      setLoading(false);
    }
  };

  // 保存当前 galleryType 到 window，供子组件使用
  useEffect(() => {
    window.currentGalleryType = galleryType;
  }, [galleryType]);

  // 保存 fetchTypes 到 window，供子组件使用
  useEffect(() => {
    window.fetchTypes = fetchTypes;
  }, [fetchTypes, galleryType]);

  // 初始化时获取分类列表
  useEffect(() => {
    if (isOpen) {
      fetchTypes();
    }
  }, [isOpen, galleryType]);

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
      alert('请选择分类');
      return;
    }

    try {
      setSubmitting(true);

      // 调用后端 API 添加文件到图库
      const response = await galleryApi.addToGallery(galleryType, {
        nodeId,
        firstType: selectedFirstType,
        secondType:
          selectedSecondType !== -1 ? selectedSecondType : selectedFirstType,
      });

      if (
        (response.status === 200 || response.status === 201) &&
        response.data?.code === 'success'
      ) {
        alert('添加成功！');
        onSuccess();
        onClose();
      } else if (response.status === 400) {
        const errorMessage = response.data?.message || '添加失败';
        alert(errorMessage);
      } else {
        const errorMessage = response.data?.message || '添加失败，请稍后重试';
        alert(errorMessage);
      }
    } catch (error) {
      if (
        (
          error as Error & {
            response?: { status?: number; data?: { message?: string } };
          }
        ).response
      ) {
        const status = (
          error as Error & {
            response?: { status?: number; data?: { message?: string } };
          }
        ).response.status;
        const errorMessage =
          (error as Error & { response?: { data?: { message?: string } } })
            .response.data?.message || '添加失败';

        if (status === 400) alert(errorMessage);
        else if (status === 401) alert('登录已过期，请重新登录');
        else if (status === 500) alert('服务器内部错误，请稍后重试');
        else alert(`添加失败: ${errorMessage}`);
      } else if (error.request) {
        alert('网络错误，请检查网络连接');
      } else {
        alert('添加失败，请稍后重试');
      }
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">添加到图库</h2>
            <p className="text-sm text-gray-500 mt-1">{fileName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6">
          {/* 图库类型选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
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
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 hover:border-gray-300'
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
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Box size={16} />
                图块库
              </button>
            </div>
          </div>

          {/* 分类选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
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
                onEdit={(type) => {}}
                onDelete={(type) => {}}
                onCreate={(parentId) => {}}
                disabled={loading}
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
                onEdit={(type) => {}}
                onDelete={(type) => {}}
                onCreate={(parentId) => {}}
                disabled={!selectedFirstTypeData || loading}
              />

              {/* 三级分类 */}
              <CategorySelect
                types={types}
                level={2}
                parentId={selectedSecondType}
                value={selectedThirdType}
                onChange={(val) => setSelectedThirdType(val)}
                placeholder="请选择三级分类（可选）"
                onEdit={(type) => {}}
                onDelete={(type) => {}}
                onCreate={(parentId) => {}}
                disabled={!selectedSecondTypeData || loading}
              />
            </div>
          </div>

          {/* 提示信息 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-700">
              💡
              提示：点击分类名称选择，点击铅笔图标编辑，点击垃圾桶图标删除，点击「创建新分类」添加新分类。
            </p>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedFirstType === -1 || submitting}
            className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
