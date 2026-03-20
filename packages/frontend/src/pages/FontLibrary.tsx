import { useState, useEffect, useCallback, useMemo } from 'react';
import { fontsApi } from '../services';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import Download from 'lucide-react/dist/esm/icons/download';
import Upload from 'lucide-react/dist/esm/icons/upload';
import Search from 'lucide-react/dist/esm/icons/search';
import Filter from 'lucide-react/dist/esm/icons/filter';
import FileType from 'lucide-react/dist/esm/icons/file-type';
import Calendar from 'lucide-react/dist/esm/icons/calendar';
import HardDrive from 'lucide-react/dist/esm/icons/hard-drive';
import Type from 'lucide-react/dist/esm/icons/type';
import X from 'lucide-react/dist/esm/icons/x';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import FileCode from 'lucide-react/dist/esm/icons/file-code';
import FileDigit from 'lucide-react/dist/esm/icons/file-digit';
import FileBox from 'lucide-react/dist/esm/icons/file-box';
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open';
import Layers from 'lucide-react/dist/esm/icons/layers';
import Palette from 'lucide-react/dist/esm/icons/palette';
import Shapes from 'lucide-react/dist/esm/icons/shapes';
import { FileNameText } from '../components/ui/TruncateText';
import type { FontInfo } from '../types/filesystem';
import { usePermission } from '../hooks/usePermission';
import { useNotification } from '../contexts/NotificationContext';
import { SystemPermission } from '../constants/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

interface FontLibraryProps {}

// 字体文件类型配置 - 使用颜色和 lucide 图标
const FONT_TYPES = [
  { value: '', label: '全部格式', color: '#6366f1', Icon: FolderOpen },
  { value: '.ttf', label: 'TTF', color: '#22c55e', Icon: Type },
  { value: '.otf', label: 'OTF', color: '#3b82f6', Icon: FileText },
  { value: '.woff', label: 'WOFF', color: '#f59e0b', Icon: FileBox },
  { value: '.woff2', label: 'WOFF2', color: '#f97316', Icon: FileBox },
  { value: '.eot', label: 'EOT', color: '#8b5cf6', Icon: FileDigit },
  { value: '.ttc', label: 'TTC', color: '#ec4899', Icon: Layers },
  { value: '.shx', label: 'SHX', color: '#06b6d4', Icon: Shapes },
];

// 字体类型图标映射
const getFontIcon = (extension: string): { color: string; label: string; Icon: React.ComponentType<{size?: number, className?: string}> } => {
  const type = FONT_TYPES.find(t => t.value === extension.toLowerCase());
  if (type) {
    return { color: type.color, label: type.label, Icon: type.Icon };
  }
  return { color: '#6366f1', label: extension.toUpperCase(), Icon: FileType };
};

