import React, { useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Upload, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ToastContainer } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import MxCadUploader from '../components/MxCadUploader';
import { Toolbar } from '../components/Toolbar';
import { BreadcrumbNavigation } from '../components/BreadcrumbNavigation';
import { FileItem } from '../components/FileItem';
import { useFileSystem } from '../hooks/useFileSystem';
import { useMxCadUploadNative } from '../hooks/useMxCadUploadNative';

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
    handleSelectAll,
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
  const uploadButtonRef = useRef<HTMLButtonElement>(null);
  
  const { selectFiles } = useMxCadUploadNative();

  // 处理文件上传
  const handleFileUpload = useCallback(() => {
    selectFiles({
      projectId,
      parentId: nodeId || projectId,
      onSuccess: () => {
        showToast('文件上传成功', 'success');
        handleRefresh();
      },
      onError: (error: string) => {
        showToast(`上传失败: ${error}`, 'error');
      },
      onProgress: (percentage: number) => {
        // 可以在这里添加进度显示逻辑
        // 静默：上传进度
      },
      onFileQueued: (file: any) => {
        showToast(`正在排队上传: ${file.name}`, 'info');
      },
      onBeginUpload: () => {
        showToast('开始上传文件', 'info');
      },
    });
  }, [projectId, nodeId, selectFiles, showToast, handleRefresh]);

  // 过滤节点
  const filteredNodes = nodes.filter(node =>
    node.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <p>请先选择一个项目</p>
        <Button onClick={() => navigate('/projects')} className="mt-4">
          返回项目列表
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 relative">
      {/* Toast 通知 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* 拖拽上传遮罩层 */}
      {isDragging && (
        <div className="fixed inset-0 z-40 bg-indigo-500 bg-opacity-20 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-12 text-center animate-scale-in">
            <Upload size={64} className="mx-auto text-indigo-600 mb-4" />
            <h3 className="text-2xl font-bold text-slate-900 mb-2">
              拖放文件到此处上传
            </h3>
            <p className="text-slate-600">
              支持 .dwg, .dxf, .pdf, .png, .jpg, .jpeg 格式
            </p>
          </div>
        </div>
      )}

      {/* 页面标题和面包屑导航 */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGoBack}
              title="返回上级"
              disabled={!currentNode?.parentId}
            >
              ←
            </Button>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">
              {currentNode?.name || '文件系统'}
            </h1>
          </div>

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

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={loading}
            title="刷新"
          >
            <RefreshCw size={16} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button onClick={handleFileUpload} disabled={loading}>
            <Upload size={16} className="mr-2" />
            上传文件
          </Button>
          <MxCadUploader
            projectId={projectId}
            parentId={nodeId || projectId}
            onSuccess={(param) => {
              showToast('文件上传成功', 'success');
              // 如果是秒传，添加额外的延迟确保后端数据库事务完成
              if (param.isInstantUpload) {
                setTimeout(() => {
                  // 检查当前目录是否是文件上传的目标目录
                  // 使用 currentNode.id 而不是路由参数，确保获取的是当前实际的目录
                  const currentDirId = currentNode?.id || projectId;
                  const targetDirId = param.parentId || projectId;
if (currentDirId !== targetDirId) {
                    // 如果不在目标目录，导航到目标目录
                    const targetUrl = `/projects/${projectId}/files/${targetDirId === projectId ? '' : targetDirId}`;
navigate(targetUrl);
                  } else {
                    // 如果已在目标目录，直接刷新
handleRefresh();
                  }
                }, 1000); // 增加延迟时间从500ms到1000ms
              } else {
                handleRefresh();
              }
            }}
            onError={(error: string) => showToast(`上传失败: ${error}`, 'error')}
          />
          <Button 
            onClick={() => setShowCreateFolderModal(true)}
            disabled={loading}
          >
            新建文件夹
          </Button>
        </div>
      </div>

      {/* 工具栏 */}
      <Toolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        selectedCount={selectedNodes.size}
        onGoBack={handleGoBack}
        onCreateFolder={() => setShowCreateFolderModal(true)}
        onBatchDelete={handleBatchDelete}
        onRefresh={handleRefresh}
        loading={loading}
      />

      {/* 内容区域 */}
      <div 
        ref={fileAreaRef}
        className="bg-white rounded-xl border border-slate-200 relative min-h-[400px]"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="mt-4 text-slate-500">加载中...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw size={16} className="mr-2" />
              重试
            </Button>
          </div>
        ) : filteredNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            {searchQuery ? (
              <>
                <p className="text-xl font-semibold text-slate-900 mb-2">
                  没有找到匹配的文件
                </p>
                <p className="text-slate-500 mb-4">
                  没有找到包含 "{searchQuery}" 的文件或文件夹
                </p>
                <Button 
                  onClick={() => setSearchQuery('')}
                  variant="outline"
                >
                  清除搜索
                </Button>
              </>
            ) : (
              <>
                <Upload size={48} className="mx-auto text-slate-300 mb-4" />
                <p className="text-xl font-semibold text-slate-900 mb-2">
                  这个文件夹是空的
                </p>
                <p className="text-slate-500 mb-6">
                  上传文件或创建文件夹来开始使用
                </p>
                <div className="flex gap-3 flex-wrap justify-center">
                  <Button onClick={handleFileUpload}>
                    <Upload size={16} className="mr-2" />
                    上传文件
                  </Button>
                  <MxCadUploader
                    projectId={projectId}
                    parentId={nodeId || projectId}
                    onSuccess={(param) => {
                      showToast('文件上传成功', 'success');
                      // 如果是秒传，添加额外的延迟确保后端数据库事务完成
                      if (param.isInstantUpload) {
                        setTimeout(() => {
                          // 检查当前目录是否是文件上传的目标目录
                          // 使用 currentNode.id 而不是路由参数，确保获取的是当前实际的目录
                          const currentDirId = currentNode?.id || projectId;
                          const targetDirId = param.parentId || projectId;
                          
                          
                          
                          if (currentDirId !== targetDirId) {
                            // 如果不在目标目录，导航到目标目录
                            const targetUrl = `/projects/${projectId}/files/${targetDirId === projectId ? '' : targetDirId}`;
                            navigate(targetUrl);
                          } else {
                            // 如果已在目标目录，直接刷新
                            handleRefresh();
                          }
                        }, 1000); // 增加延迟时间从500ms到1000ms
                      } else {
                        handleRefresh();
                      }
                    }}
                    onError={(error: string) => showToast(`上传失败: ${error}`, 'error')}
                  />
                  <Button 
                    onClick={() => setShowCreateFolderModal(true)}
                    variant="outline"
                  >
                    新建文件夹
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className={viewMode === 'grid' 
            ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 p-6'
            : 'divide-y divide-slate-200'
          }>
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
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
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
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
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