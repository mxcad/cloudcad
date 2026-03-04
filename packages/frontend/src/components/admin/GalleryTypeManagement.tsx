import React, { useCallback, useEffect, useState, useRef } from 'react';
import { galleryApi } from '../../services/galleryApi';
import { Button } from '../ui/Button';
import { useNotification } from '../../contexts/NotificationContext';

// 图库类型
type GalleryType = 'drawings' | 'blocks';

// Gallery API 响应类型（apiClient 已解包，response.data 就是实际数据）
interface GalleryTypesResponse {
  allblocks: GalleryTypeData[];
}

interface GalleryOperationResponse {
  message?: string;
}

// 最大层级（支持三级分类）
const MAX_LEVEL = 3;

// 分类数据接口
interface GalleryTypeData {
  id: number;
  pid: number;
  name: string;
  pname: string;
  status: number;
}

// 组件 Props
interface GalleryTypeManagementProps {
  galleryType: GalleryType;
  onClose: () => void;
}

// 分类列表项组件
interface TypeListItemProps {
  type: GalleryTypeData;
  allTypes: GalleryTypeData[];
  level: number;
  onEdit: (type: GalleryTypeData) => void;
  onDelete: (type: GalleryTypeData) => void;
  onAddChild: (parentId: number) => void;
  editingType: GalleryTypeData | null;
  editingName: string;
  setEditingType: (type: GalleryTypeData | null) => void;
  setEditingName: (name: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  maxLevel: number;
  isSubmitting: boolean;
}

const TypeListItem: React.FC<TypeListItemProps> = ({
  type,
  allTypes,
  level,
  onEdit,
  onDelete,
  onAddChild,
  editingType,
  editingName,
  setEditingType,
  setEditingName,
  onSaveEdit,
  onCancelEdit,
  maxLevel,
  isSubmitting,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const editInputRef = useRef<HTMLInputElement>(null);

  const isEditing = editingType?.id === type.id;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSubmitting) {
      onSaveEdit();
    } else if (e.key === 'Escape') {
      onCancelEdit();
    }
  };

  React.useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  const getChildren = () => {
    return allTypes.filter((child) => child.pid === type.id);
  };

  const children = getChildren();

  const getLevelColor = () => {
    switch (level) {
      case 0:
        return 'text-gray-900 font-medium';
      case 1:
        return 'text-gray-800';
      case 2:
        return 'text-gray-700';
      default:
        return 'text-gray-600';
    }
  };

  const getLevelBg = () => {
    if (isEditing) return 'bg-indigo-50 ring-1 ring-indigo-300';
    if (isHovered) return 'bg-gray-100';
    if (level === 0) return 'bg-white';
    if (level === 1) return 'bg-gray-50/50';
    return 'bg-gray-50/30';
  };

