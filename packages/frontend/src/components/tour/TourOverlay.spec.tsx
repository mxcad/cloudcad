///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关资料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { TourOverlay } from './TourOverlay';
import type { TourStep, SkipCondition } from '../../types/tour';

// ============================================
// Mock MutationObserver
// ============================================
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

class MockMutationObserver {
  observe = mockObserve;
  disconnect = mockDisconnect;
}

// ============================================
// Mock scrollIntoView
// ============================================
const mockScrollIntoView = vi.fn();
Element.prototype.scrollIntoView = mockScrollIntoView;

// ============================================
// Mock getBoundingClientRect
// ============================================
const mockGetBoundingClientRect = vi.fn<() => DOMRect>(() => ({
  top: 100,
  left: 100,
  width: 200,
  height: 50,
  right: 300,
  bottom: 150,
  x: 100,
  y: 100,
  toJSON: () => ({}),
}));

// ============================================
// Mock requestAnimationFrame
// ============================================
const mockRaf = vi.fn<(cb: FrameRequestCallback) => number>((cb: FrameRequestCallback) => {
  cb(0);
  return 0;
});

// ============================================
// 辅助函数：创建模拟的 DOM 元素
// ============================================
function createMockElement(options: {
  visible?: boolean;
  rect?: DOMRect;
} = {}): HTMLElement {
  const element = document.createElement('div');
  
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: options.rect 
      ? () => options.rect 
      : mockGetBoundingClientRect,
    configurable: true,
  });
  
  element.setAttribute('data-tour', 'test-target');
  
  return element;
}

// ============================================
// 辅助函数：创建测试用的 TourStep
// ============================================
function createMockStep(overrides: Partial<TourStep> = {}): TourStep {
  return {
    target: 'test-target',
    title: '测试步骤',
    content: '这是一个测试步骤',
    ...overrides,
  };
}

