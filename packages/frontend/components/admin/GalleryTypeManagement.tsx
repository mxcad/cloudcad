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
import React, { useEffect, useState } from 'react';
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
  children?: React.ReactNode;
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
  isSubmitting,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const isEditing = editingType?.id === type.id;
  const childrenArray = React.Children.toArray(children);
  const hasChildren = childrenArray.length > 0;

  // 双击编辑
  const handleDoubleClick = () => {
    if (!isEditing) {
      onEdit(type);
    }
  };

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition-all group ${
          isEditing
            ? 'bg-indigo-50 border border-indigo-200'
            : 'hover:bg-gray-50 border border-transparent'
        }`}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        onDoubleClick={handleDoubleClick}
      >
        {/* 展开/收起图标 */}
        {hasChildren ? (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-200 rounded-md transition-colors flex-shrink-0"
            title={isExpanded ? '收起' : '展开'}
          >
            {isExpanded ? (
              <ChevronDown size={14} className="text-gray-500" />
            ) : (
              <ChevronRight size={14} className="text-gray-500" />
            )}
          </button>
        ) : (
          <div className="w-6 flex-shrink-0" />
        )}

        {/* 分类图标 */}
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            hasChildren ? 'bg-indigo-100' : 'bg-gray-100'
          }`}
        >
          {hasChildren ? (
            isExpanded ? (
              <FolderOpen size={16} className="text-indigo-600" />
            ) : (
              <Folder size={16} className="text-indigo-600" />
            )
          ) : (
            <div className="w-3 h-3 border-2 border-indigo-300 rounded-sm" />
          )}
        </div>

        {/* 分类名称 */}
        {isEditing ? (
          <input
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyPress={(e) =>
              e.key === 'Enter' && !isSubmitting && onSaveEdit()
            }
            className="flex-1 px-3 py-1.5 text-sm border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            autoFocus
            disabled={isSubmitting}
          />
        ) : (
          <span className="flex-1 text-sm font-medium text-gray-900 cursor-pointer hover:text-indigo-600 transition-colors select-none">
            {type.name}
          </span>
        )}

        {/* 操作按钮 - 始终可见 */}
        {isEditing ? (
          <div className="flex gap-1 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={onSaveEdit}
              className="p-1.5 h-auto hover:bg-green-50"
              title="保存"
              disabled={isSubmitting}
            >
              <Save
                size={14}
                className={isSubmitting ? 'text-gray-400' : 'text-green-600'}
              />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancelEdit}
              className="p-1.5 h-auto hover:bg-gray-100"
              title="取消"
              disabled={isSubmitting}
            >
              <X
                size={14}
                className={isSubmitting ? 'text-gray-400' : 'text-gray-600'}
              />
            </Button>
          </div>
        ) : (
          <div className="flex gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {level < maxLevel - 1 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onAddChild(type.id)}
                className="p-1.5 h-auto hover:bg-indigo-50"
                title="添加子分类"
              >
                <Plus size={14} className="text-indigo-600" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEdit(type)}
              className="p-1.5 h-auto hover:bg-blue-50"
              title="编辑"
            >
              <Edit size={14} className="text-blue-600" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(type)}
              className="p-1.5 h-auto hover:bg-red-50"
              title="删除"
            >
              <Trash2 size={14} className="text-red-600" />
            </Button>
          </div>
        )}
      </div>

      {/* 子分类 */}
      {isExpanded && hasChildren && (
        <div className="ml-2 border-l border-gray-200 pl-2 mt-1 space-y-1">
          {childrenArray.map((child) => (
            <React.Fragment key={React.isValidElement(child) ? (child.props as any)?.type?.id || child.key : Math.random()}>
              {child}
            </React.Fragment>
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
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // 构建分类树数据
  const buildTypeTreeData = () => {
    const firstLevelTypes = types.filter((t) => t.pid === 0);

    const buildChildren = (parentId: number) => {
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

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

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
        const errorMessage = response.data?.message || '更新分类失败';
        alert(errorMessage);
      }
    } catch (error) {
      console.error('更新分类失败:', error);

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
            .response.data?.message || '更新分类失败';

        if (status === 400) {
          alert(errorMessage);
        } else if (status === 401) {
          alert('登录已过期，请重新登录');
        } else if (status === 500) {
          alert('服务器内部错误，请稍后重试');
        } else {
          alert(`更新分类失败: ${errorMessage}`);
        }
      } else if (error.request) {
        alert('网络错误，请检查网络连接');
      } else {
        alert('更新分类失败，请稍后重试');
      }
    } finally {
      setIsSubmitting(false);
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
        const errorMessage = response.data?.message || '删除分类失败';
        alert(errorMessage);
      }
    } catch (error) {
      console.error('删除分类失败:', error);

      if ((error as Error & { response?: { status?: number } }).response) {
        const status = error.response.status;
        const errorMessage = error.response.data?.message || '删除分类失败';

        if (status === 400) {
          alert(errorMessage);
        } else if (status === 401) {
          alert('登录已过期，请重新登录');
        } else if (status === 500) {
          alert('服务器内部错误，请稍后重试');
        } else {
          alert(`删除分类失败: ${errorMessage}`);
        }
      } else if (error.request) {
        alert('网络错误，请检查网络连接');
      } else {
        alert('删除分类失败，请稍后重试');
      }
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

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

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
        const errorMessage = response.data?.message || '创建分类失败';
        alert(errorMessage);
      }
    } catch (error) {
      console.error('创建分类失败:', error);

      if (error.response) {
        const status = error.response.status;
        const errorMessage = error.response.data?.message || '创建分类失败';

        if (status === 400) {
          alert(errorMessage);
        } else if (status === 401) {
          alert('登录已过期，请重新登录');
        } else if (status === 500) {
          alert('服务器内部错误，请稍后重试');
        } else {
          alert(`创建分类失败: ${errorMessage}`);
        }
      } else if (error.request) {
        alert('网络错误，请检查网络连接');
      } else {
        alert('创建分类失败，请稍后重试');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 取消添加
  const handleCancelAdd = () => {
    setIsAddingType(false);
    setNewTypeName('');
  };

  // 递归渲染分类树节点
  const renderTypeTreeNode = (
    node: { type: GalleryTypeData; children: any[] },
    level: number
  ): React.ReactNode => {
    return (
      <div key={node.type.id} className="group">
        <TypeTreeNode
          type={node.type}
          level={level}
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
        >
          {node.children.map((child) =>
            renderTypeTreeNode(child, level + 1)
          )}
        </TypeTreeNode>
      </div>
    );
  };

  const typeTree = buildTypeTreeData();

  return (
    <div className="p-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {galleryType === 'drawings' ? '图纸库' : '图块库'}分类管理
          </h2>
          <p className="text-sm text-gray-500 mt-1">管理和组织您的分类结构</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="关闭"
        >
          <X size={20} className="text-gray-400 hover:text-gray-600" />
        </button>
      </div>

      {/* 操作栏 */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 mb-4 border border-indigo-100">
        <div className="flex items-center justify-between">
          <Button
            onClick={handleAddFirstLevel}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-sm"
          >
            <Plus size={16} />
            添加一级分类
          </Button>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600">
              共{' '}
              <span className="font-semibold text-indigo-600">
                {types.length}
              </span>{' '}
              个分类
            </span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-500">支持最多三级分类</span>
          </div>
        </div>
      </div>

      {/* 添加分类表单 */}
      {isAddingType && (
        <div className="bg-white border-2 border-indigo-200 rounded-xl p-4 mb-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Folder size={20} className="text-indigo-600" />
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                onKeyPress={(e) =>
                  e.key === 'Enter' && !isSubmitting && handleSaveNewType()
                }
                placeholder="输入分类名称"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                autoFocus
                disabled={isSubmitting}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSaveNewType}
                size="sm"
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-700 shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    保存中...
                  </>
                ) : (
                  '保存'
                )}
              </Button>
              <Button
                onClick={handleCancelAdd}
                variant="ghost"
                size="sm"
                disabled={isSubmitting}
              >
                取消
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 分类树 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm min-h-[300px]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : typeTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Folder size={32} className="opacity-50" />
            </div>
            <p className="text-base font-medium mb-2">暂无分类</p>
            <p className="text-sm">点击上方按钮添加一级分类</p>
          </div>
        ) : (
          <div className="p-2">
            {typeTree.map((node) => renderTypeTreeNode(node, 0))}
          </div>
        )}
      </div>

      {/* 提示信息 */}
      <div className="mt-4 bg-gray-50 rounded-xl p-4 border border-gray-200">
        <div className="flex items-start gap-2">
          <div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-indigo-600 text-xs font-bold">!</span>
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-700 mb-2 text-sm">操作提示</p>
            <ul className="space-y-1.5 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-indigo-500 mt-0.5">•</span>
                <span>点击分类名称右侧的按钮进行编辑或删除</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-500 mt-0.5">•</span>
                <span>双击分类名称可以快速编辑</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-500 mt-0.5">•</span>
                <span>点击展开/收起图标查看子分类</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-500 mt-0.5">•</span>
                <span>只有空的分类才能删除</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
