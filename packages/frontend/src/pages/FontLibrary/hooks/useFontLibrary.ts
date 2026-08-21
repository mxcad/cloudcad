import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fontsControllerGetFonts,
  fontsControllerDeleteFont,
  fontsControllerDownloadFont,
} from '@/api-sdk';
import { useFileBrowserSelection } from '@/hooks/file-browser';
import { usePermission } from '../../../hooks/usePermission';
import { useNotification } from '../../../contexts/NotificationContext';
import { getErrorMessage } from '../../../utils/errorHandler';
import { SystemPermission } from '../../../constants/permissions';
import { triggerBlobDownload } from '../../../utils/download';
import { t } from '@/languages';
import type { FontInfo } from '../../../types/filesystem';

export interface FontFilters {
  name: string;
  extension: string;
}

export interface UseFontLibraryReturn {
  allFonts: FontInfo[];
  fonts: FontInfo[];
  loading: boolean;
  activeTab: 'backend' | 'frontend';
  filters: FontFilters;
  sortBy: 'name' | 'size' | 'createdAt';
  sortOrder: 'asc' | 'desc';
  viewMode: 'grid' | 'list';
  showUploadModal: boolean;
  selectedFonts: Set<string>;
  canReadFonts: boolean;
  canUploadFonts: boolean;
  canDeleteFonts: boolean;
  canDownloadFonts: boolean;
  stats: { count: number; totalSize: number; typeCount: number };
  setActiveTab: (tab: 'backend' | 'frontend') => void;
  handleFilterChange: (key: string, value: string) => void;
  handleReset: () => void;
  handleSort: (field: 'name' | 'size' | 'createdAt') => void;
  handleSelect: (
    fontName: string,
    ctrlKey?: boolean,
    shiftKey?: boolean
  ) => void;
  handleSelectAll: () => void;
  clearSelection: () => void;
  selectMany: (fontNames: string[]) => void;
  handleDelete: (fontName: string) => Promise<void>;
  handleBatchDelete: () => Promise<void>;
  handleDownload: (fontName: string) => Promise<void>;
  setShowUploadModal: (open: boolean) => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  fetchFonts: () => Promise<void>;
  formatDate: (date: string | Date) => string;
}

export function useFontLibrary(): UseFontLibraryReturn {
  const { hasPermission } = usePermission();
  const { showToast, showConfirm } = useNotification();

  const [allFonts, setAllFonts] = useState<FontInfo[]>([]);
  const [fonts, setFonts] = useState<FontInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'backend' | 'frontend'>('backend');

  const [filters, setFilters] = useState<FontFilters>({
    name: '',
    extension: '',
  });

  const [sortBy, setSortBy] = useState<'name' | 'size' | 'createdAt'>(
    'createdAt'
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showUploadModal, setShowUploadModal] = useState(false);

  // 选择模型：复用文件系统多选内核（以字体名作为 id），支持
  // Ctrl 切换 / Shift 区间 / 全选 toggle / 框选注入（selectMany）
  const selectableFonts = useMemo(
    () => fonts.map((f) => ({ id: f.name })),
    [fonts]
  );
  const {
    selectedNodes: selectedFonts,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectMany,
    deselectNode,
  } = useFileBrowserSelection({
    nodes: selectableFonts,
    multiple: 'always',
  });

  const canReadFonts = hasPermission(SystemPermission.SYSTEM_FONT_READ);
  const canUploadFonts = hasPermission(SystemPermission.SYSTEM_FONT_UPLOAD);
  const canDeleteFonts = hasPermission(SystemPermission.SYSTEM_FONT_DELETE);
  const canDownloadFonts = hasPermission(SystemPermission.SYSTEM_FONT_DOWNLOAD);

  const fetchFonts = useCallback(async () => {
    if (!canReadFonts) return;
    setLoading(true);
    try {
      const result = await fontsControllerGetFonts({
        query: { location: activeTab },
      });
      // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 catch 记录真实原因
      if (result.error) throw result.error;
      const fontsApiResult = result.data;
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

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setFilters({
      name: '',
      extension: '',
    });
  };

  const handleSort = (field: 'name' | 'size' | 'createdAt') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleSelect = useCallback(
    (fontName: string, ctrlKey = false, shiftKey = false) => {
      handleNodeSelect(fontName, ctrlKey, shiftKey);
    },
    [handleNodeSelect]
  );

  const handleDelete = async (fontName: string) => {
    const confirmed = await showConfirm({
      title: t('确认删除'),
      message: t('确定要删除字体 {name} 吗？', { name: fontName }),
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
      // 从选中集移除已删除字体（保留其余选中）
      deselectNode(fontName);
      showToast(t('删除成功'), 'success');
    } catch (error) {
      console.error('删除字体失败:', error);
      showToast(getErrorMessage(error), 'error');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedFonts.size === 0) {
      showToast(t('请先选择要删除的字体'), 'warning');
      return;
    }

    const confirmed = await showConfirm({
      title: t('确认批量删除'),
      message: t('确定要删除选中的 {count} 个字体吗？', {
        count: String(selectedFonts.size),
      }),
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
          t('成功删除 {successCount} 个，{failedCount} 个失败', {
            successCount: String(result.successCount),
            failedCount: String(result.failedCount),
          }),
          'warning'
        );
      } else {
        showToast(t('批量删除成功'), 'success');
      }
      clearSelection();
      await fetchFonts();
    } catch (error) {
      console.error('批量删除失败:', error);
      showToast(getErrorMessage(error), 'error');
    }
  };

  const handleDownload = async (fontName: string) => {
    try {
      const { data, response } = await fontsControllerDownloadFont({
        path: { fileName: fontName },
        query: { location: activeTab },
      });
      let blob: Blob;
      if (response && (response as any).data instanceof Blob) {
        blob = (response as any).data;
      } else if (data instanceof Blob) {
        blob = data;
      } else {
        throw new Error(t('无法获取字体文件数据'));
      }
      triggerBlobDownload(blob, fontName);
      showToast(t('下载成功'), 'success');
    } catch (error) {
      console.error('下载字体失败:', error);
      showToast(getErrorMessage(error), 'error');
    }
  };

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

  const stats = useMemo(() => {
    const totalSize = fonts.reduce((sum, f) => sum + f.size, 0);
    const typeCount = new Set(fonts.map((f) => f.extension.toLowerCase())).size;
    return { count: fonts.length, totalSize, typeCount };
  }, [fonts]);

  return {
    allFonts,
    fonts,
    loading,
    activeTab,
    filters,
    sortBy,
    sortOrder,
    viewMode,
    showUploadModal,
    selectedFonts,
    canReadFonts,
    canUploadFonts,
    canDeleteFonts,
    canDownloadFonts,
    stats,
    setActiveTab,
    handleFilterChange,
    handleReset,
    handleSort,
    handleSelect,
    handleSelectAll,
    clearSelection,
    selectMany,
    handleDelete,
    handleBatchDelete,
    handleDownload,
    setShowUploadModal,
    setViewMode,
    fetchFonts,
    formatDate,
  };
}
