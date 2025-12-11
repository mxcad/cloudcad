import {
  ArrowLeft,
  Box,
  Calendar,
  Download,
  Folder,
  Image as ImageIcon,
  Loader2,
  Lock,
  MoreHorizontal,
  Plus,
  Type,
  Upload,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import {
  type Asset,
  type Library,
  MAX_UPLOAD_SIZE,
  Permission,
  Role,
  type User,
} from '../types';
import { mockApi } from '../services/api';

// --- Library Members Modal ---
interface LibraryMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  library: Library | null;
}

const LibraryMembersModal: React.FC<LibraryMemberModalProps> = ({
  isOpen,
  onClose,
  library,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen && library) {
      mockApi.users.list().then(setUsers);
      setSelectedIds(library.allowedUserIds || []);
    }
  }, [isOpen, library]);

  const handleSave = async () => {
    if (!library) return;
    await mockApi.libraries.updateMembers(library.id, selectedIds);
    onClose();
  };

  const toggleUser = (id: string) => {
    if (selectedIds.includes(id))
      setSelectedIds(selectedIds.filter((uid) => uid !== id));
    else setSelectedIds([...selectedIds, id]);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="库成员权限"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave}>保存更改</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          选择可以访问该库的成员。如果不选，则对所有团队成员开放。
        </p>
        <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between p-3 hover:bg-slate-50 cursor-pointer"
              onClick={() => toggleUser(u.id)}
            >
              <div className="flex items-center gap-3">
                <img src={u.avatar} className="w-8 h-8 rounded-full" />
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedIds.includes(u.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}
              >
                {selectedIds.includes(u.id) && (
                  <Users size={12} className="text-white" />
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Lock size={16} /> 当前状态:{' '}
          {selectedIds.length === 0
            ? '公开库 (全员可见)'
            : `私有库 (${selectedIds.length} 人可见)`}
        </div>
      </div>
    </Modal>
  );
};

interface AssetLibraryProps {
  type: 'block' | 'font';
}