  return (
    <div className="select-none">
      <div
        className={`flex items-center justify-between py-2 px-3 transition-colors border-b border-gray-100 ${getLevelBg()}`}
        style={{ paddingLeft: `${level * 18 + 6}px` }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {children.length > 0 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-400 text-xs hover:text-gray-600 transition-colors flex-shrink-0 w-4 h-4 flex items-center justify-center"
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}

          {isEditing ? (
            <input
              ref={editInputRef}
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 px-2 py-1 text-sm bg-white border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isSubmitting}
              placeholder="输入分类名称"
            />
          ) : (
            <span
              className={`truncate cursor-pointer ${getLevelColor()}`}
              onClick={() => onEdit(type)}
            >
              {type.name}
            </span>
          )}
        </div>

        {isEditing ? (
          <div className="flex gap-2 flex-shrink-0 ml-3">
            <Button
              size="sm"
              onClick={onSaveEdit}
              className="px-3 py-1 text-xs"
              disabled={isSubmitting}
            >
              保存
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancelEdit}
              className="px-2 py-1 text-xs"
              disabled={isSubmitting}
            >
              取消
            </Button>
          </div>
        ) : (
          <div className="flex gap-1 flex-shrink-0 ml-2">
            {level < maxLevel - 1 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onAddChild(type.id)}
                className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
              >
                添加
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEdit(type)}
              className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
            >
              编辑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(type)}
              className="px-2 py-1 text-xs text-red-600 hover:bg-red-100"
            >
              删除
            </Button>
          </div>
        )}
      </div>

      {children.length > 0 && isExpanded && (
        <div>
          {children.map((child) => (
            <TypeListItem
              key={child.id}
              type={child}
              allTypes={allTypes}
              level={level + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
              editingType={editingType}
              editingName={editingName}
              setEditingType={setEditingType}
              setEditingName={setEditingName}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              maxLevel={maxLevel}
              isSubmitting={isSubmitting}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// 分类管理主组件
export default function GalleryTypeManagement({
  galleryType,
  onClose,
}: GalleryTypeManagementProps) {
  const { showToast, showConfirm } = useNotification();
  const [types, setTypes] = useState<GalleryTypeData[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingType, setEditingType] = useState<GalleryTypeData | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isAddingType, setIsAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeParentId, setNewTypeParentId] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchTypes = useCallback(async () => {
    try {
      setLoading(true);
      const response =
        galleryType === 'drawings'
          ? await galleryApi.getDrawingsTypes()
          : await galleryApi.getBlocksTypes();
      // apiClient 已自动解包，response.data 就是实际数据
      const data = response.data as unknown as GalleryTypesResponse;
      setTypes(data?.allblocks || []);
    } catch (error) {
      showToast('获取分类列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [galleryType, showToast]);

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  interface TypeTreeNode {
    type: GalleryTypeData;
    children: TypeTreeNode[];
  }

  const buildTypeTreeData = (): TypeTreeNode[] => {
    const firstLevelTypes = types.filter((t) => t.pid === 0);

    const buildChildren = (parentId: number): TypeTreeNode[] => {
      const children = types.filter((t) => t.pid === parentId);
      return children.map((child) => ({
        type: child,
        children: buildChildren(child.id),
      }));
    };

    return firstLevelTypes.map((type) => ({
      type,
      children: buildChildren(type.id),
    }));
  };

  const handleEdit = (type: GalleryTypeData) => {
    setEditingType(type);
    setEditingName(type.name);
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
      await fetchTypes();
      setEditingType(null);
      setEditingName('');
    } catch (error) {
      const errorMessage = (error as Error).message || '更新分类失败';
      showToast(errorMessage, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingType(null);
    setEditingName('');
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
      await fetchTypes();
    } catch (error) {
      const errorMessage = (error as Error).message || '删除分类失败';
      showToast(errorMessage, 'error');
    }
  };

  const handleAddChild = (parentId: number) => {
    setNewTypeParentId(parentId);
    setNewTypeName('');
    setIsAddingType(true);
  };

  const handleAddFirstLevel = () => {
    setNewTypeParentId(0);
    setNewTypeName('');
    setIsAddingType(true);
  };

  const handleSaveNewType = async () => {
    if (!newTypeName.trim()) {
      showToast('分类名称不能为空', 'warning');
      return;
    }

    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      await galleryApi.createType(
        galleryType,
        newTypeName.trim(),
        newTypeParentId
      );
      await fetchTypes();
      setIsAddingType(false);
      setNewTypeName('');
    } catch (error) {
      const errorMessage = (error as Error).message || '创建分类失败';
      showToast(errorMessage, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelAdd = () => {
    setIsAddingType(false);
    setNewTypeName('');
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isAddingType) {
        handleCancelAdd();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isAddingType]);

  const renderTypeList = () => {
    const typeTree = buildTypeTreeData();

    return typeTree.map((node) => (
      <div key={node.type.id}>
        <TypeListItem
          type={node.type}
          allTypes={types}
          level={0}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAddChild={handleAddChild}
          editingType={editingType}
          editingName={editingName}
          setEditingType={setEditingType}
          setEditingName={setEditingName}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          maxLevel={MAX_LEVEL}
          isSubmitting={isSubmitting}
        />
      </div>
    ));
  };

  const typeTree = buildTypeTreeData();
  const parentType = types.find((t) => t.id === newTypeParentId);

  return (
    <div className="w-full">
      {/* 操作栏 */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <Button onClick={handleAddFirstLevel} className="text-sm">
            添加分类
          </Button>
          <span className="text-sm text-gray-600">
            共 {types.length} 个分类
          </span>
        </div>
      </div>

      {/* 添加分类表单 */}
      {isAddingType && (
        <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100">
          <p className="text-sm font-medium text-gray-900 mb-2">
            {newTypeParentId === 0
              ? '创建一级分类'
              : `添加子分类到 "${parentType?.name}"`}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              onKeyPress={(e) =>
                e.key === 'Enter' && !isSubmitting && handleSaveNewType()
              }
              placeholder="输入分类名称"
              className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
              disabled={isSubmitting}
            />
            <Button
              onClick={handleSaveNewType}
              disabled={isSubmitting || !newTypeName.trim()}
              className="px-4 py-2 text-sm"
            >
              {isSubmitting ? '保存中...' : '保存'}
            </Button>
            <Button
              variant="ghost"
              onClick={handleCancelAdd}
              disabled={isSubmitting}
              className="px-3 py-2 text-sm"
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {/* 分类列表 */}
      <div className="p-6 max-h-[500px] overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <p className="text-sm">加载中...</p>
          </div>
        ) : typeTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <p className="text-sm font-medium mb-2 text-gray-600">暂无分类</p>
            <Button
              onClick={handleAddFirstLevel}
              variant="ghost"
              className="text-sm"
            >
              添加第一个分类
            </Button>
          </div>
        ) : (
          <div>{renderTypeList()}</div>
        )}
      </div>

      {/* 底部提示 */}
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          点击名称编辑 · 点击三角形展开/折叠 · 只有空的分类才能删除
        </p>
      </div>
    </div>
  );
}
