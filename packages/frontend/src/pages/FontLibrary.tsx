import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fontsControllerGetFonts,
  fontsControllerUploadFont,
  fontsControllerDeleteFont,
  fontsControllerDownloadFont,
} from '@/api-sdk';
import {
  Trash2,
  Download,
  Upload,
  Search,
  Filter,
  FileType,
  Calendar,
  HardDrive,
  Type,
  X,
  ChevronDown,
  FileText,
  FileCode,
  FileDigit,
  FileBox,
  FolderOpen,
  Layers,
  Palette,
  Shapes,
} from 'lucide-react';
import { Button, Input, Select, Tab, Tabs, Tag } from '@/components/ui';
import { SearchInput } from '@/components/search/SearchInput';
import { ViewToggle } from '@/components/common/ViewToggle';
import { FileNameText } from '../components/ui/TruncateText';
import type { FontInfo } from '../types/filesystem';
import type { TagVariant } from '@/components/ui/Tag';
import { usePermission } from '../hooks/usePermission';
import { useNotification } from '../contexts/NotificationContext';
import { getErrorMessage } from '../utils/errorHandler';
import { SystemPermission } from '../constants/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

interface FontLibraryProps {}

// 字体文件类型配置 - 使用颜色和 lucide 图标
const FONT_TYPES = [
  { value: '', label: '全部格式', color: '#6366f1', Icon: FolderOpen },
  { value: '.ttf', label: 'TTF', color: '#22c55e', Icon: Type },
  { value: '.otf', label: 'OTF', color: '#009cff', Icon: FileText },
  { value: '.woff', label: 'WOFF', color: '#f59e0b', Icon: FileBox },
  { value: '.woff2', label: 'WOFF2', color: '#f97316', Icon: FileBox },
  { value: '.eot', label: 'EOT', color: '#6366f1', Icon: FileDigit },
  { value: '.ttc', label: 'TTC', color: '#ec4899', Icon: Layers },
  { value: '.shx', label: 'SHX', color: '#06b6d4', Icon: Shapes },
];

const fontTypeVariants: Record<string, TagVariant> = {
  '.ttf': 'success',
  '.otf': 'info',
  '.woff': 'warning',
  '.woff2': 'warning',
  '.eot': 'primary',
  '.ttc': 'error',
  '.shx': 'info',
};

const getFontTypeVariant = (extension: string): TagVariant => {
  return fontTypeVariants[extension.toLowerCase()] || 'primary';
};

