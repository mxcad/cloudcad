import React from 'react';
import {
  ArrowLeft,
  FolderPlus,
  Upload,
  Trash2,
  Search,
  Grid,
  List,
  RefreshCw,
} from 'lucide-react';
import { Button } from './ui/Button';

interface ToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  selectedCount: number;
  onGoBack: () => void;
  onCreateFolder: () => void;
  onBatchDelete: () => void;
  onRefresh: () => void;
  loading: boolean;
  onUploadClick: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  selectedCount,
  onGoBack,
  onCreateFolder,
  onBatchDelete,
  onRefresh,
  loading,
  onUploadClick,
}) => {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {/* 左侧操作按钮 */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onGoBack}
          title="返回上级"
        >
          <ArrowLeft size={20} />
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={onCreateFolder}
          title="新建文件夹"
        >
          <FolderPlus size={20} />
          <span className="hidden sm:inline ml-2">新建文件夹</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onUploadClick}
          title="上传文件"
        >
          <Upload size={20} />
          <span className="hidden sm:inline ml-2">上传文件</span>
        </Button>

        {selectedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBatchDelete}
            title={`删除选中的 ${selectedCount} 项`}
            className="text-red-600 border-red-300 hover:bg-red-50"
          >
            <Trash2 size={20} />
            <span className="hidden sm:inline ml-2">删除 ({selectedCount})</span>
          </Button>
        )}
      </div>

      {/* 右侧工具按钮 */}
      <div className="flex items-center gap-2 ml-auto">
        {/* 搜索框 */}
        <div className="relative">
          <Search
            size={20}
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="搜索文件..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-48 sm:w-64"
          />
        </div>

        {/* 视图切换 */}
        <div className="flex items-center border border-slate-300 rounded-lg">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('grid')}
            className="rounded-r-none"
          >
            <Grid size={16} />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('list')}
            className="rounded-l-none"
          >
            <List size={16} />
          </Button>
        </div>

        {/* 刷新按钮 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          title="刷新"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>
    </div>
  );
};