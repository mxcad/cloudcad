/**
 * TourCenter - 引导中心弹窗组件
 * 展示所有引导流程列表，支持分类浏览和搜索
 * 
 * 设计要点：
 * - 复用 Modal 组件实现弹窗
 * - 分类展示引导流程（动态从引导配置生成）
 * - 显示完成状态和进度
 * - 支持搜索筛选
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useTour } from '../../contexts/TourContext';
import type { TourGuide, TourCategory } from '../../types/tour';

// Lucide 图标导入
import { Search } from 'lucide-react';
import { CheckCircle } from 'lucide-react';
import { Circle } from 'lucide-react';
import { PlayCircle } from 'lucide-react';
import { Clock } from 'lucide-react';
import { FolderOpen } from 'lucide-react';

/** z-index 层级（与引导遮罩层一致） */
const TOUR_CENTER_Z_INDEX = 10002;

/** 默认分类图标 */
const DefaultCategoryIcon = FolderOpen;

interface TourCenterProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
}

/**
 * 引导卡片组件
 */
const TourCard: React.FC<{
  guide: TourGuide;
  isCompleted: boolean;
  onStart: () => void;
}> = ({ guide, isCompleted, onStart }) => {
  return (
    <div
      className="group relative p-4 rounded-xl transition-all duration-300 cursor-pointer"
      style={{
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-default)',
      }}
      onClick={onStart}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--primary-400)';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* 完成标记 */}
      {isCompleted && (
        <div
          className="absolute top-2 right-2"
          style={{ color: 'var(--success)' }}
        >
          <CheckCircle size={20} />
        </div>
      )}
      
      {/* 图标 */}
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
        style={{
          background: isCompleted 
            ? 'linear-gradient(135deg, var(--success-light), var(--success-dim))'
            : 'linear-gradient(135deg, var(--primary-100), var(--primary-50))',
        }}
      >
        <DefaultCategoryIcon 
          size={20} 
          className={isCompleted ? 'text-[var(--success)]' : 'text-[var(--primary-500)]'}
        />
      </div>
      
      {/* 标题 */}
      <h4
        className="text-sm font-semibold mb-1"
        style={{ color: 'var(--text-primary)' }}
      >
        {guide.name}
      </h4>
      
      {/* 描述 */}
      <p
        className="text-xs mb-3 line-clamp-2"
        style={{ color: 'var(--text-muted)' }}
      >
        {guide.description}
      </p>
      
      {/* 底部信息 */}
      <div
        className="flex items-center justify-between text-xs"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {guide.estimatedTime}
        </span>
        <span className="flex items-center gap-1">
          {isCompleted ? (
            <CheckCircle size={12} style={{ color: 'var(--success)' }} />
          ) : (
            <Circle size={12} />
          )}
          {guide.steps.length} 步
        </span>
      </div>
      
      {/* 开始按钮（悬停显示） */}
      <div
        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl"
        style={{ background: 'var(--bg-overlay)' }}
      >
        <Button
          variant="primary"
          size="sm"
          icon={isCompleted ? PlayCircle : undefined}
          onClick={(e) => {
            e.stopPropagation();
            onStart();
          }}
        >
          {isCompleted ? '重新开始' : '开始引导'}
        </Button>
      </div>
    </div>
  );
};

