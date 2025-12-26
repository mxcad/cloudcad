import React, { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ToastContainer } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import MxCadUploader from '../components/MxCadUploader';
import { BreadcrumbNavigation } from '../components/BreadcrumbNavigation';
import { FileItem } from '../components/FileItem';
import { useFileSystem } from '../hooks/useFileSystem';
import {
  EmptyFolderIcon,
  RefreshIcon,
  SearchIcon,
  GridIcon,
  ListIcon,
  UploadIcon,
} from '../components/FileIcons';

export const FileSystemManager: React.FC = () => {
  const navigate = useNavigate();
  const { projectId, nodeId } = useParams<{ projectId: string; nodeId?: string }>();
  const [isDragging, setIsDragging] = React.useState(false);

  const {
    nodes,
    currentNode,
    breadcrumbs,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    selectedNodes,
    toasts,
    confirmDialog,
    showCreateFolderModal,
    showRenameModal,
    folderName,
    setFolderName,
    editingNode,
    setShowCreateFolderModal,
    setShowRenameModal,
    setEditingNode,
    removeToast,
    closeConfirm,
    handleRefresh,
    handleGoBack,
    handleNodeSelect,
    handleCreateFolder,
    handleRename,
    handleDelete,
    handleBatchDelete,
    handleFileOpen,
    handleDownload,
    handleOpenRename,
    showToast,
  } = useFileSystem();

  const fileAreaRef = useRef<HTMLDivElement>(null);

  // 过滤节点
  const filteredNodes = nodes.filter((node) =>
    node.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-slate-400"
            >
              <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <p className="text-slate-600 mb-4">请先选择一个项目</p>
          <Button onClick={() => navigate('/projects')}>返回项目列表</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 relative">
      {/* Toast 通知 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* 拖拽上传遮罩层 */}
      {isDragging && (
        <div
          className="fixed inset-0 z-40 bg-indigo-500 bg-opacity-10 backdrop-blur-sm 
                     flex items-center justify-center animate-fade-in"
        >
          <div className="bg-white rounded-2xl shadow-2xl p-12 text-center 
                          transform animate-scale-in">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-indigo-100 
                          flex items-center justify-center">
              <UploadIcon size={40} className="text-indigo-600" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">
              拖放文件到此处上传
            </h3>
            <p className="text-slate-600">
              支持 .dwg, .dxf, .pdf, .png, .jpg, .jpeg 格式
            </p>
          </div>
        </div>
      )}

      {/* 页面标题区域 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        {/* 第一行：面包屑 + 刷新 + 操作按钮 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* 返回按钮 */}
            <button
              onClick={handleGoBack}
              disabled={!currentNode?.parentId}
              className="p-1.5 rounded text-slate-500 hover:text-slate-700 
                       hover:bg-slate-100 transition-all disabled:opacity-50 
                       disabled:cursor-not-allowed flex-shrink-0"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M5 12L12 19M5 12L12 5" />
              </svg>
            </button>

            {/* 面包屑导航 */}
            <BreadcrumbNavigation
              breadcrumbs={breadcrumbs}
              onNavigate={(crumb) => {
                if (crumb.isRoot) {
                  navigate(`/projects/${crumb.id}/files`);
                } else {
                  navigate(`/projects/${projectId}/files/${crumb.id}`);
                }
              }}
              onNavigateToProjects={() => navigate('/projects')}
            />
          </div>

          {/* 操作按钮组 */}
          <div className="flex items-center gap-1.5">
            {/* 刷新 */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              className="text-slate-600"
              title="刷新"
            >
              <RefreshIcon size={16} className={loading ? 'animate-spin' : ''} />
            </Button>

            {/* 新建文件夹 */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCreateFolderModal(true)}
              disabled={loading}
              className="text-slate-600"
              title="新建文件夹"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                <path d="M12 11v6M9 14h6" />
              </svg>
            </Button>

            {/* 上传文件 */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // 直接触发隐藏的文件输入
                const input = document.getElementById('mxcad-file-picker') as HTMLInputElement;
                input?.click();
              }}
              disabled={loading}
              className="text-slate-600"
              title="上传文件"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M17 8L12 3L7 8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 3V15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Button>

            {/* 隐藏的 MxCAD 文件输入 */}
            <MxCadUploader
              projectId={projectId}
              parentId={nodeId || projectId}
              buttonText=""
              buttonClassName="hidden"
              onSuccess={(param) => {
                showToast('文件上传成功', 'success');
                if (param.isInstantUpload) {
                  setTimeout(() => {
                    const currentDirId = currentNode?.id || projectId;
                    const targetDirId = param.parentId || projectId;

                    if (currentDirId !== targetDirId) {
                      const targetUrl = `/projects/${projectId}/files/${
                        targetDirId === projectId ? '' : targetDirId
                      }`;
                      navigate(targetUrl);
                    } else {
                      handleRefresh();
                    }
                  }, 1000);
                } else {
                  handleRefresh();
                }
              }}
              onError={(error: string) =>
                showToast(`上传失败: ${error}`, 'error')
              }
            />
          </div>
        </div>

        {/* 第二行：搜索 + 视图切换 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-slate-100">
          {/* 搜索框 */}
          <div className="relative group flex-1 max-w-xs">
            <SearchIcon
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 
                         group-focus-within:text-indigo-500 transition-colors"
            />
            <input
              type="text"
              placeholder="搜索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg 
                         placeholder:text-slate-400
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                         transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 
                           hover:text-slate-600 transition-colors p-0.5"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* 视图切换 */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 transition-all ${
                viewMode === 'grid' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'
              }`}
              title="网格视图"
            >
              <GridIcon size={14} />
            </button>
            <div className="w-px h-4 bg-slate-200" />
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 transition-all ${
                viewMode === 'list' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'
              }`}
              title="列表视图"
            >
              <ListIcon size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div
        ref={fileAreaRef}
        className="bg-white rounded-2xl border border-slate-200 relative min-h-[400px] 
                   shadow-sm overflow-hidden"
      >
        {/* 加载状态 */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-slate-200" />
              <div
                className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 
                           border-indigo-600 border-t-transparent animate-spin"
              />
            </div>
            <p className="mt-4 text-slate-500 font-medium">加载中...</p>
          </div>
        )}

        {/* 错误状态 */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#DC2626"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </div>
            <p className="text-red-600 font-medium mb-4">{error}</p>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshIcon size={16} className="mr-2" />
              重试
            </Button>
          </div>
        )}

        {/* 空状态 */}
        {!loading && !error && filteredNodes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <EmptyFolderIcon size={64} className="text-slate-300 mb-4" />
            {searchQuery ? (
              <>
                <h3 className="text-base font-semibold text-slate-900 mb-2">
                  没有找到匹配的文件
                </h3>
                <p className="text-slate-500 text-sm mb-4">
                  没有找到包含 "{searchQuery}" 的文件或文件夹
                </p>
                <Button onClick={() => setSearchQuery('')} variant="outline" size="sm">
                  清除搜索
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-slate-900 mb-2">
                  这个文件夹是空的
                </h3>
                <p className="text-slate-500 text-sm mb-4">
                  上传文件或创建文件夹来开始使用
                </p>
              </>
            )}
          </div>
        )}

        {/* 文件列表 */}
        {!loading && !error && filteredNodes.length > 0 && (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-6'
                : 'divide-y divide-slate-100'
            }
          >
            {filteredNodes.map((node) => (
              <FileItem
                key={node.id}
                node={node}
                isSelected={selectedNodes.has(node.id)}
                viewMode={viewMode}
                onSelect={handleNodeSelect}
                onEnter={handleFileOpen}
                onDownload={handleDownload}
                onDelete={handleDelete}
                onRename={handleOpenRename}
              />
            ))}
          </div>
        )}

        {/* 选中数量提示 */}
        {selectedNodes.size > 0 && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 
                        bg-slate-900 text-white px-4 py-2 rounded-full shadow-lg
                        flex items-center gap-3 animate-bounce-in">
            <span className="text-sm font-medium">
              已选中 {selectedNodes.size} 项
            </span>
            <div className="w-px h-4 bg-slate-700" />
            <button
              onClick={handleBatchDelete}
              className="text-red-400 hover:text-white text-sm transition-colors"
            >
              删除
            </button>
            <button
              onClick={() => selectedNodes.clear()}
              className="text-slate-400 hover:text-white text-sm transition-colors"
            >
              取消
            </button>
          </div>
        )}
      </div>

      {/* 创建文件夹模态框 */}
      <Modal
        isOpen={showCreateFolderModal}
        onClose={() => {
          setShowCreateFolderModal(false);
          setFolderName('');
        }}
        title="新建文件夹"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setShowCreateFolderModal(false);
                setFolderName('');
              }}
            >
              取消
            </Button>
            <Button onClick={handleCreateFolder}>创建</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              文件夹名称 *
            </label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg 
                       focus:ring-2 focus:ring-amber-500 focus:border-amber-500
                       placeholder:text-slate-400"
              placeholder="请输入文件夹名称"
              autoFocus
            />
          </div>
        </div>
      </Modal>

      {/* 重命名模态框 */}
      <Modal
        isOpen={showRenameModal}
        onClose={() => {
          setShowRenameModal(false);
          setEditingNode(null);
          setFolderName('');
        }}
        title={`重命名${editingNode?.isFolder ? '文件夹' : '文件'}`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setShowRenameModal(false);
                setEditingNode(null);
                setFolderName('');
              }}
            >
              取消
            </Button>
            <Button onClick={handleRename}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              新名称 *
            </label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleRename()}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg 
                       focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                       placeholder:text-slate-400"
              placeholder="请输入新名称"
              autoFocus
            />
          </div>
        </div>
      </Modal>

      {/* Toast 通知 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* 确认对话框 */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirm}
        type={confirmDialog.type}
      />
    </div>
  );
};