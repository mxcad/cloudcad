///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

/**
 * CategoryTabs - 多级分类标签组件（横向滚动版）
 *
 * 功能：
 * - 支持多级分类标签展示
 * - 每级分类横向排列，超出部分横向滚动
 * - 点击分类自动滚动到对应位置
 * - 鼠标滚轮横向滚动
 *
 * 设计特点：
 * - 与 CAD 编辑器深色主题完美融合
 * - 清晰的视觉层次和交互反馈
 * - 简洁直观的滚动交互
 */

import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useState,
} from 'react';
import { Select, Tag } from '@/components/ui';
import styles from './CategoryTabs.module.css';

/** 分类项 */
export interface CategoryItem {
  id: string;
  name: string;
  hasChildren?: boolean;
  /** 父分类 ID（"all" 项无此字段），用于根据上级选择过滤下级分类 */
  parentId?: string;
}

/** 分类级别 */
export interface CategoryLevel {
  level: number;
  items: CategoryItem[];
}

/**
 * 处理分类名称去重显示
 * 当上级分类选中"全部"时，下级分类可能出现同名，需要加上父级名称区分
 * @param categories 所有层级的分类数据
 * @param selectedPath 当前选中路径
 * @param item 当前分类项
 * @returns 处理后的显示名称
 */
function getDisplayName(
  categories: CategoryLevel[],
  selectedPath: string[],
  item: CategoryItem
): string {
  if (item.id === 'all') return item.name;
  
  const level = categories.findIndex(c => c.items.some(i => i.id === item.id));
  if (level <= 0) return item.name;
  
  const parentLevel = categories.find(c => c.level === level - 1);
  if (!parentLevel) return item.name;
  
  const parentSelectedId = selectedPath[level - 1];
  if (parentSelectedId !== 'all') return item.name;
  
  const parentItem = parentLevel.items.find(p => p.id === item.parentId);
  if (!parentItem || parentItem.id === 'all') return item.name;
  
  const currentLevelItems = categories.find(c => c.level === level);
  if (!currentLevelItems) return item.name;
  
  const sameNameItems = currentLevelItems.items.filter(i => i.name === item.name && i.id !== item.id);
  if (sameNameItems.length === 0) return item.name;
  
  return `${item.name} - ${parentItem.name}`;
}

interface CategoryTabsProps {
  categories: CategoryLevel[];
  selectedPath: string[];
  onSelect: (level: number, categoryId: string) => void;
  loading?: boolean;
}

/**
 * 单级分类标签行
 */
const CategoryLevelRow: React.FC<{
  items: CategoryItem[];
  selectedId: string | null;
  onSelect: (categoryId: string) => void;
  isLastLevel: boolean;
  categories: CategoryLevel[];
  selectedPath: string[];
}> = ({ items, selectedId, onSelect, isLastLevel, categories, selectedPath }) => {
  const handleSelect = useCallback(
    (categoryId: string) => {
      onSelect(categoryId);
    },
    [onSelect]
  );

  if (items.length === 0) return null;

  return (
    <div className={`${styles.categoryRow} ${isLastLevel ? styles.lastRow : ''}`}>
      <div className={styles.categoryContainer}>
        {items.map((item) => {
            const displayName = getDisplayName(categories, selectedPath, item);
            return (
              <Tag
                key={item.id}
                variant="neutral"
                rounded="sm"
                onClick={() => handleSelect(item.id)}
                className={item.id === selectedId ? styles.active : ''}
              >
                {displayName}
              </Tag>
            );
          })}
      </div>
    </div>
  );
};