export const TourCenter: React.FC<TourCenterProps> = ({
  isOpen,
  onClose,
}) => {
  const { guides, completedGuides, startTour, isActive } = useTour();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TourCategory | 'all'>('all');

  /** 从引导配置动态提取分类列表（保持首次出现的顺序） */
  const categories = useMemo(() => {
    const seen = new Set<TourCategory>();
    const result: TourCategory[] = [];
    
    guides.forEach(guide => {
      if (!seen.has(guide.category)) {
        seen.add(guide.category);
        result.push(guide.category);
      }
    });
    
    return result;
  }, [guides]);

  /** 按分类分组 */
  const guidesByCategory = useMemo(() => {
    const result: Record<TourCategory, TourGuide[]> = {};
    
    guides.forEach(guide => {
      if (!result[guide.category]) {
        result[guide.category] = [];
      }
      result[guide.category]!.push(guide);
    });
    
    return result;
  }, [guides]);

  /** 筛选后的引导列表 */
  const filteredGuides = useMemo(() => {
    let result = guides;
    
    // 搜索筛选
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(guide => 
        guide.name.toLowerCase().includes(query) ||
        guide.description.toLowerCase().includes(query)
      );
    }
    
    // 分类筛选
    if (selectedCategory !== 'all') {
      result = result.filter(guide => guide.category === selectedCategory);
    }
    
    return result;
  }, [guides, searchQuery, selectedCategory]);

  /** 统计信息 */
  const stats = useMemo(() => {
    const total = guides.length;
    const completed = completedGuides.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percentage };
  }, [guides, completedGuides]);

  /** 开始引导 */
  const handleStartTour = useCallback((guideId: string) => {
    startTour(guideId);
    onClose();
  }, [startTour, onClose]);

  /** 按分类筛选后的引导 */
  const categorizedGuides = useMemo(() => {
    if (selectedCategory !== 'all') {
      return { [selectedCategory]: filteredGuides.filter(g => g.category === selectedCategory) };
    }
    
    const result: Partial<Record<TourCategory, TourGuide[]>> = {};
    categories.forEach(category => {
      const categoryGuides = filteredGuides.filter(g => g.category === category);
      if (categoryGuides.length > 0) {
        result[category] = categoryGuides;
      }
    });
    return result;
  }, [filteredGuides, selectedCategory, categories]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="引导中心"
      size="full"
      zIndex={TOUR_CENTER_Z_INDEX}
    >
      {/* 搜索和统计 */}
      <div className="mb-6 space-y-4">
        {/* 进度统计 */}
        <div
          className="flex items-center gap-4 p-4 rounded-xl"
          style={{ background: 'var(--bg-tertiary)' }}
        >
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                学习进度
              </span>
              <span className="text-sm font-semibold" style={{ color: 'var(--primary-500)' }}>
                {stats.completed} / {stats.total}
              </span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ background: 'var(--bg-secondary)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${stats.percentage}%`,
                  background: 'linear-gradient(90deg, var(--primary-500), var(--primary-400))',
                }}
              />
            </div>
          </div>
          <div
            className="text-center p-3 rounded-xl"
            style={{ background: 'var(--bg-secondary)' }}
          >
            <div className="text-2xl font-bold" style={{ color: 'var(--primary-500)' }}>
              {stats.percentage}%
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              已完成
            </div>
          </div>
        </div>

        {/* 搜索框 */}
        <div className="relative">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            placeholder="搜索引导流程..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-xl transition-all duration-200 outline-none"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'var(--primary-500)';
              e.target.style.boxShadow = '0 0 0 3px var(--primary-100)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'var(--border-default)';
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* 分类筛选 */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSelectedCategory('all')}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
            style={{
              background: selectedCategory === 'all' ? 'var(--primary-500)' : 'var(--bg-tertiary)',
              color: selectedCategory === 'all' ? 'white' : 'var(--text-secondary)',
              border: '1px solid transparent',
            }}
          >
            全部
          </button>
          {categories.map(category => {
            const count = guidesByCategory[category]?.length || 0;
            if (count === 0) return null;
            return (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  background: selectedCategory === category ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                  color: selectedCategory === category ? 'white' : 'var(--text-secondary)',
                  border: '1px solid transparent',
                }}
              >
                {category} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* 引导列表 */}
      {filteredGuides.length === 0 ? (
        <div className="text-center py-12">
          <Search size={48} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <p style={{ color: 'var(--text-muted)' }}>
            {searchQuery ? '未找到匹配的引导流程' : '暂无引导流程'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(categorizedGuides).map(([category, categoryGuides]) => {
            if (!categoryGuides || categoryGuides.length === 0) return null;
            
            return (
              <div key={category}>
                {/* 分类标题 */}
                <div className="flex items-center gap-2 mb-3">
                  <DefaultCategoryIcon size={18} className="text-[var(--primary-500)]" />
                  <h3
                    className="text-sm font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {category}
                  </h3>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {categoryGuides.length}
                  </span>
                </div>
                
                {/* 引导卡片网格 */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {categoryGuides.map(guide => (
                    <TourCard
                      key={guide.id}
                      guide={guide}
                      isCompleted={completedGuides.includes(guide.id)}
                      onStart={() => handleStartTour(guide.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 当前引导提示 */}
      {isActive && (
        <div
          className="mt-6 p-4 rounded-xl flex items-center justify-between"
          style={{
            background: 'var(--primary-50)',
            border: '1px solid var(--primary-200)',
          }}
        >
          <div className="flex items-center gap-3">
            <PlayCircle size={20} style={{ color: 'var(--primary-500)' }} />
            <span className="text-sm" style={{ color: 'var(--primary-600)' }}>
              当前有引导正在进行中
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
          >
            继续引导
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default TourCenter;