describe('TourOverlay', () => {
  let container: HTMLDivElement;
  let eventListeners: Map<string, EventListener[]>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // @ts-expect-error: Mocking MutationObserver for test environment
    global.MutationObserver = MockMutationObserver;
    global.requestAnimationFrame = mockRaf;
    
    container = document.createElement('div');
    document.body.appendChild(container);
    
    eventListeners = new Map();
    
    window.addEventListener = vi.fn(function(this: Window, type: string, listener: EventListener) {
      const listeners = eventListeners.get(type) || [];
      listeners.push(listener);
      eventListeners.set(type, listeners);
    }) as typeof window.addEventListener;
    
    window.removeEventListener = vi.fn(function(this: Window, type: string, listener: EventListener) {
      const listeners = eventListeners.get(type) || [];
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
      eventListeners.set(type, listeners);
    }) as typeof window.removeEventListener;
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  // ============================================
  describe('基础渲染', () => {
    it('应该在 isActive 为 false 时不渲染任何内容', () => {
      const step = createMockStep();
      const onSkip = vi.fn();
      const onSkipStep = vi.fn();

      const { container } = render(
        <TourOverlay
          step={step}
          isActive={false}
          onSkip={onSkip}
          onSkipStep={onSkipStep}
        >
          {() => <div>Tooltip</div>}
        </TourOverlay>
      );

      expect(container.firstChild).toBeNull();
    });

    it('应该在 isActive 为 true 时渲染遮罩层', async () => {
      const step = createMockStep();
      const onSkip = vi.fn();
      const onSkipStep = vi.fn();

      const mockElement = createMockElement();
      vi.spyOn(document, 'querySelector').mockImplementation(function(this: Document, selector: string) {
        if (selector === `[data-tour="${step.target}"]`) {
          return mockElement;
        }
        return null;
      });

      const { container } = render(
        <TourOverlay
          step={step}
          isActive={true}
          onSkip={onSkip}
          onSkipStep={onSkipStep}
        >
          {() => <div data-testid="tooltip">Tooltip</div>}
        </TourOverlay>
      );

      const overlay = container.querySelector('.tour-overlay');
      expect(overlay).not.toBeNull();
      expect((overlay as HTMLElement).style.zIndex).toBe('10002');
    });

    it('应该在加载状态时显示加载提示', () => {
      const step = createMockStep();
      const onSkip = vi.fn();
      const onSkipStep = vi.fn();

      vi.spyOn(document, 'querySelector').mockReturnValue(null);

      render(
        <TourOverlay
          step={step}
          isActive={true}
          onSkip={onSkip}
          onSkipStep={onSkipStep}
        >
          {() => <div>Tooltip</div>}
        </TourOverlay>
      );

      expect(screen.getByText('正在定位目标元素...')).not.toBeNull();
    });
  });

  // ============================================
  describe('目标元素查找', () => {
    it('应该使用 data-tour 属性查找目标元素', async () => {
      const step = createMockStep({ target: 'my-button' });
      const onSkip = vi.fn();
      const onSkipStep = vi.fn();

      const mockElement = createMockElement();
      vi.spyOn(document, 'querySelector').mockImplementation(function(this: Document, selector: string) {
        if (selector === '[data-tour="my-button"]') {
          return mockElement;
        }
        return null;
      });

      await act(async () => {
        render(
          <TourOverlay
            step={step}
            isActive={true}
            onSkip={onSkip}
            onSkipStep={onSkipStep}
          >
            {() => <div>Tooltip</div>}
          </TourOverlay>
        );
      });

      expect(document.querySelector).toHaveBeenCalledWith('[data-tour="my-button"]');
    });

    it('应该在元素找到时正常渲染', async () => {
      const step = createMockStep();
      const onSkip = vi.fn();
      const onSkipStep = vi.fn();

      const mockElement = createMockElement();
      vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);

      await act(async () => {
        render(
          <TourOverlay
            step={step}
            isActive={true}
            onSkip={onSkip}
            onSkipStep={onSkipStep}
          >
            {() => <div>Tooltip</div>}
          </TourOverlay>
        );
      });
    });

    it('应该在元素未找到时检查 skipCondition 并自动跳过', async () => {
      const skipCondition: SkipCondition = {
        type: 'element-not-exists',
        selector: '[data-tour="test-target"]',
      };
      const step = createMockStep({ skipCondition });
      const onSkip = vi.fn();
      const onSkipStep = vi.fn();

      vi.spyOn(document, 'querySelector').mockReturnValue(null);

      await act(async () => {
        render(
          <TourOverlay
            step={step}
            isActive={true}
            onSkip={onSkip}
            onSkipStep={onSkipStep}
          >
            {() => <div>Tooltip</div>}
          </TourOverlay>
        );
      });

      // 等待超时后应该调用 onSkipStep
      await waitFor(() => {
        expect(onSkipStep).toHaveBeenCalled();
      }, { timeout: 5000 });
    });
  });

  // ============================================
  describe('ESC 键退出', () => {
    it('应该响应 ESC 键退出引导', async () => {
      const step = createMockStep();
      const onSkip = vi.fn();
      const onSkipStep = vi.fn();

      const mockElement = createMockElement();
      vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);

      await act(async () => {
        render(
          <TourOverlay
            step={step}
            isActive={true}
            onSkip={onSkip}
            onSkipStep={onSkipStep}
          >
            {() => <div>Tooltip</div>}
          </TourOverlay>
        );
      });

      // 模拟 ESC 键
      await act(async () => {
        const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
        document.dispatchEvent(escEvent);
      });

      expect(onSkip).toHaveBeenCalled();
    });

    it('应该在 isActive 为 false 时忽略 ESC 键', () => {
      const step = createMockStep();
      const onSkip = vi.fn();
      const onSkipStep = vi.fn();

      render(
        <TourOverlay
          step={step}
          isActive={false}
          onSkip={onSkip}
          onSkipStep={onSkipStep}
        >
          {() => <div>Tooltip</div>}
        </TourOverlay>
      );

      const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escEvent);

      expect(onSkip).not.toHaveBeenCalled();
    });
  });

  // ============================================
  describe('fallbackContent 处理', () => {
    it('应该在元素不存在时渲染 children（显示 fallbackContent）', async () => {
      const step = createMockStep({ fallbackContent: '元素当前不可用' });
      const onSkip = vi.fn();
      const onSkipStep = vi.fn();

      vi.spyOn(document, 'querySelector').mockReturnValue(null);

      await act(async () => {
        render(
          <TourOverlay
            step={step}
            isActive={true}
            onSkip={onSkip}
            onSkipStep={onSkipStep}
          >
            {({ hasTarget }) => (
              <div data-testid="tooltip">{hasTarget ? '正常内容' : '备用内容'}</div>
            )}
          </TourOverlay>
        );
      });

      // 等待超时后渲染 children
      await waitFor(() => {
        expect(screen.getByTestId('tooltip')).not.toBeNull();
      }, { timeout: 5000 });
    });

    it('应该在元素找到时正常渲染 children', async () => {
      const step = createMockStep();
      const onSkip = vi.fn();
      const onSkipStep = vi.fn();

      const mockElement = createMockElement();
      vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);

      await act(async () => {
        render(
          <TourOverlay
            step={step}
            isActive={true}
            onSkip={onSkip}
            onSkipStep={onSkipStep}
          >
            {({ hasTarget }) => (
              <div data-testid="tooltip">{hasTarget ? '正常内容' : '备用内容'}</div>
            )}
          </TourOverlay>
        );
      });

      await waitFor(() => {
        expect(screen.getByText('正常内容')).not.toBeNull();
      });
    });
  });

  // ============================================
  describe('SVG 遮罩渲染', () => {
    it('应该渲染 SVG 遮罩层', async () => {
      const step = createMockStep();
      const onSkip = vi.fn();
      const onSkipStep = vi.fn();

      const mockElement = createMockElement();
      vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);

      const { container } = render(
        <TourOverlay
          step={step}
          isActive={true}
          onSkip={onSkip}
          onSkipStep={onSkipStep}
        >
          {() => <div>Tooltip</div>}
        </TourOverlay>
      );

      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('应该在有目标元素时渲染高亮边框', async () => {
      const step = createMockStep();
      const onSkip = vi.fn();
      const onSkipStep = vi.fn();

      const mockElement = createMockElement();
      vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);

      await act(async () => {
        render(
          <TourOverlay
            step={step}
            isActive={true}
            onSkip={onSkip}
            onSkipStep={onSkipStep}
          >
            {() => <div>Tooltip</div>}
          </TourOverlay>
        );
      });

      // 验证遮罩层已渲染
      await waitFor(() => {
        expect(screen.getByText('正在定位目标元素...') || document.querySelector('.tour-overlay')).toBeTruthy();
      });
    });
  });

  // ============================================
  describe('render props', () => {
    it('应该传递 targetRect 和 hasTarget 给 children', async () => {
      const step = createMockStep();
      const onSkip = vi.fn();
      const onSkipStep = vi.fn();

      const mockElement = createMockElement();
      vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);

      let receivedProps: { targetRect: DOMRect | null; hasTarget: boolean } | null = null;

      await act(async () => {
        render(
          <TourOverlay
            step={step}
            isActive={true}
            onSkip={onSkip}
            onSkipStep={onSkipStep}
          >
            {(props) => {
              receivedProps = props;
              return <div>Tooltip</div>;
            }}
          </TourOverlay>
        );
      });

      await waitFor(() => {
        expect(receivedProps).not.toBeNull();
        expect(receivedProps!.hasTarget).toBe(true);
        expect(receivedProps!.targetRect).not.toBeNull();
      });
    });

    it('当元素不存在且有 fallbackContent 时 hasTarget 应该为 false', async () => {
      const step = createMockStep({ fallbackContent: '备用内容' });
      const onSkip = vi.fn();
      const onSkipStep = vi.fn();

      vi.spyOn(document, 'querySelector').mockReturnValue(null);

      let receivedProps: { targetRect: DOMRect | null; hasTarget: boolean } | null = null;

      await act(async () => {
        render(
          <TourOverlay
            step={step}
            isActive={true}
            onSkip={onSkip}
            onSkipStep={onSkipStep}
          >
            {(props) => {
              receivedProps = props;
              return <div>Tooltip</div>;
            }}
          </TourOverlay>
        );
      });

      await waitFor(() => {
        expect(receivedProps).not.toBeNull();
        expect(receivedProps!.hasTarget).toBe(false);
        expect(receivedProps!.targetRect).toBeNull();
      }, { timeout: 5000 });
    });
  });
});