export const CategoryTabs: React.FC<CategoryTabsProps> = ({
  categories,
  selectedPath,
  onSelect,
  loading = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // 每次渲染后同步获取父容器宽度（在浏览器绘制前执行），确保 layout 切换发生在首帧之前
  useLayoutEffect(() => {
    const parent = containerRef.current?.parentElement;
    if (parent) {
      const width = parent.offsetWidth;
      if (width > 0) {
        setContainerWidth(width);
      }
    }
  }); // 无依赖数组：每次渲染都执行

  // 监听容器宽度变化（ResizeObserver），用于侧边栏拖拽调整大小时响应
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const parent = container.parentElement;
        if (parent) {
          setContainerWidth(parent.offsetWidth);
        } else {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // 是否使用紧凑布局（选择框模式）
  // 默认 containerWidth=0 时也使用紧凑布局，避免先闪现宽屏标签再切换的闪动
  const isCompactLayout = containerWidth === 0 || containerWidth < 420;

  // 获取指定级别的分类列表（用于选择框）
  const getLevelItems = (level: number): CategoryItem[] => {
    const levelData = categories.find(c => c.level === level);
    return levelData?.items || [];
  };

  // 获取当前选中的分类ID
  const getSelectedId = (level: number): string => {
    return selectedPath[level] || 'all';
  };

  // 处理选择框变更
  const handleSelectChange = (level: number, categoryId: string) => {
    onSelect(level, categoryId);
    // 如果选择了分类，清除更高层级的选择
    for (let i = level + 1; i <= 2; i++) {
      const current = selectedPath[i];
      if (current && current !== 'all') {
        onSelect(i, 'all');
      }
    }
  };

  // 判断是否有选中项
  const hasSelection = categories.some(cat => {
    const selectedId = getSelectedId(cat.level);
    return selectedId !== 'all';
  });

  // 判断某级别是否只有"全部"（没有实际分类）
  const isOnlyAll = (level: number): boolean => {
    const items = getLevelItems(level);
    return items.length === 1 && items[0]?.id === 'all';
  };

  // 所有级别都只有"全部"时，不渲染任何内容（不占空间）
  const allLevelsEmpty = isOnlyAll(0) && isOnlyAll(1) && isOnlyAll(2);
  if (!loading && allLevelsEmpty) {
    return null;
  }

  // 紧凑布局：使用选择框
  if (isCompactLayout) {
    return (
      <div ref={containerRef} className={styles.categoryTabsWrapper}>
        {loading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.loadingSpinner} />
          </div>
        )}

        <div className={styles.categorySelectGroup}>
          {/* 一级分类 - 只有"全部"时不显示 */}
          {!isOnlyAll(0) && (
            <div className={styles.categorySelectRow}>
              <span className={styles.categorySelectLabel}>一级分类</span>
              <Select
                value={getSelectedId(0)}
                onChange={(val) => handleSelectChange(0, val)}
                options={getLevelItems(0).map(item => ({
                  value: item.id,
                  label: getDisplayName(categories, selectedPath, item),
                }))}
                size="sm"
                wrapperClassName="flex-1"
              />
            </div>
          )}

          {/* 二级分类 - 只有"全部"时不显示 */}
          {!isOnlyAll(1) && (
            <div className={styles.categorySelectRow}>
              <span className={styles.categorySelectLabel}>二级分类</span>
              <Select
                value={getSelectedId(1)}
                onChange={(val) => handleSelectChange(1, val)}
                options={getLevelItems(1).map(item => ({
                  value: item.id,
                  label: getDisplayName(categories, selectedPath, item),
                }))}
                size="sm"
                wrapperClassName="flex-1"
              />
            </div>
          )}

          {/* 三级分类 - 只有"全部"时不显示 */}
          {!isOnlyAll(2) && (
            <div className={styles.categorySelectRow}>
              <span className={styles.categorySelectLabel}>三级分类</span>
              <Select
                value={getSelectedId(2)}
                onChange={(val) => handleSelectChange(2, val)}
                options={getLevelItems(2).map(item => ({
                  value: item.id,
                  label: getDisplayName(categories, selectedPath, item),
                }))}
                size="sm"
                wrapperClassName="flex-1"
              />
            </div>
          )}

        </div>
      </div>
    );
  }

  // 宽屏布局：使用横向滚动标签
  // 检查是否有可见的级别
  const visibleLevels = categories.filter(
    (c) => !(c.items.length === 1 && c.items[0]?.id === 'all')
  );
  if (!loading && visibleLevels.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className={styles.categoryTabsWrapper}>
      {loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingSpinner} />
        </div>
      )}

      <div className={styles.categoryTabsContainer}>
        {categories.map((categoryLevel, index) => {
          // 任何级别如果只有"全部"则不显示
          const isHidden = categoryLevel.items.length === 1 && categoryLevel.items[0]?.id === 'all';
          if (isHidden) {
            return null;
          }

          const selectedId = selectedPath[categoryLevel.level] || 'all';
          // 判断是否是最后一个可见级别
          const isLastLevel = categories.slice(index + 1).every(
            (c) => c.items.length === 1 && c.items[0]?.id === 'all'
          );

          return (
            <CategoryLevelRow
              key={categoryLevel.level}
              items={categoryLevel.items}
              selectedId={selectedId}
              onSelect={(categoryId) => onSelect(categoryLevel.level, categoryId)}
              isLastLevel={isLastLevel}
              categories={categories}
              selectedPath={selectedPath}
            />
          );
        })}
      </div>
    </div>
  );
};

export default CategoryTabs;
