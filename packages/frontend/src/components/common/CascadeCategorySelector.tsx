///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { t } from '@/languages';
import styles from './ResourceList.module.css';

/** 分类选项 */
export interface CategoryOption {
  id: number | string;
  name: string;
  children?: CategoryOption[];
}

interface CascadeCategorySelectorProps {
  categories: CategoryOption[];
  selectedCategory: number | string | null;
  selectedSubCategory: number | string | null;
  selectedThirdCategory: number | string | null;
  onCategoryChange: (id: number | string | null) => void;
  onSubCategoryChange: (id: number | string | null) => void;
  onThirdCategoryChange: (id: number | string | null) => void;
}

/** 级联分类选择器组件 */
export const CascadeCategorySelector: React.FC<
  CascadeCategorySelectorProps
> = ({
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
      setShouldOpenUp(
        spaceBelow < estimatedPanelHeight && rect.top > estimatedPanelHeight
      );
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
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
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
      const cat = categories.find((c) => c.id === selectedCategory);
      if (cat) {
        path.push(cat.name);

        if (selectedSubCategory && cat.children) {
          const subCat = cat.children.find((c) => c.id === selectedSubCategory);
          if (subCat) {
            path.push(subCat.name);

            if (selectedThirdCategory && subCat.children) {
              const thirdCat = subCat.children.find(
                (c) => c.id === selectedThirdCategory
              );
              if (thirdCat) {
                path.push(thirdCat.name);
              }
            }
          }
        }
      }
    }

    return path;
  }, [
    categories,
    selectedCategory,
    selectedSubCategory,
    selectedThirdCategory,
  ]);

  // 获取二级分类列表
  const subCategories = useMemo(() => {
    if (!selectedCategory) return [];
    const cat = categories.find((c) => c.id === selectedCategory);
    return cat?.children || [];
  }, [categories, selectedCategory]);

  // 获取三级分类列表
  const thirdCategories = useMemo(() => {
    if (!selectedCategory) return [];

    const cat = categories.find((c) => c.id === selectedCategory);
    if (!cat?.children || cat.children.length === 0) return [];

    // 如果选择了具体的二级分类
    if (selectedSubCategory) {
      const subCat = cat.children.find((c) => c.id === selectedSubCategory);
      return subCat?.children || [];
    }

    // 如果二级分类是"全部"，返回所有二级分类中的所有三级分类
    const allThirdCategories: CategoryOption[] = [];
    cat.children.forEach((subCat) => {
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
            <option value="">{t('一级分类')}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
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
            <option value="">{t('二级分类')}</option>
            {subCategories.length > 0 ? (
              subCategories.map((subCat) => (
                <option key={subCat.id} value={subCat.id}>
                  {subCat.name}
                </option>
              ))
            ) : (
              <option value="" disabled>
                {t('暂无分类')}
              </option>
            )}
          </select>

          {/* 三级分类选择框 - 仅在有数据时显示 */}
          {thirdCategories.length > 0 && (
            <select
              value={selectedThirdCategory || ''}
              onChange={(e) => {
                const val = e.target.value;
                onThirdCategoryChange(val || null);
              }}
              className={styles.cascadeSelect}
            >
              <option value="">{t('三级分类')}</option>
              {thirdCategories.map((thirdCat) => (
                <option key={thirdCat.id} value={thirdCat.id}>
                  {thirdCat.name}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        /* 宽屏布局：使用下拉面板 */
        <>
          {/* 选择按钮 */}
          <Button
            variant="secondary"
            className={`${styles.cascadeButton} ${isOpen ? styles.open : ''} ${selectedPath.length > 0 ? styles.active : ''}`}
            onClick={() => setIsOpen(!isOpen)}
          >
            <span className={styles.cascadeButtonText}>
              {selectedPath.length > 0
                ? selectedPath.join(' > ')
                : t('选择分类')}
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
          </Button>

          {/* 级联面板 */}
          {isOpen && (
            <div
              ref={panelRef}
              className={`${styles.cascadePanel} ${shouldOpenUp ? styles.openUp : ''}`}
            >
              {/* 一级分类 */}
              <div className={styles.cascadeColumn}>
                <div className={styles.cascadeColumnTitle}>{t('一级分类')}</div>
                <div className={styles.cascadeColumnContent}>
                  <div
                    className={`${styles.cascadeItem} ${!selectedCategory ? styles.selected : ''}`}
                    onClick={() => {
                      onCategoryChange(null);
                      onSubCategoryChange(null);
                      onThirdCategoryChange(null);
                    }}
                  >
                    {t('全部分类')}
                  </div>
                  {categories.map((cat) => (
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
                  <div className={styles.cascadeColumnTitle}>
                    {t('二级分类')}
                  </div>
                  <div className={styles.cascadeColumnContent}>
                    <div
                      className={`${styles.cascadeItem} ${!selectedSubCategory ? styles.selected : ''}`}
                      onClick={() => {
                        onSubCategoryChange(null);
                        onThirdCategoryChange(null);
                      }}
                    >
                      {t('全部')}
                    </div>
                    {subCategories.map((subCat) => (
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
                          <ChevronRight
                            size={14}
                            className={styles.itemArrow}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 三级分类 */}
              {selectedSubCategory && thirdCategories.length > 0 && (
                <div className={styles.cascadeColumn}>
                  <div className={styles.cascadeColumnTitle}>
                    {t('三级分类')}
                  </div>
                  <div className={styles.cascadeColumnContent}>
                    <div
                      className={`${styles.cascadeItem} ${!selectedThirdCategory ? styles.selected : ''}`}
                      onClick={() => onThirdCategoryChange(null)}
                    >
                      {t('全部')}
                    </div>
                    {thirdCategories.map((thirdCat) => (
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