// 字体类型图标映射
const getFontIcon = (
  extension: string
): {
  color: string;
  label: string;
  Icon: React.ComponentType<{
    size?: number;
    className?: string;
    style?: React.CSSProperties;
  }>;
} => {
  const type = FONT_TYPES.find((t) => t.value === extension.toLowerCase());
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
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'createdAt'>(
    'createdAt'
  );
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
      const { data: fontsApiResult } = await fontsControllerGetFonts({
        query: { location: activeTab },
      });
      const raw: unknown = fontsApiResult;
      let fontList: FontInfo[] = [];
      if (
        raw &&
        typeof raw === 'object' &&
        !Array.isArray(raw) &&
        'data' in raw
      ) {
        const wrapped = (raw as Record<string, unknown>).data;
        fontList = Array.isArray(wrapped) ? (wrapped as FontInfo[]) : [];
      } else if (Array.isArray(raw)) {
        fontList = raw as FontInfo[];
      }

      setAllFonts(fontList);
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
        (font) =>
          font.extension.toLowerCase() === filters.extension.toLowerCase()
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
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            无访问权限
          </h2>
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
      const { error } = await fontsControllerDeleteFont({
        path: { fileName: fontName },
        query: { target: activeTab },
      });
      if (error) {
        showToast(getErrorMessage(error), 'error');
        return;
      }
      await fetchFonts();
      setSelectedFonts((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fontName);
        return newSet;
      });
      showToast('删除成功', 'success');
    } catch (error) {
      console.error('删除字体失败:', error);
      showToast(getErrorMessage(error), 'error');
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
      const { fontsControllerBatchDeleteFonts } = await import('@/api-sdk');
      const { data, error } = await fontsControllerBatchDeleteFonts({
        body: {
          fileNames: Array.from(selectedFonts) as string[],
          target: activeTab as 'backend' | 'frontend' | 'both' | undefined,
        },
        throwOnError: false,
      });
      if (error) throw error;
      const result = data as unknown as {
        successCount: number;
        failedCount: number;
      };
      if (result.failedCount > 0) {
        showToast(
          `成功删除 ${result.successCount} 个，${result.failedCount} 个失败`,
          'warning'
        );
      } else {
        showToast('批量删除成功', 'success');
      }
      setSelectedFonts(new Set());
      await fetchFonts();
    } catch (error) {
      console.error('批量删除失败:', error);
      showToast(getErrorMessage(error), 'error');
    }
  };

  // 下载字体
  const handleDownload = async (fontName: string) => {
    try {
      const { data, response } = await fontsControllerDownloadFont({
        path: { fileName: fontName },
        query: { location: activeTab },
      });
      // 适配多种响应格式：优先使用 response.data（Axios），其次 data 字段，最后直接使用 data
      let blob: Blob;
      if (response && (response as any).data instanceof Blob) {
        blob = (response as any).data;
      } else if (data instanceof Blob) {
        blob = data;
      } else {
        throw new Error('无法获取字体文件数据');
      }
      const url = window.URL.createObjectURL(blob);
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
      showToast(getErrorMessage(error), 'error');
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
    const typeCount = new Set(fonts.map((f) => f.extension.toLowerCase())).size;
    return { count: fonts.length, totalSize, typeCount };
  }, [fonts]);

  return (
    <div className="page-content-theme min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* 页面头部 */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-text-primary mb-1">
                字体库管理
              </h1>
              <p className="text-text-tertiary text-sm">
                管理和维护 CAD 字体文件
              </p>
            </div>
            {canUploadFonts && (
              <Button icon={Upload} onClick={() => setShowUploadModal(true)}>
                上传字体
              </Button>
            )}
          </div>

          {/* 统计卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="card-theme flex items-center gap-4 group">
              <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Palette size={24} className="text-primary-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">
                  {stats.count}
                </p>
                <p className="text-sm text-text-tertiary">字体总数</p>
              </div>
            </div>
            <div className="card-theme flex items-center gap-4 group">
              <div className="w-12 h-12 rounded-xl bg-accent-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                <HardDrive size={24} className="text-accent-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">
                  {formatFileSize(stats.totalSize)}
                </p>
                <p className="text-sm text-text-tertiary">总存储</p>
              </div>
            </div>
            <div className="card-theme flex items-center gap-4 group">
              <div className="w-12 h-12 rounded-xl bg-success-dim flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileCode size={24} className="text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">
                  {stats.typeCount}
                </p>
                <p className="text-sm text-text-tertiary">格式种类</p>
              </div>
            </div>
          </div>
        </div>

        {/* 标签页切换 */}
        <Tabs className="mb-6">
          <Tab
            active={activeTab === 'backend'}
            icon={HardDrive}
            onClick={() => {
              setActiveTab('backend');
              setSelectedFonts(new Set());
            }}
          >
            后端字体（转换程序）
          </Tab>
          <Tab
            active={activeTab === 'frontend'}
            icon={Type}
            onClick={() => {
              setActiveTab('frontend');
              setSelectedFonts(new Set());
            }}
          >
            前端字体（资源目录）
          </Tab>
        </Tabs>

        {/* 筛选和搜索栏 */}
        <div className="card-theme mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* 搜索框 */}
            <div className="flex-1 min-w-[240px]">
              <SearchInput
                placeholder="搜索字体名称..."
                value={filters.name}
                onChange={(e) => handleFilterChange('name', e.target.value)}
              />
            </div>

            {/* 格式筛选 */}
            <div className="w-40">
              <Select
                value={filters.extension}
                onChange={(val) => handleFilterChange('extension', val)}
                options={FONT_TYPES.map((t) => ({
                  value: t.value,
                  label: t.label,
                }))}
              />
            </div>

            {/* 展开筛选按钮 */}
            <Button
              variant="secondary"
              icon={Filter}
              onClick={() => setShowFilters(!showFilters)}
            >
              筛选
              <ChevronDown
                size={14}
                className={`transition-transform ${showFilters ? 'rotate-180' : ''}`}
              />
            </Button>

            {/* 重置按钮 */}
            {(filters.name ||
              filters.extension ||
              filters.startTime ||
              filters.endTime) && (
              <Button variant="secondary" icon={X} onClick={handleReset}>
                清除
              </Button>
            )}

            {/* 视图切换 */}
            <div className="ml-auto">
              <ViewToggle viewMode={viewMode} onChange={setViewMode} />
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
                  <Input
                    type="date"
                    value={filters.startTime}
                    onChange={(e) =>
                      handleFilterChange('startTime', e.target.value)
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    <Calendar size={14} className="inline mr-1" />
                    结束日期
                  </label>
                  <Input
                    type="date"
                    value={filters.endTime}
                    onChange={(e) =>
                      handleFilterChange('endTime', e.target.value)
                    }
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
                checked={
                  selectedFonts.size === fonts.length && fonts.length > 0
                }
                onChange={handleSelectAll}
                className="w-4 h-4 rounded border-border-default text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-text-secondary">
                已选择{' '}
                <span className="font-semibold text-text-primary">
                  {selectedFonts.size}
                </span>{' '}
                个字体
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="xs"
                onClick={() => setSelectedFonts(new Set())}
              >
                取消选择
              </Button>
              {canDeleteFonts && (
                <Button
                  variant="danger"
                  icon={Trash2}
                  onClick={handleBatchDelete}
                >
                  批量删除
                </Button>
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
            <Button
              variant="secondary"
              size="xs"
              key={key}
              onClick={() => handleSort(key as 'name' | 'size' | 'createdAt')}
              className={
                sortBy === key ? 'text-[var(--primary-500)] font-medium' : ''
              }
            >
              {label}
              {sortBy === key && (
                <ChevronDown
                  size={14}
                  className={`transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`}
                />
              )}
            </Button>
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
                <h3 className="text-lg font-medium text-text-primary mb-1">
                  暂无字体
                </h3>
                <p className="text-text-tertiary text-sm mb-4">
                  {filters.name || filters.extension
                    ? '没有找到匹配的字体'
                    : '当前位置没有字体文件'}
                </p>
                {canUploadFonts && !filters.name && !filters.extension && (
                  <Button
                    icon={Upload}
                    onClick={() => setShowUploadModal(true)}
                  >
                    上传第一个字体
                  </Button>
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
                        <Button
                          variant="secondary"
                          icon={Download}
                          onClick={() => handleDownload(font.name)}
                          tooltip="下载"
                        />
                      )}
                      {canDeleteFonts && (
                        <Button
                          variant="secondary"
                          icon={Trash2}
                          onClick={() => handleDelete(font.name)}
                          tooltip="删除"
                        />
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
                        <IconComponent
                          size={32}
                          style={{ color: typeInfo.color }}
                        />
                      </div>
                      <h3
                        className="font-medium text-text-primary mb-1 px-4"
                        title={font.name}
                      >
                        <FileNameText className="justify-center">
                          {font.name}
                        </FileNameText>
                      </h3>
                      <div className="flex items-center justify-center gap-3 text-xs text-text-tertiary">
                        <Tag variant={getFontTypeVariant(font.extension)}>
                          {typeInfo.label}
                        </Tag>
                        <span>{formatFileSize(font.size)}</span>
                      </div>
                      <p className="text-xs text-text-muted mt-3">
                        {formatDate(font.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
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
                      checked={
                        selectedFonts.size === fonts.length && fonts.length > 0
                      }
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
                              <IconComponent
                                size={20}
                                style={{ color: typeInfo.color }}
                              />
                            </div>
                            <div>
                              <p className="font-medium text-text-primary">
                                <FileNameText>{font.name}</FileNameText>
                              </p>
                              <p className="text-xs text-text-muted">
                                {font.creator || '系统管理员'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <Tag variant={getFontTypeVariant(font.extension)}>
                            {typeInfo.label}
                          </Tag>
                        </td>
                        <td className="text-text-secondary">
                          {formatFileSize(font.size)}
                        </td>
                        <td className="text-text-tertiary text-sm">
                          {formatDate(font.createdAt)}
                        </td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canDownloadFonts && (
                              <Button
                                variant="secondary"
                                icon={Download}
                                onClick={() => handleDownload(font.name)}
                                tooltip="下载"
                              />
                            )}
                            {canDeleteFonts && (
                              <Button
                                variant="secondary"
                                icon={Trash2}
                                onClick={() => handleDelete(font.name)}
                                tooltip="删除"
                              />
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
          共{' '}
          <span className="text-text-primary font-medium">{fonts.length}</span>{' '}
          个字体文件
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
      '.ttf',
      '.otf',
      '.woff',
      '.woff2',
      '.eot',
      '.ttc',
      '.shx',
    ];
    const ext = '.' + selectedFile.name.split('.').pop()?.toLowerCase();

    if (!validExtensions.includes(ext)) {
      showToast('不支持的文件类型，请上传字体文件', 'warning');
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
      const formData = new FormData();
      formData.append('file', file);
      formData.append('target', target);
      await fontsControllerUploadFont({ body: formData as any });
      showToast('上传成功', 'success');
      onSuccess();
    } catch (error) {
      console.error('上传失败:', error);
      showToast(getErrorMessage(error), 'error');
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
      <div className="absolute inset-0" onClick={onClose} />
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
              <h2 className="text-lg font-semibold text-text-primary">
                上传字体
              </h2>
              <p className="text-sm text-text-tertiary">
                支持 TTF、OTF、WOFF 等格式
              </p>
            </div>
          </div>
          <Button variant="secondary" icon={X} onClick={onClose} tooltip="关闭" />
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
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                  className="mt-3 text-error"
                >
                  移除文件
                </Button>
              </div>
            ) : (
              <div>
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-bg-tertiary flex items-center justify-center">
                  <div className="relative">
                    <Upload size={32} className="text-text-muted" />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">
                        T
                      </span>
                    </div>
                  </div>
                </div>
                <h3 className="font-medium text-text-primary mb-1">
                  点击或拖拽文件到此处
                </h3>
                <p className="text-sm text-text-tertiary">
                  支持 TTF、OTF、WOFF、WOFF2、EOT、TTC、SHX
                </p>
              </div>
            )}
          </div>

          {/* 上传目标选择 */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-3">
              上传位置
            </label>
            <Select
              value={target}
              onChange={(val) =>
                setTarget(val as 'backend' | 'frontend' | 'both')
              }
              options={[
                { value: 'both', label: '同时上传（后端和前端）' },
                { value: 'backend', label: '仅后端（转换程序）' },
                { value: 'frontend', label: '仅前端（Web 显示）' },
              ]}
            />
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-default">
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            取消
          </Button>
          <Button
            icon={Upload}
            loading={uploading}
            disabled={!file}
            onClick={handleUpload}
          >
            {uploading ? '上传中...' : '上传'}
          </Button>
        </div>
      </div>
    </div>
  );
}
