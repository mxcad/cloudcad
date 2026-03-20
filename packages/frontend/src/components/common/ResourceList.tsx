///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

/**
 * ResourceList - 通用资源列表组件
 *
 * 统一的列表/网格视图，支持搜索、级联分类筛选、视图切换
 * 用于：我的项目、我的图纸、图纸库、图块库
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import Search from 'lucide-react/dist/esm/icons/search';
import Grid3x3 from 'lucide-react/dist/esm/icons/grid-3x3';
import List from 'lucide-react/dist/esm/icons/list';
import Folder from 'lucide-react/dist/esm/icons/folder';
import FileImage from 'lucide-react/dist/esm/icons/file-image';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import X from 'lucide-react/dist/esm/icons/x';
import styles from './ResourceList.module.css';

/** 视图类型 */
export type ViewMode = 'list' | 'grid';

/** 分类选项 */
export interface CategoryOption {
  id: number | string;
  name: string;
  children?: CategoryOption[];
}

/** 列表项数据 */
export interface ResourceItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  thumbnailUrl?: string;
  updatedAt?: string;
  size?: number;
  meta?: Record<string, string | number>;
  isActive?: boolean;
  badge?: React.ReactNode;
}

/** 组件属性 */
interface ResourceListProps {
  /** 标题 */
  title?: React.ReactNode;
  /** 数据项列表 */
  items: ResourceItem[];
  /** 加载状态 */
  loading?: boolean;
  /** 搜索关键词 */
  searchQuery: string;
  /** 搜索回调 */
  onSearchChange: (query: string) => void;
  /** 点击项回调 */
  onItemClick: (item: ResourceItem) => void;
  /** 分类选项（树形结构） */
  categories?: CategoryOption[];
  /** 选中的一级分类 */
  selectedCategory?: number | string | null;
  /** 分类切换回调 */
  onCategoryChange?: (id: number | string | null) => void;
  /** 二级分类选项 */
  subCategories?: CategoryOption[];
  /** 选中的二级分类 */
  selectedSubCategory?: number | string | null;
  /** 二级分类切换回调 */
  onSubCategoryChange?: (id: number | string | null) => void;
  /** 三级分类选项 */
  thirdCategories?: CategoryOption[];
  /** 选中的三级分类 */
  selectedThirdCategory?: number | string | null;
  /** 三级分类切换回调 */
  onThirdCategoryChange?: (id: number | string | null) => void;
  /** 空状态提示 */
  emptyText?: string;
  /** 是否显示视图切换 */
  showViewToggle?: boolean;
  /** 默认视图 */
  defaultViewMode?: ViewMode;
  /** 是否显示分类筛选 */
  showCategoryFilter?: boolean;
  /** 额外的操作按钮（分页按钮等，可选） */
  actions?: React.ReactNode;
  /** 是否还有更多数据（用于滚动加载） */
  hasMore?: boolean;
  /** 加载更多回调（滚动到底部触发） */
  onLoadMore?: () => void;
  /** 面包屑（显示在搜索框上方） */
  breadcrumb?: React.ReactNode;
}

