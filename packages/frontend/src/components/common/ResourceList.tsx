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

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Grid3x3 } from 'lucide-react';
import { List } from 'lucide-react';
import { FileImage } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { ChevronLeft } from 'lucide-react';
import { ChevronsLeft } from 'lucide-react';
import { ChevronsRight } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { X } from 'lucide-react';
import { useFileSystemStore } from '@/stores/fileSystemStore';
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
  /** 文件路径（用于版本历史） */
  filePath?: string;
  /** 父节点ID（用于版本历史） */
  parentId?: string | null;
  /** 项目ID（用于版本历史） */
  projectId?: string;
  /** 是否为CAD文件 */
  isCadFile?: boolean;
  /** 是否可下载 */
  canDownload?: boolean;
  /** key前缀（用于区分不同模块的数据，避免key重复） */
  keyPrefix?: string;
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
  /** 是否需要双击打开图纸（默认 false，单击打开） */
  doubleClickToOpen?: boolean;
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
  /** 工具栏额外内容（显示在搜索框旁边，可选） */
  toolbarExtra?: React.ReactNode;
  /** 是否还有更多数据（用于滚动加载） */
  hasMore?: boolean;
  /** 加载更多回调（滚动到底部触发） */
  onLoadMore?: () => void;
  /** 面包屑（显示在搜索框上方） */
  breadcrumb?: React.ReactNode;
  /** 总数（用于显示统计信息） */
  total?: number;
  /**
   * 自定义渲染项（必须提供）
   * 用于渲染每个项目，接收 item、viewMode
   */
  renderItem: (item: ResourceItem, viewMode: ViewMode) => React.ReactNode;
  /** 分页相关：总页数 */
  totalPages?: number;
  /** 分页相关：当前页数（从1开始） */
  currentPage?: number;
  /** 分页相关：页码变化回调（用于跳转页面时重置列表） */
  onPageChange?: (page: number, direction: 'prev' | 'next' | 'jump') => void;
  /** 是否支持分页模式（启用后将使用分页加载而非无限滚动） */
  paginationEnabled?: boolean;
  /** 图库模式：网格模式图片完全占据容器，文件名在底部，不显示大小；列表模式图片放大，去除后缀标签（默认true） */
  galleryMode?: boolean;
  /** 加载方向：up=向上加载，down=向下加载，jump=跳转页面 */
  loadDirection?: 'up' | 'down' | 'jump' | null;
  /** 加载完成后的回调 */
  onLoadComplete?: () => void;
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
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // 检测容器宽度（用于自适应布局）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const width = container.offsetWidth;
      setContainerWidth(width);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(container);
    
    // 初始化时立即获取宽度，如果获取不到则延迟获取
    updateWidth();
    if (container.offsetWidth === 0) {
      setTimeout(updateWidth, 100);
      setTimeout(updateWidth, 300);
    }

    return () => resizeObserver.disconnect();
  }, []);

  // 是否使用紧凑布局（容器宽度不足时）
  // 初始时默认使用紧凑布局，确保窄屏幕下能正确显示选择框
  const isCompactLayout = containerWidth === 0 ? true : containerWidth < 420;
  
  // 面板是否需要向上弹出（检测是否会超出视口底部）
  const [shouldOpenUp, setShouldOpenUp] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // 检测面板是否超出视口
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    
    const checkPosition = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      
      // 估算面板高度：紧凑布局约 400px，水平布局约 280px
      const estimatedPanelHeight = isCompactLayout ? 400 : 280;
      
      // 如果下方空间不足，向上弹出
      setShouldOpenUp(spaceBelow < estimatedPanelHeight && rect.top > estimatedPanelHeight);
    };
    
    checkPosition();
    // 监听滚动和窗口大小变化
    window.addEventListener('scroll', checkPosition, true);
    window.addEventListener('resize', checkPosition);
    
    return () => {
      window.removeEventListener('scroll', checkPosition, true);
      window.removeEventListener('resize', checkPosition);
    };
  }, [isOpen, isCompactLayout]);

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
    if (!selectedCategory) return [];
    
    const cat = categories.find(c => c.id === selectedCategory);
    if (!cat?.children || cat.children.length === 0) return [];
    
    // 如果选择了具体的二级分类
    if (selectedSubCategory) {
      const subCat = cat.children.find(c => c.id === selectedSubCategory);
      return subCat?.children || [];
    }
    
    // 如果二级分类是"全部"，返回所有二级分类中的所有三级分类
    const allThirdCategories: CategoryOption[] = [];
    cat.children.forEach(subCat => {
      if (subCat.children) {
        allThirdCategories.push(...subCat.children);
      }
    });
    
    return allThirdCategories;
  }, [categories, selectedCategory, selectedSubCategory]);

  // 清除选择
  const handleClear = () => {
    onCategoryChange(null);
    onSubCategoryChange(null);
    onThirdCategoryChange(null);
  };

  return (
    <div className={styles.cascadeSelector} ref={containerRef}>
      {/* 紧凑布局：使用选择框 */}
      {isCompactLayout ? (
        <div className={styles.cascadeSelectGroup}>
          {/* 一级分类选择框 */}
          <select
            value={selectedCategory || ''}
            onChange={(e) => {
              const val = e.target.value;
              onCategoryChange(val || null);
              onSubCategoryChange(null);
              onThirdCategoryChange(null);
            }}
            className={styles.cascadeSelect}
          >
            <option value="">一级分类</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>

          {/* 二级分类选择框 */}
          <select
            value={selectedSubCategory || ''}
            onChange={(e) => {
              const val = e.target.value;
              onSubCategoryChange(val || null);
              onThirdCategoryChange(null);
            }}
            className={styles.cascadeSelect}
            disabled={!selectedCategory || subCategories.length === 0}
          >
            <option value="">二级分类</option>
            {subCategories.length > 0 ? (
              subCategories.map(subCat => (
                <option key={subCat.id} value={subCat.id}>{subCat.name}</option>
              ))
            ) : (
              <option value="" disabled>暂无分类</option>
            )}
          </select>

          {/* 三级分类选择框 */}
          <select
            value={selectedThirdCategory || ''}
            onChange={(e) => {
              const val = e.target.value;
              onThirdCategoryChange(val || null);
            }}
            className={styles.cascadeSelect}
            disabled={!selectedSubCategory || thirdCategories.length === 0}
          >
            <option value="">三级分类</option>
            {thirdCategories.length > 0 ? (
              thirdCategories.map(thirdCat => (
                <option key={thirdCat.id} value={thirdCat.id}>{thirdCat.name}</option>
              ))
            ) : (
              <option value="" disabled>暂无分类</option>
            )}
          </select>

        </div>
      ) : (
        /* 宽屏布局：使用下拉面板 */
        <>
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
            <div 
              ref={panelRef}
              className={`${styles.cascadePanel} ${shouldOpenUp ? styles.openUp : ''}`}
            >
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
        </>
      )}
    </div>
  );
};

