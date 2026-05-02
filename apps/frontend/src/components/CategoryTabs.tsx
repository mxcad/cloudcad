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
  useCallback,
  useState,
} from 'react';
import { X } from 'lucide-react';
import styles from './CategoryTabs.module.css';

/** 分类项 */
export interface CategoryItem {
  id: string;
  name: string;
  hasChildren?: boolean;
}

/** 分类级别 */
export interface CategoryLevel {
  level: number;
  items: CategoryItem[];
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
}> = ({ items, selectedId, onSelect, isLastLevel }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // 点击时滚动到选中项
  const handleSelect = useCallback(
    (categoryId: string) => {
      onSelect(categoryId);
    },
    [onSelect]
  );

  // 选中项变化时自动滚动到中间位置
  useEffect(() => {
    const container = containerRef.current;
    const selected = selectedRef.current;
    if (!container || !selected) return;

    const containerWidth = container.clientWidth;
    const selectedWidth = selected.offsetWidth;
    const selectedOffset = selected.offsetLeft;

    // 计算让选中项居中需要的滚动位置
    const scrollLeft = selectedOffset - (containerWidth - selectedWidth) / 2;

    container.scrollTo({
      left: Math.max(0, scrollLeft),
      behavior: 'smooth',
    });
  }, [selectedId]);

  // 鼠标滚轮横向滚动
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // 阻止默认垂直滚动
      e.preventDefault();
      // 转换为横向滚动
      container.scrollLeft += e.deltaY;
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className={`${styles.categoryRow} ${isLastLevel ? styles.lastRow : ''}`}>
      <div ref={containerRef} className={styles.categoryContainer}>
        {items.map((item) => (
          <button
            key={item.id}
            ref={item.id === selectedId ? selectedRef : null}
            className={`${styles.categoryButton} ${item.id === selectedId ? styles.active : ''}`}
            onClick={() => handleSelect(item.id)}
          >
            {item.name}
          </button>
        ))}
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

  // 检测容器宽度（用于自适应布局）
  // 使用父容器（侧边栏）的宽度来判断是否使用紧凑布局
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 获取父容器（侧边栏）的宽度
    const getParentWidth = () => {
      const parent = container.parentElement;
      if (parent) {
        return parent.offsetWidth;
      }
      // 如果没有父容器，回退到自身宽度
      return container.offsetWidth;
    };

    const updateWidth = () => {
      const width = getParentWidth();
      setContainerWidth(width);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        // 优先使用父容器宽度
        const parent = container.parentElement;
        if (parent) {
          setContainerWidth(parent.offsetWidth);
        } else {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });

    // 监听窗口 resize
    const handleResize = () => {
      updateWidth();
    };

    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);
    
    // 初始化时多次尝试获取宽度
    updateWidth();
    setTimeout(updateWidth, 100);
    setTimeout(updateWidth, 300);
    setTimeout(updateWidth, 500);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 是否使用紧凑布局（窄屏幕）
  // 宽度小于420px时使用选择框形式，否则使用横向滚动标签
  // 初始状态（containerWidth=0）时默认使用宽屏布局（横向滚动标签）
  const isCompactLayout = containerWidth > 0 && containerWidth < 420;

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
          {/* 一级分类 */}
          <div className={styles.categorySelectRow}>
            <span className={styles.categorySelectLabel}>一级分类</span>
            <select
              value={getSelectedId(0)}
              onChange={(e) => handleSelectChange(0, e.target.value)}
              className={styles.categorySelect}
            >
              {getLevelItems(0).map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>

          {/* 二级分类 */}
          <div className={styles.categorySelectRow}>
            <span className={styles.categorySelectLabel}>二级分类</span>
            <select
              value={getSelectedId(1)}
              onChange={(e) => handleSelectChange(1, e.target.value)}
              className={styles.categorySelect}
            >
              {getLevelItems(1).length > 0 ? (
                getLevelItems(1).map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))
              ) : (
                <option value="all">暂无分类</option>
              )}
            </select>
          </div>

          {/* 三级分类 */}
          <div className={styles.categorySelectRow}>
            <span className={styles.categorySelectLabel}>三级分类</span>
            <select
              value={getSelectedId(2)}
              onChange={(e) => handleSelectChange(2, e.target.value)}
              className={styles.categorySelect}
            >
              {getLevelItems(2).length > 0 ? (
                getLevelItems(2).map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))
              ) : (
                <option value="all">暂无分类</option>
              )}
            </select>
          </div>

        </div>
      </div>
    );
  }

  // 宽屏布局：使用横向滚动标签
  return (
    <div ref={containerRef} className={styles.categoryTabsWrapper}>
      {loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingSpinner} />
        </div>
      )}

      <div className={styles.categoryTabsContainer}>
        {categories.map((categoryLevel, index) => {
          const selectedId = selectedPath[categoryLevel.level] || 'all';
          const isLastLevel = index === categories.length - 1;

          return (
            <CategoryLevelRow
              key={categoryLevel.level}
              items={categoryLevel.items}
              selectedId={selectedId}
              onSelect={(categoryId) => onSelect(categoryLevel.level, categoryId)}
              isLastLevel={isLastLevel}
            />
          );
        })}
      </div>
    </div>
  );
};

export default CategoryTabs;
