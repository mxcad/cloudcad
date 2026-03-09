/**
 * 图库管理 Hook
 * 提供图库分类选择、文件列表加载、分页等通用功能
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { galleryApi } from '../services/galleryApi';
import { GALLERY_CONFIG, PAGINATION_CONFIG } from '../constants/appConfig';
import { getErrorMessage } from '../utils/errorHandler';

// 类型定义
export type GalleryType = 'drawings' | 'blocks';

export interface GalleryTypeData {
  id: number;
  pid: number;
  name: string;
  pname: string;
  status: number;
}

export interface GalleryFile {
  uuid: string;
  filename: string;
  firstType: number;
  secondType: number;
  nodeId: string;
  type: string;
  lookNum?: number;
  likeNum?: number;
}

export interface PaginationInfo {
  index: number;
  size: number;
  count: number;
  max: number;
  up: boolean;
  down: boolean;
}

// Hook 配置选项
export interface UseGalleryOptions {
  /** 图库类型，默认 'drawings' */
  initialGalleryType?: GalleryType;
  /** 是否在挂载时自动加载分类，默认 true */
  autoLoadTypes?: boolean;
  /** 是否启用文件列表功能，默认 false（仅分类选择模式） */
  enableFileList?: boolean;
  /** 显示 toast 的函数 */
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
  /** 显示确认框的函数 */
  showConfirm?: (options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
  }) => Promise<boolean>;
}

// Hook 返回值
export interface UseGalleryReturn {
  // ===== 状态 =====
  galleryType: GalleryType;
  types: GalleryTypeData[];
  loading: boolean;
  selectedFirstType: number;
  selectedSecondType: number;
  selectedThirdType: number;

  // 文件列表相关状态
  files: GalleryFile[];
  pagination: PaginationInfo | null;
  pageIndex: number;
  searchKeyword: string;

  // ===== 派生数据 =====
  firstLevelTypes: GalleryTypeData[];
  secondLevelTypes: GalleryTypeData[];
  thirdLevelTypes: GalleryTypeData[];
  selectedFirstTypeData: GalleryTypeData | undefined;
  selectedSecondTypeData: GalleryTypeData | undefined;

  // ===== 方法 =====
  setGalleryType: (type: GalleryType) => void;
  setSelectedFirstType: (typeId: number) => void;
  setSelectedSecondType: (typeId: number) => void;
  setSelectedThirdType: (typeId: number) => void;
  setSearchKeyword: (keyword: string) => void;

  fetchTypes: () => Promise<void>;
  fetchFiles: (index?: number) => Promise<void>;
  handleSearch: () => void;
  handlePreviousPage: () => void;
  handleNextPage: () => void;

  // 工具方法
  getPreviewImageUrl: (file: GalleryFile) => string;
  resetTypeSelection: () => void;
  removeFromGallery: (file: GalleryFile) => Promise<boolean>;
}

/**
 * 图库管理 Hook
 */
