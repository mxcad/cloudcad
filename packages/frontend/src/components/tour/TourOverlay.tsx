/**
 * TourOverlay - 引导遮罩层组件
 * 全屏遮罩层，高亮当前步骤的目标元素
 * 
 * 设计要点：
 * - 使用 SVG mask 实现镂空遮罩效果
 * - 监听 resize 和 scroll 事件，实时更新高亮位置
 * - 目标元素自动滚动到视口内
 * - ESC 键可退出引导
 * - 支持自定义滚动容器
 * - 支持交互模式和展示模式
 * @version 1.3.0
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { TourStep, WaitForElementResult, StepMode, TourStepAlternative, UICondition } from '../../types/tour';

interface TourOverlayProps {
  /** 当前步骤 */
  step: TourStep;
  /** 是否激活 */
  isActive: boolean;
  /** 子组件渲染函数 */
  children: (props: { targetRect: DOMRect | null; hasTarget: boolean }) => React.ReactNode;
  /** 跳过引导 */
  onSkip: () => void;
  /** 跳过当前步骤（自动跳到下一步） */
  onSkipStep: () => void;
  /** 用户完成交互操作回调（交互模式） */
  onInteractionComplete?: () => void;
}

/** 高亮区域的边距 */
const HIGHLIGHT_PADDING = 8;

/** z-index 层级 */
const OVERLAY_Z_INDEX = 10002;

/**
 * 获取元素的最近滚动容器
 */
function getScrollParent(element: HTMLElement): HTMLElement | Document {
  const style = getComputedStyle(element);
  const excludeStaticParent = style.position === 'absolute';
  const overflowRegex = /(auto|scroll)/;

  let parent = element.parentElement;

  while (parent) {
    const parentStyle = getComputedStyle(parent);
    
    if (excludeStaticParent && parentStyle.position === 'static') {
      parent = parent.parentElement;
      continue;
    }

    if (overflowRegex.test(parentStyle.overflow + parentStyle.overflowY + parentStyle.overflowX)) {
      return parent;
    }

    parent = parent.parentElement;
  }

  return document.body;
}

/**
 * 检查元素是否可见
 */
function isElementVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  if (parseFloat(style.opacity) === 0) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return false;
  }

  // 检查是否被祖先元素的 overflow:hidden 裁剪
  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    const parentStyle = getComputedStyle(parent);
    if (parentStyle.overflow === 'hidden') {
      const parentRect = parent.getBoundingClientRect();
      if (
        rect.bottom < parentRect.top ||
        rect.top > parentRect.bottom ||
        rect.right < parentRect.left ||
        rect.left > parentRect.right
      ) {
        return false;
      }
    }
    parent = parent.parentElement;
  }

  return true;
}

/**
 * 滚动到目标元素
 */
function scrollIntoView(element: HTMLElement): void {
  const scrollParent = getScrollParent(element);
  
  if (scrollParent === document.body || scrollParent === document.documentElement) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    const container = scrollParent as HTMLElement;
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const scrollTop = elementRect.top - containerRect.top + container.scrollTop - containerRect.height / 2;
    container.scrollTo({ top: scrollTop, behavior: 'smooth' });
  }
}

/**
 * 等待目标元素出现
 */
async function waitForTargetElement(
  selector: string,
  timeout: number,
  requireVisible: boolean = true
): Promise<WaitForElementResult> {
  return new Promise((resolve) => {
    let found = false;
    
    const checkElement = (): HTMLElement | null => {
      const elements = document.querySelectorAll<HTMLElement>(selector);
      if (elements.length === 0) return null;
      // 始终取最后一个匹配的元素
      const el = elements[elements.length - 1]!;
      if (!requireVisible) return el;
      return isElementVisible(el) ? el : null;
    };

    const observer = new MutationObserver(() => {
      const el = checkElement();
      if (el) {
        found = true;
        observer.disconnect();
        resolve({ element: el });
      }
    });
    
    observer.observe(document.body, { 
      childList: true, 
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden']
    });
    
    // 立即检查一次
    const existingEl = checkElement();
    if (existingEl) {
      found = true;
      observer.disconnect();
      resolve({ element: existingEl });
      return;
    }
    
    // 超时处理
    setTimeout(() => {
      if (!found) {
        observer.disconnect();
        const elements = document.querySelectorAll<HTMLElement>(selector);
        const el = elements.length > 0 ? elements[elements.length - 1]! : null;
        resolve({
          element: null,
          reason: el ? 'not-visible' : 'timeout'
        });
      }
    }, timeout);
  });
}

