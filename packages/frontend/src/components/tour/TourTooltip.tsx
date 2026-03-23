/**
 * TourTooltip - 引导提示气泡组件
 * 显示当前步骤的提示信息和操作按钮
 * 
 * 设计要点：
 * - 使用 getBoundingClientRect() 计算目标元素位置
 * - 根据 placement 属性定位气泡
 * - 自动调整位置避免超出视口
 * - 显示内容：步骤标题、描述、进度
 * - 支持交互模式，显示操作提示
 * @version 1.3.0
 */
import React, { useEffect, useRef, useState, useMemo } from 'react';
import type { TourStep, TooltipPlacement, StepMode } from '../../types/tour';
import { Button } from '../ui/Button';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import X from 'lucide-react/dist/esm/icons/x';
import MousePointerClick from 'lucide-react/dist/esm/icons/mouse-pointer-click';

interface TourTooltipProps {
  /** 当前步骤配置 */
  step: TourStep;
  /** 当前步骤索引（从 0 开始） */
  currentStep: number;
  /** 总步骤数 */
  totalSteps: number;
  /** 目标元素矩形（用于定位） */
  targetRect: DOMRect | null;
  /** 目标元素是否存在 */
  hasTarget: boolean;
  /** 下一步 */
  onNext: () => void;
  /** 上一步 */
  onPrev: () => void;
  /** 跳过引导 */
  onSkip: () => void;
}

/** z-index 层级（比 Overlay 高） */
const TOOLTIP_Z_INDEX = 10003;

/** 气泡与目标元素的间距 */
const TOOLTIP_GAP = 12;

/** 气泡箭头尺寸 */
const ARROW_SIZE = 8;

/** 气泡最小/最大宽度 */
const TOOLTIP_MIN_WIDTH = 280;
const TOOLTIP_MAX_WIDTH = 380;

/**
 * 计算气泡位置
 */
