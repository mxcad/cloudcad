import {
  AlertCircle,
  ArrowLeft,
  Box,
  CheckCircle,
  Download,
  File as FileIcon,
  Folder,
  Image as ImageIcon,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { PromptModal } from '../components/ui/Modal';
import { Api } from '../services/api';
import type { FileNode } from '../types';

interface FileCardProps {
  file: FileNode;
  onNavigate: (id: string, name: string) => void;
  onDelete: () => void;
  onShare: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
  inTrash: boolean;
}

const FileCard: React.FC<FileCardProps> = ({
  file,
  onNavigate,
  onDelete,
  onShare,
  onRestore,
  onPermanentDelete,
  inTrash,
}) => {
  const isFolder = file.type === 'folder';

  return (
    <div
      className={`group relative p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col items-center justify-center gap-3 select-none ${inTrash ? 'opacity-80' : ''}`}
      onClick={() => isFolder && !inTrash && onNavigate(file.id, file.name)}
    >
      <div
        className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-105 ${inTrash ? 'grayscale bg-slate-100 text-slate-400' : isFolder ? 'bg-blue-50 text-blue-500' : 'bg-slate-50 text-slate-500'}`}
      >
        {isFolder ? (
          <Folder size={32} fill="currentColor" className="opacity-20" />
        ) : file.type === 'cad' ? (
          <Box
            size={32}
            className={`${inTrash ? 'text-slate-400' : 'text-indigo-500'}`}
          />
        ) : file.type === 'image' ? (
          <ImageIcon
            size={32}
            className={`${inTrash ? 'text-slate-400' : 'text-emerald-500'}`}
          />
        ) : (
          <FileIcon size={32} />
        )}
      </div>

      <div className="text-center w-full relative z-0">
        <p
          className="font-medium text-slate-700 text-sm truncate w-full px-2"
          title={file.name}
        >
          {file.name}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {isFolder ? '-' : `${(file.size / 1024 / 1024).toFixed(2)} MB`}
        </p>
        {inTrash && <p className="text-[10px] text-red-400 mt-0.5">已删除</p>}
      </div>

      {/* Action Overlay */}
      <div className="absolute inset-x-0 bottom-0 p-2 bg-white/95 backdrop-blur-sm border-t border-slate-100 translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all flex justify-around rounded-b-xl z-20">
        {inTrash ? (
          <>
            <button
              className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded"
              onClick={(e) => {
                e.stopPropagation();
                onRestore();
              }}
              title="还原"
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
              onClick={(e) => {
                e.stopPropagation();
                onPermanentDelete();
              }}
              title="永久删除"
            >
              <XCircle size={16} />
            </button>
          </>
        ) : (
          <>
            <button
              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded"
              onClick={(e) => {
                e.stopPropagation();
                onShare();
              }}
              title="分享"
            >
              <Share2 size={16} />
            </button>
            <button
              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="删除"
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
      {!inTrash && file.shared && (
        <div
          className="absolute top-3 left-3 w-2 h-2 rounded-full bg-green-500 ring-2 ring-white"
          title="已分享"
        ></div>
      )}
    </div>
  );
};

// --- Toast Component ---
interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({
  message,
  type = 'success',
  onClose,
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transform transition-all animate-fade-in-up ${type === 'success' ? 'bg-indigo-600 text-white' : 'bg-red-500 text-white'}`}
    >
      {type === 'success' ? (
        <CheckCircle size={18} />
      ) : (
        <AlertCircle size={18} />
      )}
      <span className="font-medium text-sm">{message}</span>
    </div>
  );
};