export default function FontLibrary(props: FontLibraryProps) {
  useDocumentTitle('字体库');
  const { hasPermission } = usePermission();
  const { showToast, showConfirm } = useNotification();

  // 所有 Hooks 必须在条件返回之前调用
  const [allFonts, setAllFonts] = useState<FontInfo[]>([]);
  const [fonts, setFonts] = useState<FontInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // 当前标签页
  const [activeTab, setActiveTab] = useState<'backend' | 'frontend'>('backend');

  // 筛选条件
  const [filters, setFilters] = useState({
    name: '',
    extension: '',
    startTime: '',
    endTime: '',
  });

  // 排序
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'createdAt'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 视图模式
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // 上传模态框
  const [showUploadModal, setShowUploadModal] = useState(false);

  // 选中的字体
  const [selectedFonts, setSelectedFonts] = useState<Set<string>>(new Set());

  // 展开/收起筛选
  const [showFilters, setShowFilters] = useState(false);

  // 权限检查
  const canReadFonts = hasPermission(SystemPermission.SYSTEM_FONT_READ);
  const canUploadFonts = hasPermission(SystemPermission.SYSTEM_FONT_UPLOAD);
  const canDeleteFonts = hasPermission(SystemPermission.SYSTEM_FONT_DELETE);
  const canDownloadFonts = hasPermission(SystemPermission.SYSTEM_FONT_DOWNLOAD);

  // 获取字体列表
  const fetchFonts = useCallback(async () => {
    if (!canReadFonts) return;
    setLoading(true);
    try {
      const response = await fontsApi.getFonts(activeTab);
      console.log('字体API响应:', response);

      let fontsData = response.data || [];
      if (fontsData && typeof fontsData === 'object' && 'data' in fontsData) {
        fontsData = fontsData.data || [];
      }

      console.log('解析后的字体数据:', fontsData, '数量:', Array.isArray(fontsData) ? fontsData.length : 0);
      setAllFonts(Array.isArray(fontsData) ? fontsData : []);
    } catch (error) {
      console.error('获取字体列表失败:', error);
      setAllFonts([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, canReadFonts]);

  // 处理筛选、排序
  useEffect(() => {
    let filtered = [...allFonts];

    // 筛选
    if (filters.name) {
      filtered = filtered.filter((font) =>
        font.name.toLowerCase().includes(filters.name.toLowerCase())
      );
    }

    if (filters.extension) {
      filtered = filtered.filter(
        (font) => font.extension.toLowerCase() === filters.extension.toLowerCase()
      );
    }

    if (filters.startTime) {
      const start = new Date(filters.startTime);
      filtered = filtered.filter((font) => new Date(font.createdAt) >= start);
    }

    if (filters.endTime) {
      const end = new Date(filters.endTime);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((font) => new Date(font.createdAt) <= end);
    }

    // 排序
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'createdAt':
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        default:
          comparison = a.name.localeCompare(b.name);
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    setFonts(filtered);
  }, [allFonts, filters, sortBy, sortOrder]);

  useEffect(() => {
    fetchFonts();
  }, [fetchFonts]);

  // 如果没有查看权限，返回无权限提示
  if (!canReadFonts) {
    return (
      <div className="page-content-theme min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-bg-tertiary flex items-center justify-center">
            <FileCode size={40} className="text-text-muted" />
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">无访问权限</h2>
          <p className="text-text-tertiary">您没有查看字体库的权限</p>
        </div>
      </div>
    );
  }

  // 处理筛选条件变化
  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // 重置筛选条件
  const handleReset = () => {
    setFilters({
      name: '',
      extension: '',
      startTime: '',
      endTime: '',
    });
  };

  // 处理排序
  const handleSort = (field: 'name' | 'size' | 'createdAt') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // 处理选中
  const handleSelect = (fontName: string) => {
    setSelectedFonts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(fontName)) {
        newSet.delete(fontName);
      } else {
        newSet.add(fontName);
      }
      return newSet;
    });
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedFonts.size === fonts.length) {
      setSelectedFonts(new Set());
    } else {
      setSelectedFonts(new Set(fonts.map((f) => f.name)));
    }
  };

  // 删除字体
  const handleDelete = async (fontName: string) => {
    const confirmed = await showConfirm({
      title: '确认删除',
      message: `确定要删除字体 "${fontName}" 吗？`,
      type: 'danger',
    });
    if (!confirmed) return;

    try {
      await fontsApi.deleteFont(fontName, activeTab);
      await fetchFonts();
      setSelectedFonts(prev => {
        const newSet = new Set(prev);
        newSet.delete(fontName);
        return newSet;
      });
      showToast('删除成功', 'success');
    } catch (error) {
      console.error('删除字体失败:', error);
      showToast('删除字体失败', 'error');
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedFonts.size === 0) {
      showToast('请先选择要删除的字体', 'warning');
      return;
    }

    const confirmed = await showConfirm({
      title: '确认批量删除',
      message: `确定要删除选中的 ${selectedFonts.size} 个字体吗？`,
      type: 'danger',
    });
    if (!confirmed) return;

    try {
      await Promise.all(
        Array.from(selectedFonts).map((fontName) =>
          fontsApi.deleteFont(fontName as string, activeTab)
        )
      );
      setSelectedFonts(new Set());
      await fetchFonts();
      showToast('批量删除成功', 'success');
    } catch (error) {
      console.error('批量删除失败:', error);
      showToast('批量删除失败', 'error');
    }
  };

  // 下载字体
  const handleDownload = async (fontName: string) => {
    try {
      const response = await fontsApi.downloadFont(fontName, activeTab);
      const url = window.URL.createObjectURL(
        new Blob([response.data as BlobPart])
      );
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fontName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast('下载成功', 'success');
    } catch (error) {
      console.error('下载字体失败:', error);
      showToast('下载字体失败', 'error');
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // 格式化日期
  const formatDate = (date: string | Date): string => {
    const d = new Date(date);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 统计信息
  const stats = useMemo(() => {
    const totalSize = fonts.reduce((sum, f) => sum + f.size, 0);
    const typeCount = new Set(fonts.map(f => f.extension.toLowerCase())).size;
    return { count: fonts.length, totalSize, typeCount };
  }, [fonts]);

  return (
    <div className="page-content-theme min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* 页面头部 */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-text-primary mb-1">字体库管理</h1>
              <p className="text-text-tertiary text-sm">管理和维护 CAD 字体文件</p>
            </div>
            {canUploadFonts && (
              <button
                onClick={() => setShowUploadModal(true)}
                className="btn-primary flex items-center gap-2"
              >
                <Upload size={18} />
                上传字体
              </button>
            )}
          </div>

          {/* 统计卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="card-theme flex items-center gap-4 group">
              <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Palette size={24} className="text-primary-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{stats.count}</p>
                <p className="text-sm text-text-tertiary">字体总数</p>
              </div>
            </div>
            <div className="card-theme flex items-center gap-4 group">
              <div className="w-12 h-12 rounded-xl bg-accent-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                <HardDrive size={24} className="text-accent-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{formatFileSize(stats.totalSize)}</p>
                <p className="text-sm text-text-tertiary">总存储</p>
              </div>
            </div>
            <div className="card-theme flex items-center gap-4 group">
              <div className="w-12 h-12 rounded-xl bg-success-dim flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileCode size={24} className="text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{stats.typeCount}</p>
                <p className="text-sm text-text-tertiary">格式种类</p>
              </div>
            </div>
          </div>
        </div>

        {/* 标签页切换 */}
        <div className="tabs-theme mb-6 inline-flex">
          <button
            onClick={() => {
              setActiveTab('backend');
              setSelectedFonts(new Set());
            }}
            className={`tab-theme ${activeTab === 'backend' ? 'active' : ''}`}
          >
            <div className="flex items-center gap-2">
              <HardDrive size={16} />
              后端字体（转换程序）
            </div>
          </button>
          <button
            onClick={() => {
              setActiveTab('frontend');
              setSelectedFonts(new Set());
            }}
            className={`tab-theme ${activeTab === 'frontend' ? 'active' : ''}`}
          >
            <div className="flex items-center gap-2">
              <Type size={16} />
              前端字体（资源目录）
            </div>
          </button>
        </div>

        {/* 筛选和搜索栏 */}
        <div className="card-theme mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* 搜索框 */}
            <div className="flex-1 min-w-[240px] relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none z-10" />
              <input
                type="text"
                placeholder="搜索字体名称..."
                value={filters.name}
                onChange={(e) => handleFilterChange('name', e.target.value)}
                className="input-theme !pl-12"
              />
            </div>

            {/* 格式筛选 */}
            <div className="w-40">
              <select
                value={filters.extension}
                onChange={(e) => handleFilterChange('extension', e.target.value)}
                className="input-theme"
              >
                {FONT_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 展开筛选按钮 */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`btn-secondary flex items-center gap-2 ${showFilters ? 'bg-bg-tertiary' : ''}`}
            >
              <Filter size={16} />
              筛选
              <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            {/* 重置按钮 */}
            {(filters.name || filters.extension || filters.startTime || filters.endTime) && (
              <button
                onClick={handleReset}
                className="btn-ghost flex items-center gap-1"
              >
                <X size={14} />
                清除
              </button>
            )}

            {/* 视图切换 */}
            <div className="flex items-center gap-1 bg-bg-tertiary rounded-lg p-1 ml-auto">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-bg-secondary shadow-sm text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
                title="网格视图"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="1" width="6" height="6" rx="1" />
                  <rect x="9" y="1" width="6" height="6" rx="1" />
                  <rect x="1" y="9" width="6" height="6" rx="1" />
                  <rect x="9" y="9" width="6" height="6" rx="1" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-bg-secondary shadow-sm text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
                title="列表视图"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="2" width="14" height="2" rx="1" />
                  <rect x="1" y="7" width="14" height="2" rx="1" />
                  <rect x="1" y="12" width="14" height="2" rx="1" />
                </svg>
              </button>
            </div>
          </div>

          {/* 展开的筛选条件 */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-border-subtle animate-slide-up">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    <Calendar size={14} className="inline mr-1" />
                    开始日期
                  </label>
                  <input
                    type="date"
                    value={filters.startTime}
                    onChange={(e) => handleFilterChange('startTime', e.target.value)}
                    className="input-theme w-40"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    <Calendar size={14} className="inline mr-1" />
                    结束日期
                  </label>
                  <input
                    type="date"
                    value={filters.endTime}
                    onChange={(e) => handleFilterChange('endTime', e.target.value)}
                    className="input-theme w-40"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 批量操作栏 */}
        {selectedFonts.size > 0 && (
          <div className="card-theme mb-4 flex items-center justify-between animate-slide-up">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedFonts.size === fonts.length && fonts.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded border-border-default text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-text-secondary">
                已选择 <span className="font-semibold text-text-primary">{selectedFonts.size}</span> 个字体
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedFonts(new Set())}
                className="btn-ghost text-sm"
              >
                取消选择
              </button>
              {canDeleteFonts && (
                <button
                  onClick={handleBatchDelete}
                  className="btn-danger flex items-center gap-2 text-sm"
                >
                  <Trash2 size={14} />
                  批量删除
                </button>
              )}
            </div>
          </div>
        )}

        {/* 排序选项 */}
        <div className="flex items-center gap-4 mb-4 text-sm">
          <span className="text-text-tertiary">排序：</span>
          {[
            { key: 'createdAt', label: '修改时间' },
            { key: 'name', label: '名称' },
            { key: 'size', label: '大小' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleSort(key as 'name' | 'size' | 'createdAt')}
              className={`flex items-center gap-1 transition-colors ${
                sortBy === key 
                  ? 'text-primary-600 font-medium' 
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {label}
              {sortBy === key && (
                <ChevronDown 
                  size={14} 
                  className={`transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`}
                />
              )}
            </button>
          ))}
        </div>

        {/* 字体列表 - 网格视图 */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {loading ? (
              // 骨架屏
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="card-theme h-40">
                  <div className="skeleton-theme w-full h-full rounded-lg" />
                </div>
              ))
            ) : fonts.length === 0 ? (
              <div className="col-span-full py-16 text-center">
                <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-bg-tertiary flex items-center justify-center">
                  <div className="relative">
                    <FolderOpen size={40} className="text-text-muted" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center">
                      <Type size={14} className="text-primary-600" />
                    </div>
                  </div>
                </div>
                <h3 className="text-lg font-medium text-text-primary mb-1">暂无字体</h3>
                <p className="text-text-tertiary text-sm mb-4">
                  {filters.name || filters.extension ? '没有找到匹配的字体' : '当前位置没有字体文件'}
                </p>
                {canUploadFonts && !filters.name && !filters.extension && (
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="btn-primary"
                  >
                    上传第一个字体
                  </button>
                )}
              </div>
            ) : (
                              fonts.map((font, index) => {
                              const typeInfo = getFontIcon(font.extension);
                              const isSelected = selectedFonts.has(font.name);
                              const IconComponent = typeInfo.Icon;
                              return (
                                <div
                                  key={font.name}
                                  className={`card-theme relative group animate-fade-in ${isSelected ? 'ring-2 ring-primary-500' : ''}`}
                                  style={{ animationDelay: `${index * 50}ms` }}
                                >
                                  {/* 选择框 */}
                                  <div className="absolute top-3 left-3 z-10">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleSelect(font.name)}
                                      className="w-4 h-4 rounded border-border-default text-primary-600 focus:ring-primary-500"
                                    />
                                  </div>
              
                                  {/* 操作按钮 */}
                                  <div className="absolute top-3 right-3 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {canDownloadFonts && (
                                      <button
                                        onClick={() => handleDownload(font.name)}
                                        className="p-1.5 rounded-lg bg-bg-elevated text-text-tertiary hover:text-primary-600 shadow-sm transition-all"
                                        title="下载"
                                      >
                                        <Download size={16} />
                                      </button>
                                    )}
                                    {canDeleteFonts && (
                                      <button
                                        onClick={() => handleDelete(font.name)}
                                        className="p-1.5 rounded-lg bg-bg-elevated text-text-tertiary hover:text-error shadow-sm transition-all"
                                        title="删除"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    )}
                                  </div>
              
                                  {/* 内容 */}
                                  <div className="pt-8 pb-4 text-center">
                                    <div 
                                      className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                                      style={{ 
                                        backgroundColor: `${typeInfo.color}15`,
                                      }}
                                    >
                                      <IconComponent size={32} color={typeInfo.color} />
                                    </div>
                                    <h3 className="font-medium text-text-primary mb-1 truncate px-4" title={font.name}>
                                      <FileNameText>{font.name}</FileNameText>
                                    </h3>
                                    <div className="flex items-center justify-center gap-3 text-xs text-text-tertiary">
                                      <span 
                                        className="px-2 py-0.5 rounded-full font-medium"
                                        style={{ 
                                          backgroundColor: `${typeInfo.color}20`,
                                          color: typeInfo.color 
                                        }}
                                      >
                                        {typeInfo.label}
                                      </span>
                                      <span>{formatFileSize(font.size)}</span>
                                    </div>
                                    <p className="text-xs text-text-muted mt-3">
                                      {formatDate(font.createdAt)}
                                    </p>
                                  </div>
                                </div>
                              );
                            })            )}
          </div>
        )}

        {/* 字体列表 - 列表视图 */}
        {viewMode === 'list' && (
          <div className="table-container-theme">
            <table className="table-theme">
              <thead>
                <tr>
                  <th className="w-10 px-4">
                    <input
                      type="checkbox"
                      checked={selectedFonts.size === fonts.length && fonts.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-border-default text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                  <th>字体文件</th>
                  <th className="w-24">格式</th>
                  <th className="w-28">大小</th>
                  <th className="w-36">修改时间</th>
                  <th className="w-24 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <div className="flex items-center justify-center gap-3 text-text-tertiary">
                        <div className="animate-spin w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full" />
                        加载中...
                      </div>
                    </td>
                  </tr>
                ) : fonts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-bg-tertiary flex items-center justify-center">
                        <div className="relative">
                          <FolderOpen size={32} className="text-text-muted" />
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center">
                            <Type size={10} className="text-primary-600" />
                          </div>
                        </div>
                      </div>
                      <p className="text-text-tertiary">暂无数据</p>
                    </td>
                  </tr>
                ) : (
                  fonts.map((font) => {
                    const typeInfo = getFontIcon(font.extension);
                    const isSelected = selectedFonts.has(font.name);
                    const IconComponent = typeInfo.Icon;
                    return (
                      <tr 
                        key={font.name}
                        className={`transition-colors ${isSelected ? 'bg-primary-50/50' : ''}`}
                      >
                        <td className="px-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelect(font.name)}
                            className="w-4 h-4 rounded border-border-default text-primary-600 focus:ring-primary-500"
                          />
                        </td>
                        <td>
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-10 h-10 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: `${typeInfo.color}15` }}
                            >
                              <IconComponent size={20} color={typeInfo.color} />
                            </div>
                            <div>
                              <p className="font-medium text-text-primary">
                                <FileNameText>{font.name}</FileNameText>
                              </p>
                              <p className="text-xs text-text-muted">{font.creator || '系统管理员'}</p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span 
                            className="inline-flex px-2 py-1 rounded-full text-xs font-medium"
                            style={{ 
                              backgroundColor: `${typeInfo.color}20`,
                              color: typeInfo.color 
                            }}
                          >
                            {typeInfo.label}
                          </span>
                        </td>
                        <td className="text-text-secondary">{formatFileSize(font.size)}</td>
                        <td className="text-text-tertiary text-sm">{formatDate(font.createdAt)}</td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canDownloadFonts && (
                              <button
                                onClick={() => handleDownload(font.name)}
                                className="p-2 rounded-lg text-text-tertiary hover:text-primary-600 hover:bg-primary-50 transition-all"
                                title="下载"
                              >
                                <Download size={16} />
                              </button>
                            )}
                            {canDeleteFonts && (
                              <button
                                onClick={() => handleDelete(font.name)}
                                className="p-2 rounded-lg text-text-tertiary hover:text-error hover:bg-error-dim transition-all"
                                title="删除"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 底部统计 */}
        <div className="mt-6 text-center text-sm text-text-tertiary">
          共 <span className="text-text-primary font-medium">{fonts.length}</span> 个字体文件
          {filters.name && ` · 搜索 "${filters.name}"`}
          {filters.extension && ` · 格式 ${filters.extension}`}
        </div>

        {/* 上传模态框 */}
        {showUploadModal && (
          <UploadFontModal
            onClose={() => setShowUploadModal(false)}
            onSuccess={() => {
              setShowUploadModal(false);
              fetchFonts();
            }}
            defaultTarget={activeTab}
          />
        )}
      </div>
    </div>
  );
}

// 上传字体模态框组件
interface UploadFontModalProps {
  onClose: () => void;
  onSuccess: () => void;
  defaultTarget?: 'backend' | 'frontend' | 'both';
}

function UploadFontModal({
  onClose,
  onSuccess,
  defaultTarget = 'both',
}: UploadFontModalProps) {
  const { showToast } = useNotification();
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<'backend' | 'frontend' | 'both'>(
    defaultTarget
  );
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFileChange = (selectedFile: File | null) => {
    if (!selectedFile) return;

    // 验证文件类型
    const validExtensions = [
      '.ttf', '.otf', '.woff', '.woff2', '.eot', '.ttc', '.shx',
    ];
    const ext = '.' + selectedFile.name.split('.').pop()?.toLowerCase();

    if (!validExtensions.includes(ext)) {
      showToast('不支持的文件类型，请上传字体文件', 'warning');
      return;
    }

    // 验证文件大小（10MB）
    if (selectedFile.size > 10 * 1024 * 1024) {
      showToast('文件大小不能超过 10MB', 'warning');
      return;
    }

    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) {
      showToast('请选择文件', 'warning');
      return;
    }

    setUploading(true);
    try {
      await fontsApi.uploadFont(file, target);
      showToast('上传成功', 'success');
      onSuccess();
    } catch (error) {
      console.error('上传失败:', error);
      showToast('上传失败', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    handleFileChange(droppedFile ?? null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay-theme animate-fade-in">
      <div 
        className="absolute inset-0"
        onClick={onClose}
      />
      <div 
        className="relative w-full max-w-lg modal-theme animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-default">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <Upload size={20} className="text-primary-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">上传字体</h2>
              <p className="text-sm text-text-tertiary">支持 TTF、OTF、WOFF 等格式</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6">
          {/* 文件上传区域 */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              dragOver 
                ? 'border-primary-500 bg-primary-50' 
                : file 
                  ? 'border-success bg-success-light' 
                  : 'border-border-default hover:border-border-strong bg-bg-tertiary/50'
            }`}
          >
            <input
              type="file"
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
              accept=".ttf,.otf,.woff,.woff2,.eot,.ttc,.shx"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            
            {file ? (
              <div className="animate-scale-in">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-success/20 flex items-center justify-center">
                  <Palette size={32} className="text-success" />
                </div>
                <h3 className="font-medium text-text-primary mb-1">
                  <FileNameText>{file.name}</FileNameText>
                </h3>
                <p className="text-sm text-text-tertiary">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                  className="mt-3 text-sm text-error hover:underline"
                >
                  移除文件
                </button>
              </div>
            ) : (
              <div>
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-bg-tertiary flex items-center justify-center">
                  <div className="relative">
                    <Upload size={32} className="text-text-muted" />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">T</span>
                    </div>
                  </div>
                </div>
                <h3 className="font-medium text-text-primary mb-1">
                  点击或拖拽文件到此处
                </h3>
                <p className="text-sm text-text-tertiary">
                  支持 TTF、OTF、WOFF、WOFF2、EOT、TTC、SHX
                </p>
                <p className="text-xs text-text-muted mt-2">最大 10MB</p>
              </div>
            )}
          </div>

          {/* 上传目标选择 */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-3">
              上传位置
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'both', label: '同时上传', desc: '后端和前端', icon: <HardDrive size={16} /> },
                { value: 'backend', label: '仅后端', desc: '转换程序', icon: <HardDrive size={16} /> },
                { value: 'frontend', label: '仅前端', desc: 'Web 显示', icon: <Type size={16} /> },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTarget(option.value as 'backend' | 'frontend' | 'both')}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    target === option.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-border-default hover:border-border-strong bg-bg-secondary'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${
                    target === option.value ? 'bg-primary-100 text-primary-600' : 'bg-bg-tertiary text-text-tertiary'
                  }`}>
                    {option.icon}
                  </div>
                  <p className={`font-medium text-sm ${target === option.value ? 'text-text-primary' : 'text-text-secondary'}`}>
                    {option.label}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">{option.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-default">
          <button
            onClick={onClose}
            disabled={uploading}
            className="btn-secondary"
          >
            取消
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                上传中...
              </>
            ) : (
              <>
                <Upload size={18} />
                上传
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}