export const AssetLibrary: React.FC<AssetLibraryProps> = ({ type }) => {
  const { libraryId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [role, setRole] = useState<Role | null>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [currentLibrary, setCurrentLibrary] = useState<Library | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [newLibName, setNewLibName] = useState('');
  const [newLibDesc, setNewLibDesc] = useState('');

  // Initial Load
  useEffect(() => {
    mockApi.auth.getRole().then(setRole);
    loadData();
  }, [type, libraryId]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (libraryId) {
        // Load specific library details and assets
        const lib = await mockApi.libraries.get(libraryId);
        const assetData = await mockApi.assets.listByLibrary(libraryId);
        setAssets(assetData);
      } else {
        // Load list of libraries
        const libData = await mockApi.libraries.list(type);
        setLibraries(libData);
        setCurrentLibrary(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const canManageLibrary = role?.permissions.includes(
    Permission.LIBRARY_MANAGE
  );
  const canUpload = role?.permissions.includes(Permission.ASSET_UPLOAD);

  // --- Handlers ---

  const handleCreateLibrary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLibName) return;

    await mockApi.libraries.create(newLibName, type, newLibDesc);
    setIsCreateModalOpen(false);
    setNewLibName('');
    setNewLibDesc('');
    loadData(); // Reload list
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !files.length || !libraryId) return;
    if (!canUpload) {
      alert('您没有上传权限');
      return;
    }

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        await mockApi.assets.add(libraryId, files[i], type);
      }
      await loadData(); // Reload assets
    } catch (error: any) {
      alert(error.message || '上传失败');
    } finally {
      setUploading(false);
      setIsDragging(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (canUpload) setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (canUpload) handleFileUpload(e.dataTransfer.files);
  };

  // --- Render ---

  if (loading && !currentLibrary && libraries.length === 0) {
    return <div className="p-8 text-center text-slate-500">加载资源库...</div>;
  }

  // --- View: Library List ---
  if (!libraryId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {type === 'block' ? '图块库集合' : '字体库集合'}
            </h1>
            <p className="text-slate-500 mt-1">
              创建并管理您的{type === 'block' ? 'CAD 图块' : '设计字体'}分组
            </p>
          </div>
          {canManageLibrary && (
            <Button icon={Plus} onClick={() => setIsCreateModalOpen(true)}>
              新建库
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {libraries.map((lib) => (
            <div
              key={lib.id}
              onClick={() => navigate(lib.id)}
              className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden flex flex-col relative"
            >
              {lib.allowedUserIds && lib.allowedUserIds.length > 0 && (
                <div
                  className="absolute top-3 right-3 z-10 bg-white/80 p-1.5 rounded-full backdrop-blur text-amber-500"
                  title="私有库"
                >
                  <Lock size={16} />
                </div>
              )}
              <div className="h-40 bg-slate-100 relative overflow-hidden">
                {lib.coverUrl ? (
                  <img
                    src={lib.coverUrl}
                    alt={lib.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-300">
                    {type === 'block' ? <Box size={48} /> : <Type size={48} />}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-60"></div>
                <div className="absolute bottom-4 left-4 text-white">
                  <h3 className="text-lg font-bold shadow-sm">{lib.name}</h3>
                  <p className="text-xs opacity-90">{lib.itemCount} 个资源</p>
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between">
                <p className="text-sm text-slate-600 line-clamp-2 mb-4">
                  {lib.description || '暂无描述'}
                </p>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />{' '}
                    {new Date(lib.createdAt).toLocaleDateString()}
                  </span>
                  <span className="group-hover:text-indigo-600 transition-colors">
                    进入库 &rarr;
                  </span>
                </div>
              </div>
            </div>
          ))}

          {canManageLibrary && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="min-h-[240px] rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 transition-colors flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600"
            >
              <div className="p-4 rounded-full bg-slate-50 mb-3 group-hover:bg-indigo-100">
                <Plus size={24} />
              </div>
              <span className="font-medium">新建资源库</span>
            </button>
          )}
        </div>

        {/* Create Library Modal */}
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title={`新建${type === 'block' ? '图块' : '字体'}库`}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setIsCreateModalOpen(false)}
              >
                取消
              </Button>
              <Button onClick={handleCreateLibrary} disabled={!newLibName}>
                创建
              </Button>
            </>
          }
        >
          <form onSubmit={handleCreateLibrary} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                库名称
              </label>
              <input
                type="text"
                value={newLibName}
                onChange={(e) => setNewLibName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500"
                placeholder="例如：电气符号标准库"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                描述 (可选)
              </label>
              <textarea
                value={newLibDesc}
                onChange={(e) => setNewLibDesc(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500"
                rows={3}
                placeholder="简单描述该库的用途..."
              />
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  // --- View: Asset List (Inside a Library) ---
  return (
    <div
      className="h-full flex flex-col relative"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drag Overlay */}
      {isDragging && canUpload && (
        <div className="absolute inset-0 z-50 bg-indigo-50/90 border-2 border-dashed border-indigo-500 rounded-xl flex flex-col items-center justify-center text-indigo-600 backdrop-blur-sm pointer-events-none">
          <Upload size={48} className="mb-4 animate-bounce" />
          <h3 className="text-xl font-bold">释放以上传文件到当前库</h3>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(type === 'block' ? '/blocks' : '/fonts')}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              {currentLibrary?.name}
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-normal border border-slate-200">
                {assets.length}
              </span>
              {currentLibrary?.allowedUserIds &&
                currentLibrary.allowedUserIds.length > 0 && (
                  <Lock size={16} className="text-amber-500" />
                )}
            </h1>
            <p className="text-slate-500 text-sm mt-1 max-w-2xl truncate">
              {currentLibrary?.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="file"
            multiple
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
          {canManageLibrary && (
            <Button
              variant="outline"
              icon={Users}
              onClick={() => setIsMemberModalOpen(true)}
            >
              权限成员
            </Button>
          )}
          {canUpload && (
            <Button
              icon={uploading ? Loader2 : Upload}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? '上传中...' : '上传资源'}
            </Button>
          )}
        </div>
      </div>

      {/* Asset Grid */}
      <div className="flex-1 overflow-y-auto">
        {assets.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <div className="p-4 bg-white rounded-full shadow-sm mb-4">
              {type === 'block' ? <Box size={32} /> : <Type size={32} />}
            </div>
            <p className="font-medium">库中暂无资源</p>
            {canUpload && (
              <p className="text-sm mt-2">拖拽文件到此处，或点击右上角上传</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden group hover:shadow-lg transition-all relative"
              >
                <div className="aspect-square bg-slate-50 relative flex items-center justify-center overflow-hidden">
                  {type === 'block' ? (
                    asset.url ? (
                      <img
                        src={asset.url}
                        alt={asset.name}
                        className="w-full h-full object-cover transition-transform group-hover:scale-110"
                      />
                    ) : (
                      <Box className="text-slate-300" size={48} />
                    )
                  ) : (
                    <div className="text-4xl font-serif text-slate-700">Ag</div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white/90 border-none text-slate-900 hover:bg-white"
                      onClick={() => alert('模拟下载成功')}
                    >
                      <Download size={16} />
                    </Button>
                  </div>
                </div>
                <div className="p-3">
                  <h3
                    className="font-medium text-slate-900 truncate text-sm"
                    title={asset.name}
                  >
                    {asset.name}
                  </h3>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {asset.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-slate-400">
                      {(asset.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <LibraryMembersModal
        isOpen={isMemberModalOpen}
        onClose={() => setIsMemberModalOpen(false)}
        library={currentLibrary}
      />
    </div>
  );
};