export function useGallery(options: UseGalleryOptions = {}): UseGalleryReturn {
  const {
    initialGalleryType = 'drawings',
    autoLoadTypes = true,
    enableFileList = false,
    showToast,
    showConfirm,
  } = options;

  // ===== 状态 =====
  const [galleryType, setGalleryType] = useState<GalleryType>(initialGalleryType);
  const [types, setTypes] = useState<GalleryTypeData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFirstType, setSelectedFirstType] = useState<number>(-1);
  const [selectedSecondType, setSelectedSecondType] = useState<number>(-1);
  const [selectedThirdType, setSelectedThirdType] = useState<number>(-1);

  // 文件列表相关状态
  const [files, setFiles] = useState<GalleryFile[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');

  // ===== 派生数据 =====
  const firstLevelTypes = useMemo(
    () => types.filter((t) => t.pid === 0),
    [types]
  );
  const secondLevelTypes = useMemo(
    () => types.filter((t) => t.pid === selectedFirstType),
    [types, selectedFirstType]
  );
  const thirdLevelTypes = useMemo(
    () => types.filter((t) => t.pid === selectedSecondType),
    [types, selectedSecondType]
  );
  const selectedFirstTypeData = useMemo(
    () => firstLevelTypes.find((t) => t.id === selectedFirstType),
    [firstLevelTypes, selectedFirstType]
  );
  const selectedSecondTypeData = useMemo(
    () => secondLevelTypes.find((t) => t.id === selectedSecondType),
    [secondLevelTypes, selectedSecondType]
  );

  // ===== 方法 =====

  /**
   * 获取分类列表
   */
  const fetchTypes = useCallback(async () => {
    try {
      setLoading(true);
      const response =
        galleryType === 'drawings'
          ? await galleryApi.getDrawingsTypes()
          : await galleryApi.getBlocksTypes();
      setTypes(response.data?.allblocks || []);
    } catch (error) {
      const message = getErrorMessage(error);
      showToast?.(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [galleryType, showToast]);

  /**
   * 获取文件列表
   */
  const fetchFiles = useCallback(
    async (index: number = pageIndex) => {
      if (!enableFileList) return;

      try {
        setLoading(true);
        const queryParams = {
          keywords: searchKeyword || undefined,
          firstType: selectedFirstType === -1 ? undefined : selectedFirstType,
          secondType: selectedSecondType === -1 ? undefined : selectedSecondType,
          thirdType: selectedThirdType === -1 ? undefined : selectedThirdType,
          pageIndex: index,
          pageSize: GALLERY_CONFIG.DEFAULT_PAGE_SIZE,
        };

        const response =
          galleryType === 'drawings'
            ? await galleryApi.getDrawingsFileList(queryParams)
            : await galleryApi.getBlocksFileList(queryParams);

        const responseData = response.data as {
          sharedwgs?: GalleryFile[];
          page?: PaginationInfo;
        };
        setFiles(responseData.sharedwgs || []);
        setPagination(
          responseData.page || PAGINATION_CONFIG.DEFAULT_PAGINATION
        );
        setPageIndex(index);
      } catch (error) {
        const message = getErrorMessage(error);
        showToast?.(message, 'error');
      } finally {
        setLoading(false);
      }
    },
    [
      enableFileList,
      pageIndex,
      searchKeyword,
      selectedFirstType,
      selectedSecondType,
      selectedThirdType,
      galleryType,
      showToast,
    ]
  );

  /**
   * 处理搜索
   */
  const handleSearch = useCallback(() => {
    fetchFiles(0);
  }, [fetchFiles]);

  /**
   * 上一页
   */
  const handlePreviousPage = useCallback(() => {
    if (pageIndex > 0) {
      fetchFiles(pageIndex - 1);
    }
  }, [pageIndex, fetchFiles]);

  /**
   * 下一页
   */
  const handleNextPage = useCallback(() => {
    if (pagination && pageIndex < pagination.max - 1) {
      fetchFiles(pageIndex + 1);
    }
  }, [pagination, pageIndex, fetchFiles]);

  /**
   * 获取预览图 URL
   */
  const getPreviewImageUrl = useCallback(
    (file: GalleryFile): string => {
      return galleryApi.getPreviewImageUrl(
        galleryType,
        file.secondType,
        file.firstType,
        file.nodeId
      );
    },
    [galleryType]
  );

  /**
   * 重置分类选择
   */
  const resetTypeSelection = useCallback(() => {
    setSelectedFirstType(-1);
    setSelectedSecondType(-1);
    setSelectedThirdType(-1);
  }, []);

  /**
   * 从图库移除文件
   */
  const removeFromGallery = useCallback(
    async (file: GalleryFile): Promise<boolean> => {
      if (!showConfirm || !showToast) return false;

      const confirmed = await showConfirm({
        title: '确认移除',
        message: `确定要从图库中移除 "${file.filename}" 吗？`,
        confirmText: '确认移除',
        cancelText: '取消',
      });

      if (!confirmed) return false;

      try {
        await galleryApi.removeFromGallery(galleryType, file.uuid);
        showToast('已从图库中移除', 'success');
        fetchFiles(pageIndex);
        return true;
      } catch (error) {
        const message = getErrorMessage(error);
        showToast(message, 'error');
        return false;
      }
    },
    [galleryType, showConfirm, showToast, fetchFiles, pageIndex]
  );

  // ===== 设置分类时的级联重置 =====
  const handleSetGalleryType = useCallback(
    (type: GalleryType) => {
      setGalleryType(type);
      resetTypeSelection();
      setFiles([]);
      setPagination(null);
      setPageIndex(0);
    },
    [resetTypeSelection]
  );

  const handleSetFirstType = useCallback((typeId: number) => {
    setSelectedFirstType(typeId);
    setSelectedSecondType(-1);
    setSelectedThirdType(-1);
  }, []);

  const handleSetSecondType = useCallback((typeId: number) => {
    setSelectedSecondType(typeId);
    setSelectedThirdType(-1);
  }, []);

  // ===== 自动加载 =====
  useEffect(() => {
    if (autoLoadTypes) {
      fetchTypes();
    }
  }, [autoLoadTypes, fetchTypes]);

  // 图库类型变化时重新加载
  useEffect(() => {
    if (enableFileList) {
      fetchFiles(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryType]);

  return {
    // 状态
    galleryType,
    types,
    loading,
    selectedFirstType,
    selectedSecondType,
    selectedThirdType,
    files,
    pagination,
    pageIndex,
    searchKeyword,

    // 派生数据
    firstLevelTypes,
    secondLevelTypes,
    thirdLevelTypes,
    selectedFirstTypeData,
    selectedSecondTypeData,

    // 方法
    setGalleryType: handleSetGalleryType,
    setSelectedFirstType: handleSetFirstType,
    setSelectedSecondType: handleSetSecondType,
    setSelectedThirdType,
    setSearchKeyword,
    fetchTypes,
    fetchFiles,
    handleSearch,
    handlePreviousPage,
    handleNextPage,
    getPreviewImageUrl,
    resetTypeSelection,
    removeFromGallery,
  };
}
