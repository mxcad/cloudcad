import { useState, useEffect } from 'react';
import { tagsApi, authApi } from '../services/api';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Tag as TagIcon,
  X,
  Check,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { DescriptionText } from '../components/ui/TruncateText';

interface Tag {
  id: string;
  name: string;
  color?: string;
  description?: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  nodeTags?: Array<{ nodeId: string; tagName: string }>;
}

interface FormData {
  name: string;
  color: string;
  description: string;
}

const PREDEFINED_COLORS = [
  '#6366f1', // 靛蓝
  '#8b5cf6', // 紫色
  '#ec4899', // 粉色
  '#f59e0b', // 橙色
  '#10b981', // 绿色
  '#ef4444', // 红色
  '#06b6d4', // 青色
  '#3b82f6', // 蓝色
];

export default function TagManagement() {
  const [hasPermission, setHasPermission] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    color: PREDEFINED_COLORS[0],
    description: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkAccess();
  }, []);

  useEffect(() => {
    if (hasPermission) {
      fetchTags();
    }
  }, [hasPermission]);

  useEffect(() => {
    if (hasPermission) {
      handleSearch();
    }
  }, [searchKeyword, hasPermission]);

  const checkAccess = async () => {
    try {
      const response = await authApi.getProfile();
      const currentUser = response.data;
      // 兼容两种 role 格式: 字符串 'ADMIN' 或对象 { name: 'ADMIN' }
      const isAdmin =
        currentUser.role === 'ADMIN' || currentUser.role?.name === 'ADMIN';
      setHasPermission(isAdmin);
    } catch (error) {
      setHasPermission(false);
    }
  };

  const fetchTags = async () => {
    setLoading(true);
    try {
      const response = await tagsApi.list();
      const tagsData = response.data || [];
      setTags(Array.isArray(tagsData) ? tagsData : []);
    } catch (error) {
      console.error('获取标签列表失败:', error);
      setTags([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      if (!searchKeyword.trim()) {
        // 如果搜索关键词为空，获取所有标签
        await fetchTags();
      } else {
        // 使用后端搜索接口
        const response = await tagsApi.search(searchKeyword);
        const tagsData = response.data || [];
        setTags(Array.isArray(tagsData) ? tagsData : []);
      }
    } catch (error) {
      console.error('搜索标签失败:', error);
      setTags([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingTag(null);
    setFormData({
      name: '',
      color: PREDEFINED_COLORS[0],
      description: '',
    });
    setIsModalOpen(true);
  };

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag);
    setFormData({
      name: tag.name,
      color: tag.color || PREDEFINED_COLORS[0],
      description: tag.description || '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (tag: Tag) => {
    if (tag.isSystem) {
      alert('系统标签不能删除');
      return;
    }

    if (!confirm(`确定要删除标签 "${tag.name}" 吗？`)) {
      return;
    }

    try {
      await tagsApi.delete(tag.id);
      await fetchTags();
    } catch (error) {
      console.error('删除标签失败:', error);
      alert('删除标签失败');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingTag) {
        await tagsApi.update(editingTag.id, formData);
      } else {
        await tagsApi.create(formData);
      }
      await fetchTags();
      setIsModalOpen(false);
      setEditingTag(null);
      setFormData({
        name: '',
        color: PREDEFINED_COLORS[0],
        description: '',
      });
    } catch (error) {
      console.error('保存标签失败:', error);
      alert(error instanceof Error ? error.message : '保存标签失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* 权限不足状态 */}
      {!hasPermission && (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <TagIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              权限不足
            </h2>
            <p className="text-gray-500">只有管理员可以管理标签</p>
          </div>
        </div>
      )}

      {/* 正常内容 */}
      {hasPermission && (
        <>
          <div className="max-w-5xl mx-auto">
            {/* 页面标题 */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                <TagIcon className="w-8 h-8 text-indigo-600" />
                标签管理
              </h1>
              <p className="text-gray-600">管理系统标签,用于文件分类和标记</p>
            </div>

            {/* 操作栏 */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                {/* 搜索框 */}
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="搜索标签..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* 创建按钮 */}
                <button
                  onClick={handleCreate}
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium flex items-center gap-2 whitespace-nowrap"
                >
                  <Plus size={16} />
                  创建标签
                </button>
              </div>
            </div>

            {/* 标签列表 */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : tags.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <TagIcon className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-lg">
                    {searchKeyword ? '未找到匹配的标签' : '暂无标签'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {tags.map((tag) => (
                    <div
                      key={tag.id}
                      className="flex items-center justify-between p-4 hover:bg-gray-50 transition-all"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        {/* 标签颜色 */}
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                          style={{
                            backgroundColor: tag.color || PREDEFINED_COLORS[0],
                          }}
                        >
                          {tag.name.charAt(0).toUpperCase()}
                        </div>

                        {/* 标签信息 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-base font-semibold text-gray-900">
                              {tag.name}
                            </h3>
                            {tag.isSystem && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                                系统
                              </span>
                            )}
                          </div>
                          {tag.description && (
                            <p className="text-sm text-gray-500">
                              <DescriptionText>
                                {tag.description}
                              </DescriptionText>
                            </p>
                          )}
                        </div>

                        {/* 统计信息 */}
                        <div className="flex items-center gap-4 text-sm text-gray-500 flex-shrink-0">
                          <span>关联文件: {tag.nodeTags?.length || 0}</span>
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                        <button
                          onClick={() => handleEdit(tag)}
                          className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title="编辑"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(tag)}
                          className={`p-2 rounded-lg transition-all ${
                            tag.isSystem
                              ? 'text-gray-300 cursor-not-allowed'
                              : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                          }`}
                          title={tag.isSystem ? '系统标签不可删除' : '删除'}
                          disabled={tag.isSystem}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 统计信息 */}
            <div className="mt-6 text-center text-gray-500 text-sm">
              共 {tags.length} 个标签
            </div>
          </div>

          {/* 创建/编辑模态框 */}
          <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                  <TagIcon className="w-5 h-5 text-indigo-600" />
                  {editingTag ? '编辑标签' : '创建标签'}
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    标签名称
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="输入标签名称"
                    required
                    disabled={editingTag?.isSystem}
                  />
                  {editingTag?.isSystem && (
                    <p className="text-xs text-purple-600 mt-1">
                      系统标签名称不可修改
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    标签颜色
                  </label>
                  <div className="flex gap-2 flex-wrap mb-3">
                    {PREDEFINED_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        className={`w-8 h-8 rounded-lg border-2 transition-all ${
                          formData.color === color
                            ? 'border-indigo-600 scale-110 shadow-md'
                            : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) =>
                      setFormData({ ...formData, color: e.target.value })
                    }
                    className="w-full h-10 rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    描述
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                    placeholder="输入标签描述（可选）"
                    rows={3}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    disabled={saving}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all disabled:opacity-50 font-medium"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !formData.name.trim()}
                    className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        保存中...
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        {editingTag ? '更新' : '创建'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