function calculateTooltipPosition(
  placement: TooltipPlacement,
  targetRect: DOMRect | null,
  tooltipSize: { width: number; height: number }
): { top: number; left: number; placement: TooltipPlacement } {
  // 无目标元素时，居中显示
  if (!targetRect) {
    return {
      top: (window.innerHeight - tooltipSize.height) / 2,
      left: (window.innerWidth - tooltipSize.width) / 2,
      placement: 'bottom',
    };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // 计算各方向的可用空间
  const spaceTop = targetRect.top;
  const spaceBottom = viewportHeight - targetRect.bottom;
  const spaceLeft = targetRect.left;
  const spaceRight = viewportWidth - targetRect.right;

  // 确定最终位置（自动调整）
  let finalPlacement = placement;
  
  // 根据可用空间自动调整位置
  if (placement === 'top' && spaceTop < tooltipSize.height + TOOLTIP_GAP + ARROW_SIZE) {
    finalPlacement = 'bottom';
  } else if (placement === 'bottom' && spaceBottom < tooltipSize.height + TOOLTIP_GAP + ARROW_SIZE) {
    finalPlacement = 'top';
  } else if (placement === 'left' && spaceLeft < tooltipSize.width + TOOLTIP_GAP + ARROW_SIZE) {
    finalPlacement = 'right';
  } else if (placement === 'right' && spaceRight < tooltipSize.width + TOOLTIP_GAP + ARROW_SIZE) {
    finalPlacement = 'left';
  }

  // 再次检查，如果仍然放不下，选择空间最大的一侧
  if (
    (finalPlacement === 'top' && spaceTop < tooltipSize.height + TOOLTIP_GAP + ARROW_SIZE) ||
    (finalPlacement === 'bottom' && spaceBottom < tooltipSize.height + TOOLTIP_GAP + ARROW_SIZE)
  ) {
    finalPlacement = spaceTop > spaceBottom ? 'top' : 'bottom';
  }

  if (
    (finalPlacement === 'left' && spaceLeft < tooltipSize.width + TOOLTIP_GAP + ARROW_SIZE) ||
    (finalPlacement === 'right' && spaceRight < tooltipSize.width + TOOLTIP_GAP + ARROW_SIZE)
  ) {
    finalPlacement = spaceLeft > spaceRight ? 'left' : 'right';
  }

  // 计算位置
  let top = 0;
  let left = 0;

  switch (finalPlacement) {
    case 'top':
      top = targetRect.top - tooltipSize.height - TOOLTIP_GAP - ARROW_SIZE;
      left = targetRect.left + (targetRect.width - tooltipSize.width) / 2;
      break;
    case 'bottom':
      top = targetRect.bottom + TOOLTIP_GAP + ARROW_SIZE;
      left = targetRect.left + (targetRect.width - tooltipSize.width) / 2;
      break;
    case 'left':
      top = targetRect.top + (targetRect.height - tooltipSize.height) / 2;
      left = targetRect.left - tooltipSize.width - TOOLTIP_GAP - ARROW_SIZE;
      break;
    case 'right':
      top = targetRect.top + (targetRect.height - tooltipSize.height) / 2;
      left = targetRect.right + TOOLTIP_GAP + ARROW_SIZE;
      break;
  }

  // 确保不超出视口
  left = Math.max(16, Math.min(left, viewportWidth - tooltipSize.width - 16));
  top = Math.max(16, Math.min(top, viewportHeight - tooltipSize.height - 16));

  return { top, left, placement: finalPlacement };
}

/**
 * 获取箭头样式
 */
function getArrowStyle(
  placement: TooltipPlacement,
  targetRect: DOMRect | null,
  tooltipLeft: number
): React.CSSProperties {
  if (!targetRect) {
    return { display: 'none' };
  }

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    width: 0,
    height: 0,
    border: `${ARROW_SIZE}px solid transparent`,
  };

  switch (placement) {
    case 'top':
      return {
        ...baseStyle,
        bottom: -ARROW_SIZE * 2,
        left: targetRect.left + targetRect.width / 2 - tooltipLeft,
        transform: 'translateX(-50%)',
        borderTopColor: 'var(--bg-elevated)',
      };
    case 'bottom':
      return {
        ...baseStyle,
        top: -ARROW_SIZE * 2,
        left: targetRect.left + targetRect.width / 2 - tooltipLeft,
        transform: 'translateX(-50%)',
        borderBottomColor: 'var(--bg-elevated)',
      };
    case 'left':
      return {
        ...baseStyle,
        right: -ARROW_SIZE * 2,
        top: '50%',
        transform: 'translateY(-50%)',
        borderLeftColor: 'var(--bg-elevated)',
      };
    case 'right':
      return {
        ...baseStyle,
        left: -ARROW_SIZE * 2,
        top: '50%',
        transform: 'translateY(-50%)',
        borderRightColor: 'var(--bg-elevated)',
      };
    default:
      return { display: 'none' };
  }
}

/**
 * 获取操作类型的默认提示
 */
function getActionHint(actionType: TourStep['actionType']): string {
  switch (actionType) {
    case 'click':
      return '请点击此元素完成操作';
    case 'right-click':
      return '请右键点击此元素';
    case 'input':
      return '请在此输入内容';
    case 'select':
      return '请选择一个选项';
    default:
      return '请完成操作后继续';
  }
}

