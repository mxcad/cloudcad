///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

/**
 * CADEditorSidebar - 图库侧边栏组件
 *
 * 显示图纸库/图块库内容，使用 ResourceList 统一组件
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { galleryApi } from '../services/galleryApi';
import { MxFun } from 'mxdraw';
import { useNotification } from '../contexts/NotificationContext';
import { ResourceList, ResourceItem, CategoryOption } from './common';
import type { GalleryTypeDto } from '../types/api-client';
import { GALLERY_CONFIG } from '../constants/appConfig';

// 图库类型
type GalleryType = 'drawings' | 'blocks';

// Gallery 文件列表响应
interface GalleryFileListResponse {
  sharedwgs: GalleryFile[];
  page: PaginationInfo;
}

// 图库文件接口
interface GalleryFile {
  uuid: string;
  filename: string;
  firstType: number;
  secondType: number;
  nodeId: string;
  type: string;
  lookNum: number;
  likeNum: number;
}

// 分页信息接口
interface PaginationInfo {
  index: number;
  size: number;
  count: number;
  max: number;
  up: boolean;
  down: boolean;
}

// 侧边栏属性
interface CADEditorSidebarProps {
  onInsertFile?: (file: Pick<GalleryFile, 'nodeId' | 'filename'>) => void;
  defaultGalleryType?: 'drawings' | 'blocks';
  showHeader?: boolean;
}

export const CADEditorSidebar: React.FC<CADEditorSidebarProps> = ({
  onInsertFile,
  defaultGalleryType = 'drawings',
  showHeader = true,
}) => {
  const { showToast, showConfirm } = useNotification();

  const [galleryType, setGalleryType] = useState<GalleryType>(defaultGalleryType);
  const [types, setTypes] = useState<GalleryTypeDto[]>([]);
  const [files, setFiles] = useState<GalleryFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedFirstType, setSelectedFirstType] = useState<number>(-1);
  const [selectedSecondType, setSelectedSecondType] = useState<number>(-1);
  const [selectedThirdType, setSelectedThirdType] = useState<number>(-1);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  // 监听外部传入的 defaultGalleryType 变化
  useEffect(() => {
    setGalleryType(defaultGalleryType);
  }, [defaultGalleryType]);

  // 获取分类列表
  const fetchTypes = useCallback(async () => {
    try {
      setLoading(true);
      const response =
        galleryType === 'drawings'
          ? await galleryApi.getDrawingsTypes()
          : await galleryApi.getBlocksTypes();
      setTypes(response.data?.allblocks || []);
    } catch (error) {
      console.error('获取分类列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [galleryType]);

  // 获取文件列表（支持追加模式）
  const fetchFiles = useCallback(
    async (index: number = pageIndex, append: boolean = false) => {
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

        const data = response.data as unknown as GalleryFileListResponse;
        if (data) {
          // 追加模式：保留已有数据
          if (append) {
            setFiles(prev => [...prev, ...(data.sharedwgs || [])]);
          } else {
            setFiles(data.sharedwgs || []);
          }
          setPagination(data.page);
          setPageIndex(index);
        }
      } catch (error) {
        console.error('获取文件列表失败:', error);
      } finally {
        setLoading(false);
      }
    },
    [
      galleryType,
      pageIndex,
      searchKeyword,
      selectedFirstType,
      selectedSecondType,
      selectedThirdType,
    ]
  );

  // 处理分类切换
  useEffect(() => {
    setTypes([]);
    setFiles([]);
    setSelectedFirstType(-1);
    setSelectedSecondType(-1);
    setPageIndex(0);
    fetchTypes();
  }, [galleryType, fetchTypes]);

  // 当分类或搜索关键词变化时，重新获取文件列表
  useEffect(() => {
    fetchFiles(0);
  }, [fetchFiles]);

  // 获取分类数据
  const categories = useMemo<CategoryOption[]>(() => {
    return types
      .filter((t) => t.pid === 0)
      .map((t) => ({
        id: t.id,
        name: t.name,
        children: types
          .filter((child) => child.pid === t.id)
          .map((child) => ({
            id: child.id,
            name: child.name,
            children: types
              .filter((grandchild) => grandchild.pid === child.id)
              .map((grandchild) => ({
                id: grandchild.id,
                name: grandchild.name,
              })),
          })),
      }));
  }, [types]);

  const subCategories = useMemo<CategoryOption[]>(() => {
    if (selectedFirstType === -1) return [];
    return (
      categories.find((c) => c.id === selectedFirstType)?.children || []
    );
  }, [categories, selectedFirstType]);

  const thirdCategories = useMemo<CategoryOption[]>(() => {
    if (selectedSecondType === -1) return [];
    return (
      subCategories.find((c) => c.id === selectedSecondType)?.children || []
    );
  }, [subCategories, selectedSecondType]);

  // 转换为 ResourceItem
  const resourceItems: ResourceItem[] = useMemo(() => {
    return files.map((file) => ({
      id: file.uuid,
      name: file.filename,
      type: 'file' as const,
      thumbnailUrl: galleryApi.getPreviewImageUrl(
        galleryType,
        file.secondType,
        file.firstType,
        file.nodeId
      ),
      meta: {
        type: file.type,
        views: file.lookNum,
      },
    }));
  }, [files, galleryType]);

  // 处理搜索
  const handleSearch = () => {
    setPageIndex(0);
    fetchFiles(0);
  };

  // 处理分类变化
  const handleCategoryChange = (id: number | string | null) => {
    setSelectedFirstType(id === null ? -1 : Number(id));
    setSelectedSecondType(-1);
    setSelectedThirdType(-1);
  };

  const handleSubCategoryChange = (id: number | string | null) => {
    setSelectedSecondType(id === null ? -1 : Number(id));
    setSelectedThirdType(-1);
  };

  const handleThirdCategoryChange = (id: number | string | null) => {
    setSelectedThirdType(id === null ? -1 : Number(id));
  };

  // 处理插入文件
  const handleInsertFile = async (file: GalleryFile) => {
    try {
      if (galleryType === 'blocks') {
        const mxwebFileUrl = await galleryApi.getMxwebFileUrlByNodeId(
          file.nodeId
        );
        MxFun.sendStringToExecute('Mx_Insert', {
          filePath: mxwebFileUrl,
          name: file.filename,
          hash: file.nodeId,
          isBlockLibrary: true,
        });
      } else {
        if (onInsertFile) {
          onInsertFile({
            nodeId: file.nodeId,
            filename: file.filename,
          });
        }
      }
    } catch (error) {
      console.error('操作失败:', error);
      showToast(
        `${galleryType === 'blocks' ? '插入图块' : '打开图纸'}失败: ${file.filename}`,
        'error'
      );
    }
  };

  // 处理从图库中移除文件
  const handleRemoveFromGallery = async (file: GalleryFile) => {
    const confirmed = await showConfirm({
      title: '确认移除',
      message: `确定要将 "${file.filename}" 从图库中移除吗？\n\n注意：文件本身不会被删除，只是从图库中移除。`,
      type: 'warning',
    });

    if (!confirmed) return;

    try {
      await galleryApi.removeFromGallery(galleryType, file.uuid);
      showToast('已从图库中移除', 'success');
      fetchFiles(pageIndex);
    } catch (error) {
      console.error('移除文件失败:', error);
      showToast('移除失败，请稍后重试', 'error');
    }
  };

  // 处理上一页
  const handlePreviousPage = () => {
    if (pagination?.up && pageIndex > 0) {
      fetchFiles(pageIndex - 1);
    }
  };

  // 处理下一页
  const handleNextPage = () => {
    if (pagination?.down && pagination.max && pageIndex < pagination.max - 1) {
      fetchFiles(pageIndex + 1);
    }
  };

  // 滚动加载更多
  const handleLoadMore = useCallback(() => {
    if (pagination?.down && !loading) {
      fetchFiles(pageIndex + 1, true);
    }
  }, [pagination?.down, loading, pageIndex, fetchFiles]);

  // 处理点击
  const handleItemClick = (item: ResourceItem) => {
    const file = files.find((f) => f.uuid === item.id);
    if (file) {
      handleInsertFile(file);
    }
  };

  // 分页操作按钮
  const paginationActions = pagination && pagination.count > 0 && (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">
        共 {pagination.count} 条 · 第 {pagination.index + 1}/{pagination.max} 页
      </span>
      <button
        onClick={handlePreviousPage}
        disabled={!pagination.up}
        className={`px-2 py-1 text-xs rounded border ${
          !pagination.up
            ? 'text-gray-400 border-gray-200 cursor-not-allowed'
            : 'text-gray-700 border-gray-300 hover:bg-gray-100'
        }`}
      >
        上一页
      </button>
      <button
        onClick={handleNextPage}
        disabled={!pagination.down}
        className={`px-2 py-1 text-xs rounded border ${
          !pagination.down
            ? 'text-gray-400 border-gray-200 cursor-not-allowed'
            : 'text-gray-700 border-gray-300 hover:bg-gray-100'
        }`}
      >
        下一页
      </button>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-white">
      {showHeader && (
        <div className="flex border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => setGalleryType('drawings')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              galleryType === 'drawings'
                ? 'bg-white text-blue-600 border-b-2 border-blue-500'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            图纸库
          </button>
          <button
            onClick={() => setGalleryType('blocks')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              galleryType === 'blocks'
                ? 'bg-white text-blue-600 border-b-2 border-blue-500'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            图块库
          </button>
        </div>
      )}

      <ResourceList
        items={resourceItems}
        loading={loading}
        searchQuery={searchKeyword}
        onSearchChange={setSearchKeyword}
        onItemClick={handleItemClick}
        categories={categories}
        selectedCategory={selectedFirstType === -1 ? null : selectedFirstType}
        onCategoryChange={handleCategoryChange}
        subCategories={subCategories}
        selectedSubCategory={selectedSecondType === -1 ? null : selectedSecondType}
        onSubCategoryChange={handleSubCategoryChange}
        thirdCategories={thirdCategories}
        selectedThirdCategory={selectedThirdType === -1 ? null : selectedThirdType}
        onThirdCategoryChange={handleThirdCategoryChange}
        showCategoryFilter={true}
        emptyText={searchKeyword ? '未找到匹配的文件' : '暂无文件'}
        defaultViewMode="grid"
        actions={paginationActions}
        hasMore={pagination?.down || false}
        onLoadMore={handleLoadMore}
      />
    </div>
  );
};

export default CADEditorSidebar;