/** 格式化文件大小 */
function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 格式化日期 */
function formatDate(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 级联分类选择器组件 */
const CascadeCategorySelector: React.FC<{
  categories: CategoryOption[];
  selectedCategory: number | string | null;
  selectedSubCategory: number | string | null;
  selectedThirdCategory: number | string | null;
  onCategoryChange: (id: number | string | null) => void;
  onSubCategoryChange: (id: number | string | null) => void;
  onThirdCategoryChange: (id: number | string | null) => void;
}> = ({
  categories,
  selectedCategory,
  selectedSubCategory,
  selectedThirdCategory,
  onCategoryChange,
  onSubCategoryChange,
  onThirdCategoryChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 获取当前选中的分类路径
  const selectedPath = useMemo(() => {
    const path: string[] = [];
    
    if (selectedCategory) {
      const cat = categories.find(c => c.id === selectedCategory);
      if (cat) {
        path.push(cat.name);
        
        if (selectedSubCategory && cat.children) {
          const subCat = cat.children.find(c => c.id === selectedSubCategory);
          if (subCat) {
            path.push(subCat.name);
            
            if (selectedThirdCategory && subCat.children) {
              const thirdCat = subCat.children.find(c => c.id === selectedThirdCategory);
              if (thirdCat) {
                path.push(thirdCat.name);
              }
            }
          }
        }
      }
    }
    
    return path;
  }, [categories, selectedCategory, selectedSubCategory, selectedThirdCategory]);

  // 获取二级分类列表
  const subCategories = useMemo(() => {
    if (!selectedCategory) return [];
    const cat = categories.find(c => c.id === selectedCategory);
    return cat?.children || [];
  }, [categories, selectedCategory]);

  // 获取三级分类列表
  const thirdCategories = useMemo(() => {
    if (!selectedCategory || !selectedSubCategory) return [];
    const cat = categories.find(c => c.id === selectedCategory);
    const subCat = cat?.children?.find(c => c.id === selectedSubCategory);
    return subCat?.children || [];
  }, [categories, selectedCategory, selectedSubCategory]);

  // 清除选择
  const handleClear = () => {
    onCategoryChange(null);
    onSubCategoryChange(null);
    onThirdCategoryChange(null);
  };

  return (
    <div className={styles.cascadeSelector} ref={containerRef}>
      {/* 选择按钮 */}
      <button
        className={`${styles.cascadeButton} ${isOpen ? styles.open : ''} ${selectedPath.length > 0 ? styles.active : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={styles.cascadeButtonText}>
          {selectedPath.length > 0 ? selectedPath.join(' > ') : '选择分类'}
        </span>
        {selectedPath.length > 0 ? (
          <span
            className={styles.clearIcon}
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
          >
            <X size={14} />
          </span>
        ) : (
          <ChevronRight size={14} className={styles.arrowIcon} />
        )}
      </button>

      {/* 级联面板 */}
      {isOpen && (
        <div className={styles.cascadePanel}>
          {/* 一级分类 */}
          <div className={styles.cascadeColumn}>
            <div className={styles.cascadeColumnTitle}>一级分类</div>
            <div className={styles.cascadeColumnContent}>
              <div
                className={`${styles.cascadeItem} ${!selectedCategory ? styles.selected : ''}`}
                onClick={() => {
                  onCategoryChange(null);
                  onSubCategoryChange(null);
                  onThirdCategoryChange(null);
                }}
              >
                全部分类
              </div>
              {categories.map(cat => (
                <div
                  key={cat.id}
                  className={`${styles.cascadeItem} ${selectedCategory === cat.id ? styles.selected : ''} ${cat.children && cat.children.length > 0 ? styles.hasChildren : ''}`}
                  onClick={() => {
                    onCategoryChange(cat.id);
                    onSubCategoryChange(null);
                    onThirdCategoryChange(null);
                  }}
                >
                  {cat.name}
                  {cat.children && cat.children.length > 0 && (
                    <ChevronRight size={14} className={styles.itemArrow} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 二级分类 */}
          {selectedCategory && subCategories.length > 0 && (
            <div className={styles.cascadeColumn}>
              <div className={styles.cascadeColumnTitle}>二级分类</div>
              <div className={styles.cascadeColumnContent}>
                <div
                  className={`${styles.cascadeItem} ${!selectedSubCategory ? styles.selected : ''}`}
                  onClick={() => {
                    onSubCategoryChange(null);
                    onThirdCategoryChange(null);
                  }}
                >
                  全部
                </div>
                {subCategories.map(subCat => (
                  <div
                    key={subCat.id}
                    className={`${styles.cascadeItem} ${selectedSubCategory === subCat.id ? styles.selected : ''} ${subCat.children && subCat.children.length > 0 ? styles.hasChildren : ''}`}
                    onClick={() => {
                      onSubCategoryChange(subCat.id);
                      onThirdCategoryChange(null);
                    }}
                  >
                    {subCat.name}
                    {subCat.children && subCat.children.length > 0 && (
                      <ChevronRight size={14} className={styles.itemArrow} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 三级分类 */}
          {selectedSubCategory && thirdCategories.length > 0 && (
            <div className={styles.cascadeColumn}>
              <div className={styles.cascadeColumnTitle}>三级分类</div>
              <div className={styles.cascadeColumnContent}>
                <div
                  className={`${styles.cascadeItem} ${!selectedThirdCategory ? styles.selected : ''}`}
                  onClick={() => onThirdCategoryChange(null)}
                >
                  全部
                </div>
                {thirdCategories.map(thirdCat => (
                  <div
                    key={thirdCat.id}
                    className={`${styles.cascadeItem} ${selectedThirdCategory === thirdCat.id ? styles.selected : ''}`}
                    onClick={() => onThirdCategoryChange(thirdCat.id)}
                  >
                    {thirdCat.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** 列表项组件 */
const ListItem: React.FC<{
  item: ResourceItem;
  onClick: () => void;
}> = ({ item, onClick }) => {
  return (
    <div
      className={`${styles.listItem} ${item.isActive ? styles.active : ''}`}
      onClick={onClick}
    >
      <div className={styles.itemIcon}>
        {item.type === 'folder' ? (
          <Folder size={20} color="#f59e0b" />
        ) : item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt={item.name}
            className={styles.thumbnail}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <FileImage size={20} color="#6b7280" />
        )}
      </div>
      <div className={styles.itemInfo}>
        <div className={styles.itemNameRow}>
          <span className={styles.itemName} title={item.name}>
            {item.name}
          </span>
          {item.badge}
        </div>
        <div className={styles.itemMeta}>
          {item.size !== undefined && (
            <span>{formatFileSize(item.size)}</span>
          )}
          {item.updatedAt && (
            <span>{formatDate(item.updatedAt)}</span>
          )}
          {item.meta && Object.entries(item.meta).map(([key, value]) => (
            <span key={key}>{value}</span>
          ))}
        </div>
      </div>
      {item.type === 'folder' && (
        <ChevronRight size={16} className={styles.itemArrow} />
      )}
    </div>
  );
};

/** 网格项组件 */
const GridItem: React.FC<{
  item: ResourceItem;
  onClick: () => void;
}> = ({ item, onClick }) => {
  const [imageError, setImageError] = useState(false);

  return (
    <div
      className={`${styles.gridItem} ${item.isActive ? styles.active : ''}`}
      onClick={onClick}
    >
      <div className={styles.gridItemPreview}>
        {item.thumbnailUrl && !imageError ? (
          <img
            src={item.thumbnailUrl}
            alt={item.name}
            className={styles.gridThumbnail}
            onError={() => setImageError(true)}
          />
        ) : item.type === 'folder' ? (
          <div className={styles.gridFolderIcon}>
            <Folder size={32} color="#f59e0b" />
          </div>
        ) : (
          <div className={styles.gridFileIcon}>
            <FileImage size={32} color="#6b7280" />
          </div>
        )}
        {item.badge && (
          <div className={styles.gridBadge}>{item.badge}</div>
        )}
      </div>
      <div className={styles.gridItemInfo}>
        <div className={styles.gridItemName} title={item.name}>
          {item.name}
        </div>
        <div className={styles.gridItemMeta}>
          {item.meta && Object.entries(item.meta).map(([key, value]) => (
            <span key={key}>{value}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

/** 资源列表组件 */
export const ResourceList: React.FC<ResourceListProps> = ({
  title,
  items,
  loading,
  searchQuery,
  onSearchChange,
  onItemClick,
  categories,
  selectedCategory,
  onCategoryChange,
  subCategories,
  selectedSubCategory,
  onSubCategoryChange,
  thirdCategories,
  selectedThirdCategory,
  onThirdCategoryChange,
  emptyText = '暂无数据',
  showViewToggle = true,
  defaultViewMode = 'list',
  showCategoryFilter = false,
  actions,
  hasMore = false,
  onLoadMore,
  breadcrumb,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const contentRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // 是否显示分类筛选
  const hasCategories = showCategoryFilter && categories && categories.length > 0;

  // 滚动加载：使用 Intersection Observer 监听底部加载元素
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMore && !loading) {
          onLoadMore();
        }
      },
      {
        root: contentRef.current,
        rootMargin: '0px 0px 100px 0px', // 提前 100px 触发加载
        threshold: 0,
      }
    );

    const loadMoreElement = loadMoreRef.current;
    if (loadMoreElement) {
      observer.observe(loadMoreElement);
    }

    return () => {
      if (loadMoreElement) {
        observer.unobserve(loadMoreElement);
      }
    };
  }, [hasMore, loading, onLoadMore]);

  return (
    <div className={styles.resourceList}>
      {/* 标题栏 */}
      {title && <div className={styles.header}>{title}</div>}

      {/* 面包屑（在搜索框上方） */}
      {breadcrumb && <div className={styles.breadcrumbWrapper}>{breadcrumb}</div>}

      {/* 工具栏：搜索 + 视图切换 */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="搜索..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <div className={styles.toolbarActions}>
          {showViewToggle && (
            <div className={styles.viewToggle}>
              <button
                className={`${styles.viewButton} ${viewMode === 'list' ? styles.active : ''}`}
                onClick={() => setViewMode('list')}
                title="列表视图"
              >
                <List size={16} />
              </button>
              <button
                className={`${styles.viewButton} ${viewMode === 'grid' ? styles.active : ''}`}
                onClick={() => setViewMode('grid')}
                title="网格视图"
              >
                <Grid3x3 size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 级联分类筛选 */}
      {hasCategories && onCategoryChange && (
        <div className={styles.categoryFilter}>
          <CascadeCategorySelector
            categories={categories}
            selectedCategory={selectedCategory ?? null}
            selectedSubCategory={selectedSubCategory ?? null}
            selectedThirdCategory={selectedThirdCategory ?? null}
            onCategoryChange={onCategoryChange}
            onSubCategoryChange={onSubCategoryChange || (() => {})}
            onThirdCategoryChange={onThirdCategoryChange || (() => {})}
          />
        </div>
      )}

      {/* 内容区域 */}
      <div className={styles.content} ref={contentRef}>
        {loading && items.length === 0 ? (
          <div className={styles.loadingState}>
            <Loader2 className={styles.loadingIcon} />
          </div>
        ) : items.length === 0 ? (
          <div className={styles.emptyState}>
            <FileImage size={48} className={styles.emptyIcon} />
            <div className={styles.emptyText}>{emptyText}</div>
          </div>
        ) : viewMode === 'list' ? (
          <div className={styles.listView}>
            {items.map((item) => (
              <ListItem
                key={item.id}
                item={item}
                onClick={() => onItemClick(item)}
              />
            ))}
          </div>
        ) : (
          <div className={styles.gridView}>
            {items.map((item) => (
              <GridItem
                key={item.id}
                item={item}
                onClick={() => onItemClick(item)}
              />
            ))}
          </div>
        )}

        {/* 加载更多触发元素 */}
        {onLoadMore && (
          <div ref={loadMoreRef} className={styles.loadMoreTrigger}>
            {loading && hasMore && (
              <div className={styles.loadingMore}>
                <Loader2 size={20} className={styles.loadingMoreIcon} />
                <span>加载中...</span>
              </div>
            )}
            {!hasMore && items.length > 0 && (
              <div className={styles.noMore}>没有更多了</div>
            )}
          </div>
        )}
      </div>

      {/* 底部分页操作栏 */}
      {actions && (
        <div className={styles.footer}>
          {actions}
        </div>
      )}
    </div>
  );
};

export default ResourceList;