export const TourTooltip: React.FC<TourTooltipProps> = ({
  step,
  currentStep,
  totalSteps,
  targetRect,
  hasTarget,
  onNext,
  onPrev,
  onSkip,
}) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, placement: step.placement ?? 'bottom' });
  const [tooltipSize, setTooltipSize] = useState({ width: TOOLTIP_MIN_WIDTH, height: 200 });

  // 获取步骤模式，默认为 display
  const stepMode: StepMode = step.mode ?? 'display';
  const isInteractiveMode = stepMode === 'interactive';

  /** 计算气泡位置 */
  const updatePosition = useMemo(() => {
    return () => {
      if (!tooltipRef.current) return;
      
      const rect = tooltipRef.current.getBoundingClientRect();
      setTooltipSize({ width: rect.width, height: rect.height });
      
      const newPosition = calculateTooltipPosition(
        step.placement ?? 'bottom',
        targetRect,
        { width: rect.width, height: rect.height }
      );
      setPosition(newPosition);
    };
  }, [step.placement, targetRect]);

  /** 监听目标元素变化 */
  useEffect(() => {
    updatePosition();
  }, [updatePosition, targetRect]);

  /** 监听窗口大小变化 */
  useEffect(() => {
    const handleResize = () => {
      requestAnimationFrame(updatePosition);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updatePosition]);

  /** 初始位置计算 */
  useEffect(() => {
    // 延迟一帧确保 DOM 已渲染
    requestAnimationFrame(updatePosition);
  }, [updatePosition]);

  const isLastStep = currentStep >= totalSteps - 1;
  const isFirstStep = currentStep === 0;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  /** 获取显示内容 */
  const displayContent = useMemo(() => {
    if (!hasTarget && step.fallbackContent) {
      return {
        title: step.title,
        content: step.fallbackContent,
      };
    }
    return {
      title: step.title,
      content: step.content,
    };
  }, [hasTarget, step]);

  /** 获取交互模式提示 */
  const interactionHint = useMemo(() => {
    if (!isInteractiveMode) return null;
    return step.actionHint ?? getActionHint(step.actionType);
  }, [isInteractiveMode, step.actionHint, step.actionType]);

  return (
    <div
      ref={tooltipRef}
      className="tour-tooltip"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: TOOLTIP_Z_INDEX,
        minWidth: TOOLTIP_MIN_WIDTH,
        maxWidth: TOOLTIP_MAX_WIDTH,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-xl)',
        overflow: 'hidden',
        animation: 'tooltipFadeIn 0.2s ease-out',
      }}
    >
      {/* 箭头 */}
      {hasTarget && (
        <div
          style={getArrowStyle(position.placement, targetRect, position.left)}
        />
      )}

      {/* 头部 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-default)',
          background: isInteractiveMode ? 'var(--primary-50)' : 'var(--bg-tertiary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: isInteractiveMode ? 'var(--primary-600)' : 'var(--primary-500)',
              background: isInteractiveMode ? 'var(--primary-100)' : 'var(--primary-100)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {isInteractiveMode && <MousePointerClick size={12} />}
            {currentStep + 1} / {totalSteps}
          </span>
          <h4
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            {displayContent.title}
          </h4>
        </div>
        <button
          onClick={onSkip}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            borderRadius: 'var(--radius-md)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-tertiary)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
          title="跳过引导"
        >
          <X size={16} />
        </button>
      </div>

      {/* 内容 */}
      <div
        style={{
          padding: '16px',
          color: 'var(--text-secondary)',
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        {displayContent.content}
      </div>

      {/* 交互模式提示 */}
      {isInteractiveMode && interactionHint && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--primary-50)',
            borderTop: '1px solid var(--primary-100)',
            color: 'var(--primary-700)',
            fontSize: 13,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <MousePointerClick size={16} />
          {interactionHint}
        </div>
      )}

      {/* 进度条 */}
      <div
        style={{
          height: 3,
          background: 'var(--bg-tertiary)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: isInteractiveMode 
              ? 'linear-gradient(90deg, var(--primary-600), var(--primary-500))'
              : 'linear-gradient(90deg, var(--primary-500), var(--primary-400))',
            transition: 'width 0.3s ease-out',
          }}
        />
      </div>

      {/* 底部按钮 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderTop: '1px solid var(--border-default)',
          background: 'var(--bg-tertiary)',
        }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={onSkip}
        >
          跳过引导
        </Button>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isFirstStep && (
            <Button
              variant="outline"
              size="sm"
              icon={ChevronLeft}
              onClick={onPrev}
            >
              上一步
            </Button>
          )}
          {/* 交互模式不显示下一步按钮，用户需要完成操作 */}
          {!isInteractiveMode && (
            <Button
              variant="primary"
              size="sm"
              icon={isLastStep ? undefined : ChevronRight}
              onClick={onNext}
            >
              {isLastStep ? '完成' : '下一步'}
            </Button>
          )}
          {/* 交互模式显示等待提示 */}
          {isInteractiveMode && (
            <span
              style={{
                fontSize: 13,
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  border: '2px solid var(--primary-500)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'tooltip-spin 1s linear infinite',
                }}
              />
              等待操作...
            </span>
          )}
        </div>
      </div>

      <style>{`
        @keyframes tooltipFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        @keyframes tooltip-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default TourTooltip;