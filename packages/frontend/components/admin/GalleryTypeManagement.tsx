import {
  ChevronDown,
  ChevronRight,
  Edit,
  Folder,
  FolderOpen,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { galleryApi } from '../../services/api';
import { Button } from '../ui/Button';

// 图库类型
type GalleryType = 'drawings' | 'blocks';

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

// 分类树节点组件
interface TypeTreeNodeProps {
  type: GalleryTypeData;
  children: GalleryTypeData[];
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
  maxLevel: number; // 最大层级（3 表示支持三级分类）
}

const TypeTreeNode: React.FC<TypeTreeNodeProps> = ({
  type,
  children,
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
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const isEditing = editingType?.id === type.id;

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-2 py-2 px-3 hover:bg-gray-50 rounded-lg transition-all"
        style={{ paddingLeft: `${level * 16 + 12}px` }}
      >
        {/* 展开/收起图标 */}
        {children.length > 0 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronDown size={16} className="text-gray-500" />
            ) : (
              <ChevronRight size={16} className="text-gray-500" />
            )}
          </button>
        )}

        {/* 分类图标 */}
        {children.length > 0 ? (
          isExpanded ? (
            <FolderOpen size={18} className="text-indigo-500" />
          ) : (
            <Folder size={18} className="text-indigo-500" />
          )
        ) : (
          <div className="w-[18px] h-[18px] border-2 border-indigo-300 rounded-sm" />
        )}

        {/* 分类名称 */}
        {isEditing ? (
          <input
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && onSaveEdit()}
            className="flex-1 px-2 py-1 border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
        ) : (
          <span className="flex-1 text-sm font-medium text-gray-900">
            {type.name}
          </span>
        )}

        {/* 操作按钮 */}
        {isEditing ? (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={onSaveEdit}
              className="p-1 h-auto"
            >
              <Save size={14} className="text-green-600" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancelEdit}
              className="p-1 h-auto"
            >
              <X size={14} className="text-gray-600" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {level < maxLevel - 1 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onAddChild(type.id)}
                className="p-1 h-auto"
                title="添加子分类"
              >
                <Plus size={14} className="text-indigo-600" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEdit(type)}
              className="p-1 h-auto"
              title="编辑"
            >
              <Edit size={14} className="text-gray-600" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(type)}
              className="p-1 h-auto"
              title="删除"
            >
              <Trash2 size={14} className="text-red-600" />
            </Button>
          </div>
        )}
      </div>

      {/* 子分类 */}
      {isExpanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <TypeTreeNode
              key={child.id}
              type={child}
              children={[]}
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
              maxLevel={MAX_LEVEL}
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
  const [types, setTypes] = useState<GalleryTypeData[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingType, setEditingType] = useState<GalleryTypeData | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isAddingType, setIsAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeParentId, setNewTypeParentId] = useState<number>(0);

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
      console.error('获取分类列表失败:', error);
      alert('获取分类列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 初始化时获取分类列表
  useEffect(() => {
    fetchTypes();
  }, [galleryType]);

  // 构建分类树
  const buildTypeTree = () => {
    const firstLevelTypes = types.filter((t) => t.pid === 0);
    return firstLevelTypes.map((type) => ({
      type,
      children: types.filter((t) => t.pid === type.id),
    }));
  };

  // 处理编辑
  const handleEdit = (type: GalleryTypeData) => {
    setEditingType(type);
    setEditingName(type.name);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingType || !editingName.trim()) {
      alert('分类名称不能为空');
      return;
    }

    try {
      const response = await galleryApi.updateType(
        galleryType,
        editingType.id,
        editingName.trim()
      );

      if (response.data?.code === 'success') {
        await fetchTypes();
        setEditingType(null);
        setEditingName('');
      } else {
        alert('更新分类失败');
      }
    } catch (error) {
      console.error('更新分类失败:', error);
      alert(error instanceof Error ? error.message : '更新分类失败');
    }
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingType(null);
    setEditingName('');
  };

  // 处理删除
  const handleDelete = async (type: GalleryTypeData) => {
    if (!confirm(`确定要删除分类 "${type.name}" 吗？`)) {
      return;
    }

    try {
      const response = await galleryApi.deleteType(galleryType, type.id);

      if (response.data?.code === 'success') {
        await fetchTypes();
      } else {
        alert('删除分类失败');
      }
    } catch (error) {
      console.error('删除分类失败:', error);
      alert(error instanceof Error ? error.message : '删除分类失败');
    }
  };

  // 处理添加子分类
  const handleAddChild = (parentId: number) => {
    setNewTypeParentId(parentId);
    setNewTypeName('');
    setIsAddingType(true);
  };

  // 处理添加一级分类
  const handleAddFirstLevel = () => {
    setNewTypeParentId(0);
    setNewTypeName('');
    setIsAddingType(true);
  };

  // 保存新分类
  const handleSaveNewType = async () => {
    if (!newTypeName.trim()) {
      alert('分类名称不能为空');
      return;
    }

    try {
      const response = await galleryApi.createType(
        galleryType,
        newTypeName.trim(),
        newTypeParentId
      );

      if (response.data?.code === 'success') {
        await fetchTypes();
        setIsAddingType(false);
        setNewTypeName('');
      } else {
        alert('创建分类失败');
      }
    } catch (error) {
      console.error('创建分类失败:', error);
      alert(error instanceof Error ? error.message : '创建分类失败');
    }
  };

  // 取消添加
  const handleCancelAdd = () => {
    setIsAddingType(false);
    setNewTypeName('');
  };

  const typeTree = buildTypeTree();

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          {galleryType === 'drawings' ? '图纸库' : '图块库'}分类管理
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* 操作栏 */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <Button onClick={handleAddFirstLevel} className="flex items-center gap-2">
          <Plus size={16} />
          添加一级分类
        </Button>
      </div>

      {/* 添加分类表单 */}
      {isAddingType && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-3">
            <Folder size={18} className="text-indigo-600" />
            <input
              type="text"
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSaveNewType()}
              placeholder="输入分类名称"
              className="flex-1 px-3 py-2 border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <Button onClick={handleSaveNewType} size="sm">
              保存
            </Button>
            <Button onClick={handleCancelAdd} variant="ghost" size="sm">
              取消
            </Button>
          </div>
        </div>
      )}

      {/* 分类树 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : typeTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Folder size={48} className="mb-3 opacity-50" />
            <p className="text-sm">暂无分类，请添加分类</p>
          </div>
        ) : (
          <div className="py-2">
            {typeTree.map(({ type, children }) => (
              <div key={type.id} className="group">
                <TypeTreeNode
                  type={type}
                  children={children}
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
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 提示信息 */}
      <div className="mt-4 text-sm text-gray-500">
        <p>• 支持三级分类</p>
        <p>• 只有空的分类才能删除</p>
        <p>• 双击分类名称可以快速编辑</p>
      </div>
    </div>
  );
}