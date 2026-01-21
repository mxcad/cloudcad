import { useState, useEffect } from 'react';
import { tagsApi } from '../../services/api';
import { Plus, Trash2, Edit, Tag as TagIcon, X } from 'lucide-react';

interface Tag {
  id: string;
  name: string;
  color?: string;
  description?: string;
  isSystem: boolean;
}

interface CreateTagModalProps {
  onClose: () => void;
  onSuccess: () => void;
  editingTag?: Tag | null;
}

function CreateTagModal({
  onClose,
  onSuccess,
  editingTag,
}: CreateTagModalProps) {
  const [formData, setFormData] = useState({
    name: editingTag?.name || '',
    color: editingTag?.color || '#06b6d4',
    description: editingTag?.description || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingTag) {
        await tagsApi.update(editingTag.id, formData);
      } else {
        await tagsApi.create(formData);
      }
      onSuccess();
    } catch (error) {
      console.error('保存标签失败:', error);
      alert('保存标签失败');
    } finally {
      setLoading(false);
    }
  };

  const predefinedColors = [
    '#06b6d4',
    '#8b5cf6',
    '#ec4899',
    '#f59e0b',
    '#10b981',
    '#ef4444',
    '#3b82f6',
    '#f97316',
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <TagIcon className="w-5 h-5 text-indigo-600" />
            {editingTag ? '编辑标签' : '创建标签'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              标签名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="输入标签名称"
              required
              maxLength={50}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              标签颜色
            </label>
            <div className="flex gap-2 flex-wrap mb-3">
              {predefinedColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${
                    formData.color === color
                      ? 'border-indigo-600 scale-110'
                      : 'border-transparent'
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              描述
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="输入标签描述（可选）"
              rows={3}
              maxLength={200}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || !formData.name.trim()}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? '保存中...' : editingTag ? '更新' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TagManagement() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);

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

  useEffect(() => {
    fetchTags();
  }, []);

  const handleCreate = () => {
    setEditingTag(null);
    setShowCreateModal(true);
  };

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag);
    setShowCreateModal(true);
  };

  const handleDelete = async (tag: Tag) => {
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

  const handleModalSuccess = () => {
    setShowCreateModal(false);
    setEditingTag(null);
    fetchTags();
  };

  const filteredTags = tags.filter((tag) =>
    tag.name.toLowerCase().includes(searchKeyword.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="搜索标签..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium flex items-center gap-2"
        >
          <Plus size={16} />
          创建标签
        </button>
      </div>

      {/* 标签列表 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">加载中...</div>
        ) : filteredTags.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchKeyword ? '未找到匹配的标签' : '暂无标签'}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredTags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{
                      backgroundColor: tag.color || '#06b6d4',
                    }}
                  >
                    {tag.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{tag.name}</div>
                    {tag.isSystem && (
                      <div className="text-xs text-purple-600">系统标签</div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(tag)}
                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    title="编辑"
                  >
                    <Edit size={16} />
                  </button>
                  {!tag.isSystem && (
                    <button
                      onClick={() => handleDelete(tag)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 统计信息 */}
      <div className="text-sm text-gray-500">
        共 {filteredTags.length} 个标签
      </div>

      {/* 创建/编辑模态框 */}
      {showCreateModal && (
        <CreateTagModal
          onClose={() => {
            setShowCreateModal(false);
            setEditingTag(null);
          }}
          onSuccess={handleModalSuccess}
          editingTag={editingTag}
        />
      )}
    </div>
  );
}