/**
 * 检查跳过条件是否满足
 */
function checkSkipCondition(step: TourStep): boolean {
  const { skipCondition } = step;
  if (!skipCondition) return false;

  switch (skipCondition.type) {
    case 'element-exists':
      if (!skipCondition.selector) return false;
      return document.querySelector(skipCondition.selector) !== null;
    
    case 'element-not-exists':
      if (!skipCondition.selector) return false;
      return !document.querySelector(skipCondition.selector);
    
    case 'element-count-zero':
      if (!skipCondition.selector) return false;
      return document.querySelectorAll(skipCondition.selector).length === 0;
    
    case 'feature-disabled':
      if (!skipCondition.featureFlag) return false;
      // 检查功能开关状态（可根据实际业务扩展）
      return false;
    
    case 'custom':
      if (skipCondition.customCheck) {
        return skipCondition.customCheck();
      }
      return false;
    
    default:
      return false;
  }
}

/**
 * 高亮区域状态
 */
interface HighlightState {
  /** 目标元素矩形 */
  rect: DOMRect | null;
  /** 目标元素 */
  element: HTMLElement | null;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 加载失败原因 */
  error?: 'timeout' | 'not-visible' | 'not-exists';
}

export const TourOverlay: React.FC<TourOverlayProps> = ({
  step,
  isActive,
  children,
  onSkip,
  onSkipStep,
  onInteractionComplete,
}) => {
  const [highlight, setHighlight] = useState<HighlightState>({
    rect: null,
    element: null,
    isLoading: true,
  });
  
  const overlayRef = useRef<HTMLDivElement>(null);
  const interactionCompletedRef = useRef(false);

  // 获取步骤模式，默认为 display
  const stepMode: StepMode = step.mode ?? 'display';
  const isInteractiveMode = stepMode === 'interactive';

  /** 更新高亮位置 */
  const updateHighlightPosition = useCallback(() => {
    if (!highlight.element) return;
    
    const rect = highlight.element.getBoundingClientRect();
    setHighlight(prev => ({ ...prev, rect }));
  }, [highlight.element]);

  /** 查找目标元素 */
  useEffect(() => {
    if (!isActive) {
      setHighlight({ rect: null, element: null, isLoading: false });
      return;
    }

    let cancelled = false;
    const selector = `[data-tour="${step.target}"]`;
    const timeout = step.waitForElement === 'auto' ? 5000 : (step.waitForElement ?? 3000);

    const findElement = async () => {
      setHighlight(prev => ({ ...prev, isLoading: true }));
      
      const result = await waitForTargetElement(selector, timeout);
      
      if (cancelled) return;
      
      if (result.element) {
        scrollIntoView(result.element);
        const rect = result.element.getBoundingClientRect();
        setHighlight({
          rect,
          element: result.element,
          isLoading: false,
        });
        
        // 重置交互完成状态
        interactionCompletedRef.current = false;
      } else {
        // 元素未找到
        // 1. 先检查 skipCondition 是否满足
        if (checkSkipCondition(step)) {
          // 跳过条件满足，自动跳到下一步
          console.log(`[Tour] Step "${step.target}" skipped by condition: ${step.skipCondition?.type}`);
          onSkipStep();
          return;
        }
        
        // 2. 检查是否有 fallbackContent
        if (step.fallbackContent) {
          setHighlight({
            rect: null,
            element: null,
            isLoading: false,
            error: result.reason,
          });
        } else {
          // 3. 没有任何处理方式，显示错误状态
          console.warn(`[Tour] Element "${step.target}" not found and no fallback/skipCondition defined`);
          setHighlight({
            rect: null,
            element: null,
            isLoading: false,
            error: result.reason,
          });
        }
      }
    };

    findElement();

    return () => {
      cancelled = true;
    };
  }, [isActive, step, onSkipStep]);

  /** 监听 resize 和 scroll 事件 */
  useEffect(() => {
    if (!isActive || !highlight.element) return;

    const handleResize = () => {
      requestAnimationFrame(updateHighlightPosition);
    };

    const handleScroll = () => {
      requestAnimationFrame(updateHighlightPosition);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isActive, highlight.element, updateHighlightPosition]);

  /** ESC 键退出 */
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkip();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onSkip]);

  /** 交互模式：监听用户操作 */
  useEffect(() => {
    if (!isActive || !highlight.element || !isInteractiveMode) return;
    if (interactionCompletedRef.current) return;

    const targetElement = highlight.element;
    const actionType = step.actionType ?? 'click';

    // 防抖计时器（用于 input 类型）
    let inputDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const INPUT_DEBOUNCE_DELAY = 1500; // 用户停止输入 1.5 秒后触发完成

    /**
     * 检查事件是否发生在目标元素或其子元素上
     */
    const isEventOnTarget = (event: Event): boolean => {
      const eventTarget = event.target as HTMLElement;
      return targetElement.contains(eventTarget);
    };

    /**
     * 处理交互完成
     */
    const handleInteractionComplete = (e: Event) => {
      // 标记交互已完成
      interactionCompletedRef.current = true;
      
      // 清除防抖计时器
      if (inputDebounceTimer) {
        clearTimeout(inputDebounceTimer);
        inputDebounceTimer = null;
      }
      
      // 通知父组件交互完成
      if (onInteractionComplete) {
        // 延迟调用，让用户看到操作效果
        setTimeout(() => {
          onInteractionComplete();
        }, 300);
      }
    };

    /**
     * 点击事件处理器 - 使用捕获阶段确保在遮罩层之前捕获
     */
    const handleClick = (e: MouseEvent) => {
      if (isEventOnTarget(e)) {
        handleInteractionComplete(e);
      }
    };

    /**
     * 右键点击事件处理器
     */
    const handleContextMenu = (e: MouseEvent) => {
      if (isEventOnTarget(e)) {
        handleInteractionComplete(e);
      }
    };

    /**
     * 输入事件处理器 - 使用防抖机制
     * 用户输入时重置计时器，停止输入 1.5 秒后触发完成
     */
    const handleInput = (e: Event) => {
      if (isEventOnTarget(e)) {
        const target = e.target as HTMLInputElement;
        if (target.value.length > 0) {
          // 清除之前的计时器
          if (inputDebounceTimer) {
            clearTimeout(inputDebounceTimer);
          }
          // 设置新的计时器
          inputDebounceTimer = setTimeout(() => {
            handleInteractionComplete(e);
          }, INPUT_DEBOUNCE_DELAY);
        }
      }
    };

    /**
     * 选择变更事件处理器
     */
    const handleChange = (e: Event) => {
      if (isEventOnTarget(e)) {
        handleInteractionComplete(e);
      }
    };

    // 根据操作类型添加事件监听器
    // 使用捕获阶段（capture: true）确保在遮罩层之前捕获事件
    switch (actionType) {
      case 'click':
        document.addEventListener('click', handleClick, true);
        break;
      case 'right-click':
        document.addEventListener('contextmenu', handleContextMenu, true);
        break;
      case 'input':
        document.addEventListener('input', handleInput, true);
        break;
      case 'select':
        document.addEventListener('change', handleChange, true);
        break;
    }

    return () => {
      // 清理防抖计时器
      if (inputDebounceTimer) {
        clearTimeout(inputDebounceTimer);
      }
      
      // 清理事件监听器
      switch (actionType) {
        case 'click':
          document.removeEventListener('click', handleClick, true);
          break;
        case 'right-click':
          document.removeEventListener('contextmenu', handleContextMenu, true);
          break;
        case 'input':
          document.removeEventListener('input', handleInput, true);
          break;
        case 'select':
          document.removeEventListener('change', handleChange, true);
          break;
      }
    };
  }, [isActive, highlight.element, isInteractiveMode, step.actionType, onInteractionComplete]);

  if (!isActive) return null;

  // 计算高亮区域
  const highlightRect = highlight.rect;
  const hasTarget = highlightRect !== null;

  // 交互模式下，需要让点击穿透到目标元素
  // TourTooltip 本身也是 fixed 定位，z-index 比容器高
  // 但 TourTooltip 是定位在目标元素附近的，通常不会遮挡目标
  // 解决方案：容器在交互模式下也设置 pointer-events: none，让点击穿透
  // ESC 键监听是通过 document 全局事件处理的，不依赖容器
  const highlightPointerEvents = 'none'; // 高亮边框始终不拦截事件

  return (
    <div
      ref={overlayRef}
      className="tour-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: OVERLAY_Z_INDEX,
        pointerEvents: isInteractiveMode ? 'none' : 'auto', // 交互模式下让点击穿透到目标元素
      }}
    >
      {/* 遮罩层 - 使用 SVG 绘制镂空效果 */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: isInteractiveMode ? 'none' : 'auto', // 交互模式下让点击穿透
        }}
      >
        <defs>
          <mask id="tour-overlay-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {highlightRect && (
              <rect
                x={highlightRect.left - HIGHLIGHT_PADDING}
                y={highlightRect.top - HIGHLIGHT_PADDING}
                width={highlightRect.width + HIGHLIGHT_PADDING * 2}
                height={highlightRect.height + HIGHLIGHT_PADDING * 2}
                rx={8}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.5)"
          mask="url(#tour-overlay-mask)"
        />
      </svg>

      {/* 高亮边框 */}
      {highlightRect && (
        <div
          className="tour-highlight-border"
          style={{
            position: 'fixed',
            top: highlightRect.top - HIGHLIGHT_PADDING,
            left: highlightRect.left - HIGHLIGHT_PADDING,
            width: highlightRect.width + HIGHLIGHT_PADDING * 2,
            height: highlightRect.height + HIGHLIGHT_PADDING * 2,
            border: '2px solid var(--primary-500)',
            borderRadius: 8,
            boxShadow: step.highlight 
              ? '0 0 0 4px rgba(59, 130, 246, 0.3), 0 0 0 8px rgba(59, 130, 246, 0.2)'
              : '0 0 0 4px rgba(59, 130, 246, 0.3)',
            pointerEvents: highlightPointerEvents,
            transition: 'all 0.2s ease-out',
          }}
        >
          {/* 交互模式高亮脉冲动画 */}
          {isInteractiveMode && step.highlight && (
            <div
              style={{
                position: 'absolute',
                inset: -4,
                border: '2px solid var(--primary-400)',
                borderRadius: 10,
                animation: 'tour-pulse 1.5s ease-in-out infinite',
              }}
            />
          )}
        </div>
      )}

      {/* 加载状态 */}
      {highlight.isLoading && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'var(--text-primary)',
            background: 'var(--bg-elevated)',
            padding: '16px 24px',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              border: '2px solid var(--primary-500)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'tour-spin 1s linear infinite',
            }}
          />
          正在定位目标元素...
        </div>
      )}

      {/* 子组件（TourTooltip） */}
      {!highlight.isLoading && children({ 
        targetRect: highlightRect, 
        hasTarget 
      })}

      {/* 样式定义 */}
      <style>{`
        @keyframes tour-pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.05);
          }
        }
        
        @keyframes tour-spin {
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

export default TourOverlay;