export const FileManager = () => {
  const [currentPath, setCurrentPath] = useState<
    { id: string | null; name: string }[]
  >([{ id: null, name: '全部文件' }]);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'trash'>('active');
  const [toast, setToast] = useState<{
    msg: string;
    type: 'success' | 'error';
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentFolderId = currentPath[currentPath.length - 1].id;

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
  };

  const loadFiles = async () => {
    setLoading(true);
    try {
      let data;
      if (viewMode === 'trash') {
        data = await Api.files.getTrash();
      } else {
        data = await Api.files.list(currentFolderId);
      }
      setFiles(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [currentFolderId, viewMode]);

  const handleNavigate = (id: string, name: string) => {
    setCurrentPath([...currentPath, { id, name }]);
  };

  const handleNavigateUp = () => {
    if (currentPath.length > 1) {
      setCurrentPath(currentPath.slice(0, -1));
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    if (viewMode === 'trash') {
      setViewMode('active');
      setCurrentPath([{ id: null, name: '全部文件' }]);
      return;
    }
    setCurrentPath(currentPath.slice(0, index + 1));
  };

  const handleCreateFolder = async (name: string) => {
    await Api.files.createFolder(currentFolderId, name);
    setIsCreateFolderOpen(false);
    showToast('文件夹创建成功');
    loadFiles();
  };

  const handleFileUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    try {
      // Handle multiple files sequentially for mock
      for (let i = 0; i < fileList.length; i++) {
        await Api.files.upload(currentFolderId, fileList[i]);
      }
      showToast(`${fileList.length} 个文件上传成功`);
      loadFiles();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('确定要删除吗？文件将被移至回收站。')) {
      await Api.files.delete(id);
      showToast('文件已移至回收站');
      loadFiles();
    }
  };

  const handleRestore = async (id: string) => {
    await Api.files.restore(id);
    showToast('文件已还原');
    loadFiles();
  };

  const handlePermanentDelete = async (id: string) => {
    if (window.confirm('确定要永久删除吗？此操作无法撤销。')) {
      await Api.files.permanentlyDelete(id);
      showToast('文件已永久删除');
      loadFiles();
    }
  };

  const handleEmptyTrash = async () => {
    if (window.confirm('确定要清空回收站吗？')) {
      await Api.files.emptyTrash();
      showToast('回收站已清空');
      loadFiles();
    }
  };

  const handleShare = async (id: string) => {
    await Api.files.toggleShare(id);
    showToast('分享设置已更新');
    loadFiles();
  };

  // Drag and Drop Handlers
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (viewMode === 'active') {
      setIsDragging(true);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (viewMode === 'active') {
      setIsDragging(true);
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set false if leaving the main container to the outside (relatedTarget is null or outside)
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (viewMode === 'active') {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFileUpload(files);
      }
    }
  };

  return (
    <div
      className="h-full flex flex-col relative"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drag Overlay */}
      {isDragging && viewMode === 'active' && (
        <div className="absolute inset-0 z-50 bg-indigo-50/90 border-2 border-dashed border-indigo-500 rounded-xl flex flex-col items-center justify-center text-indigo-600 backdrop-blur-sm pointer-events-none transition-all duration-200">
          <div className="p-6 bg-white rounded-full shadow-lg mb-4 animate-bounce">
            <Upload size={48} />
          </div>
          <h3 className="text-2xl font-bold">释放文件以上传</h3>
          <p className="mt-2 text-indigo-500 font-medium">
            支持批量上传到当前文件夹
          </p>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          {currentPath.length > 1 && viewMode === 'active' && (
            <button
              onClick={handleNavigateUp}
              className="p-2 hover:bg-slate-100 rounded-full mr-2 text-slate-500"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <nav className="flex items-center text-sm font-medium text-slate-500">
            {viewMode === 'trash' ? (
              <span className="flex items-center text-slate-900 font-bold gap-2">
                <Trash2 size={18} /> 回收站
              </span>
            ) : (
              currentPath.map((folder, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <span className="mx-2 text-slate-300">/</span>}
                  <button
                    onClick={() => handleBreadcrumbClick(index)}
                    className={`hover:text-indigo-600 transition-colors ${index === currentPath.length - 1 ? 'text-slate-900 font-bold' : ''}`}
                  >
                    {folder.name}
                  </button>
                </React.Fragment>
              ))
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant={viewMode === 'trash' ? 'secondary' : 'ghost'}
            className={`${viewMode === 'trash' ? 'bg-slate-200 text-slate-900' : 'text-slate-500'}`}
            onClick={() =>
              setViewMode(viewMode === 'active' ? 'trash' : 'active')
            }
            icon={Trash2}
          >
            {viewMode === 'trash' ? '返回文件' : '回收站'}
          </Button>

          {viewMode === 'trash' ? (
            <Button
              variant="danger"
              icon={XCircle}
              onClick={handleEmptyTrash}
              disabled={files.length === 0}
            >
              清空回收站
            </Button>
          ) : (
            <>
              <input
                type="file"
                multiple
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
              />
              <Button
                variant="outline"
                icon={Plus}
                onClick={() => setIsCreateFolderOpen(true)}
              >
                新建文件夹
              </Button>
              <Button
                icon={uploading ? Loader2 : Upload}
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? '上传中...' : '上传文件'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* File Grid */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <Loader2 className="animate-spin mr-2" /> 加载中...
        </div>
      ) : files.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl m-1 bg-slate-50/50">
          {viewMode === 'trash' ? (
            <Trash2 size={48} className="text-slate-300 mb-4" />
          ) : (
            <Folder size={48} className="text-slate-300 mb-4" />
          )}
          <p className="font-medium">
            {viewMode === 'trash' ? '回收站为空' : '此文件夹为空'}
          </p>
          <p className="text-sm mt-2">
            {viewMode === 'trash'
              ? '删除的文件将显示在这里'
              : '拖拽文件到此处，或点击右上角上传'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-10">
          {files.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              onNavigate={handleNavigate}
              onDelete={() => handleDelete(file.id)}
              onShare={() => handleShare(file.id)}
              onRestore={() => handleRestore(file.id)}
              onPermanentDelete={() => handlePermanentDelete(file.id)}
              inTrash={viewMode === 'trash'}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <PromptModal
        isOpen={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        title="新建文件夹"
        label="文件夹名称"
        defaultValue="新建项目"
        onSubmit={handleCreateFolder}
      />
    </div>
  );
};
