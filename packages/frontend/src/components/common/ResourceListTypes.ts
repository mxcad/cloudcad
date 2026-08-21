///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import type React from 'react';
import type { CategoryOption } from './CascadeCategorySelector';

/** 视图类型 */
export type ViewMode = 'list' | 'grid';

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
export interface ResourceListProps {
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
  /** 每页条数 */
  pageSize?: number;
  /** 每页条数变化回调 */
  onPageSizeChange?: (pageSize: number) => void;
  /** 框选回调（启用框选） */
  onRubberBandSelect?: (nodeIds: string[]) => void;
  /** 加载错误信息（非空且列表为空时显示错误空状态） */
  error?: string | null;
  /** 错误空状态的重试回调 */
  onRetry?: () => void;
  /** 翻页/后台刷新失败信息（列表已有内容时显示为底部失败条，不整页替换） */
  loadError?: string | null;
  /** 失败条重试回调（如 react-query refetch） */
  onRetryLoadMore?: () => void;
  /** 列表第一项所属页码（累计模型下由数据层维护；prev 触发防重复加载已存在页） */
  minLoadedPage?: number;
  /** 底部悬浮操作栏（滚动容器内 mt-auto sticky：内容不足贴底=分页栏上方，内容超出吸底；不遮分页栏） */
  bottomBar?: React.ReactNode;
}