/** 分页控件组件 */
const Pagination: React.FC<{
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number, direction: 'prev' | 'next' | 'jump') => void;
  loading?: boolean;
}> = ({ currentPage, totalPages, onPageChange, loading }) => {
  const [inputValue, setInputValue] = useState('');
  const [isNarrow, setIsNarrow] = useState(false);

  // 监听窗口宽度变化，判断是否为窄屏幕
  useEffect(() => {
    const checkWidth = () => {
      // 当容器宽度小于 400px 时认为是窄屏幕
      const container = document.querySelector<HTMLElement>(`.${styles.pagination}`);
      if (container) {
        setIsNarrow(container.offsetWidth < 400);
      } else {
        // 默认检查窗口宽度
        setIsNarrow(window.innerWidth < 450);
      }
    };

    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const page = parseInt(inputValue, 10);
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      onPageChange(page, 'jump');
    }
    setInputValue('');
  };

  const handleJumpInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const page = parseInt((e.target as HTMLInputElement).value, 10);
      if (page >= 1 && page <= totalPages && page !== currentPage) {
        onPageChange(page, 'jump');
      }
      setInputValue('');
    }
  };

  return (
    <div className={`${styles.pagination} ${isNarrow ? styles.paginationNarrow : ''}`}>
      {/* 首页（窄屏幕时隐藏） */}
      {!isNarrow && (
        <button
          className={styles.paginationButton}
          onClick={() => onPageChange(1, 'jump')}
          disabled={currentPage === 1 || loading}
          title="首页"
        >
          <ChevronsLeft size={16} />
        </button>
      )}

      {/* 上一页 */}
      <button
        className={styles.paginationButton}
        onClick={() => onPageChange(currentPage - 1, 'prev')}
        disabled={currentPage === 1 || loading}
        title="上一页"
      >
        <ChevronLeft size={16} />
      </button>

      {/* 页码信息 */}
      <span className={styles.paginationInfo}>
        {currentPage} / {totalPages}
      </span>

      {/* 跳转输入框（窄屏幕时使用更紧凑的样式） */}
      <form onSubmit={handleInputSubmit} className={`${styles.paginationJump} ${isNarrow ? styles.paginationJumpNarrow : ''}`}>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleJumpInputKeyDown}
          placeholder={isNarrow ? '页' : '跳转'}
          className={styles.paginationInput}
        />
        <button type="submit" className={`${styles.paginationJumpButton} ${isNarrow ? styles.paginationJumpButtonNarrow : ''}`}>
          {isNarrow ? 'GO' : '跳转'}
        </button>
      </form>

      {/* 下一页 */}
      <button
        className={styles.paginationButton}
        onClick={() => onPageChange(currentPage + 1, 'next')}
        disabled={currentPage === totalPages || loading}
        title="下一页"
      >
        <ChevronRight size={16} />
      </button>

      {/* 末页（窄屏幕时隐藏） */}
      {!isNarrow && (
        <button
          className={styles.paginationButton}
          onClick={() => onPageChange(totalPages, 'jump')}
          disabled={currentPage === totalPages || loading}
          title="末页"
        >
          <ChevronsRight size={16} />
        </button>
      )}
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
  doubleClickToOpen = false,
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
  toolbarExtra,
  hasMore = false,
  onLoadMore,
  breadcrumb,
  renderItem,
  total,
  totalPages,
  currentPage = 1,
  onPageChange,
  paginationEnabled = false,
  galleryMode = false,
  loadDirection,
  onLoadComplete,
}) => {
  // 使用统一的 fileSystemStore 管理视图模式
  const viewMode = useFileSystemStore((state) => state.viewMode);
  const setViewMode = useFileSystemStore((state) => state.setViewMode);

  // 初始化视图模式（使用 defaultViewMode）
  useEffect(() => {
    // 检查 localStorage 中是否有保存的视图模式
    const savedMode = localStorage.getItem('fileSystemStore');
    if (!savedMode) {
      // 如果没有保存，使用默认模式
      setViewMode(defaultViewMode);
    }
  }, [defaultViewMode, setViewMode]);

  const contentRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef<number>(0);
  const isLoadingRef = useRef(false);
  const previousPageRef = useRef(currentPage);
  // 保存加载前的状态
  const beforeLoad = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);

  // 是否显示分类筛选
  const hasCategories = showCategoryFilter && categories && categories.length > 0;

  // 在加载前保存状态
  useEffect(() => {
    if (loading && contentRef.current) {
      beforeLoad.current = {
        scrollTop: contentRef.current.scrollTop,
        scrollHeight: contentRef.current.scrollHeight
      };
    }
  }, [loading]);

  // 数据更新后调整滚动位置
  useEffect(() => {
    // 只在 loading 刚结束，且 beforeLoad 有数据时处理
    if (loading || !beforeLoad.current || !contentRef.current) return;

    const content = contentRef.current;
    const { scrollTop: oldTop, scrollHeight: oldHeight } = beforeLoad.current;
    const newHeight = content.scrollHeight;
    const heightDiff = newHeight - oldHeight;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!content) return;
        
        if (loadDirection === 'up' && heightDiff > 0) {
          // 向上加载：新内容在前面，需要向下滚动 heightDiff 来保持原位置
          content.scrollTop = oldTop + heightDiff;
        } else if (loadDirection === 'jump') {
          // 跳页：设置到合适位置，方便双向滚动
          const targetScrollTop = Math.min(200, newHeight * 0.3);
          content.scrollTop = targetScrollTop;
        }
        // 向下加载或无限滚动：不需要调整，保持原位
      });
    });

    // 加载完成后回调
    onLoadComplete?.();
    
    // 重置
    beforeLoad.current = null;
  }, [loading, items.length, loadDirection, onLoadComplete]);

  // 滚动方向检测和分页加载
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const handleScroll = () => {
      // 防止重复加载
      if (isLoadingRef.current) return;

      const currentScrollTop = content.scrollTop;
      const scrollHeight = content.scrollHeight;
      const clientHeight = content.clientHeight;

      // 检测滚动方向
      const scrollDirection = currentScrollTop > lastScrollTopRef.current ? 'down' : 'up';
      lastScrollTopRef.current = currentScrollTop;

      // 分页模式：使用 onPageChange 进行分页加载
      if (paginationEnabled && onPageChange && totalPages && currentPage) {
        // 向下滚动到底部附近，提前加载下一页（提前 500px 开始加载）
        if (scrollDirection === 'down' && currentScrollTop + clientHeight >= scrollHeight - 500) {
          if (currentPage < totalPages) {
            isLoadingRef.current = true;
            onPageChange(currentPage + 1, 'next');
            setTimeout(() => {
              isLoadingRef.current = false;
            }, 1000);
          }
        }
        // 向上滚动到顶部附近，提前加载上一页（提前 200px 开始加载）
        // 只有当当前页不是第一页时才加载
        else if (scrollDirection === 'up' && currentScrollTop <= 200) {
          if (currentPage > 1) {
            isLoadingRef.current = true;
            onPageChange(currentPage - 1, 'prev');
            setTimeout(() => {
              isLoadingRef.current = false;
            }, 1000);
          }
        }
      } else if (!paginationEnabled && onLoadMore && hasMore) {
        // 非分页模式：传统滚动加载，提前 500px 开始加载
        if (currentScrollTop + clientHeight >= scrollHeight - 500) {
          onLoadMore();
        }
      }
    };

    content.addEventListener('scroll', handleScroll, { passive: true });
    return () => content.removeEventListener('scroll', handleScroll);
  }, [hasMore, onLoadMore, onPageChange, paginationEnabled, totalPages, currentPage]);

  // 传统滚动加载：使用 Intersection Observer 监听底部加载元素（非分页模式）
  useEffect(() => {
    if (!onLoadMore || !hasMore || paginationEnabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMore && !loading) {
          onLoadMore();
        }
      },
      {
        root: contentRef.current,
        rootMargin: '0px 0px 500px 0px',
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
  }, [hasMore, loading, onLoadMore, paginationEnabled]);

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
          {/* 总数显示 */}
          {total !== undefined && total > 0 && (
            <div className={styles.totalCount}>
              共 <span className={styles.totalCountNumber}>{total}</span> 项
            </div>
          )}
          {/* 工具栏额外内容（如刷新按钮） */}
          {toolbarExtra}
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
        ) : (
          // 使用自定义渲染（必须提供 renderItem）
          <div className={viewMode === 'list' ? (galleryMode ? styles.listViewGallery : styles.listView) : (galleryMode ? styles.gridViewGallery : styles.gridView)}>
            {items.map((item) => (
              <React.Fragment key={item.keyPrefix ? `${item.keyPrefix}-${item.id}` : item.id}>
                {renderItem(item, viewMode)}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* 加载更多触发元素 */}
        {(onLoadMore || paginationEnabled) && (
          <div ref={loadMoreRef} className={styles.loadMoreTrigger}>
            {loading && (
              <div className={styles.loadingMore}>
                <Loader2 size={20} className={styles.loadingMoreIcon} />
                <span>加载中...</span>
              </div>
            )}
            {!loading && !hasMore && items.length > 0 && (
              <div className={styles.noMore}>没有更多了</div>
            )}
            {/* 分页模式下：当已经在最后一页时显示提示 */}
            {!loading && paginationEnabled && totalPages && currentPage === totalPages && (
              <div className={styles.noMore}>已经是最后一页</div>
            )}
          </div>
        )}
      </div>

      {/* 底部分页操作栏 */}
      <div className={styles.footer}>
        {/* 分页控件（启用分页模式时显示） */}
        {paginationEnabled && totalPages && totalPages > 1 && onPageChange && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
            loading={loading}
          />
        )}
        {/* 额外的操作按钮 */}
        {actions}
      </div>
    </div>
  );
};

export default ResourceList;