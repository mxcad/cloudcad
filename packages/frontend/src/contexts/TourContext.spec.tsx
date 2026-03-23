///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关资料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ReactNode } from 'react';
import { TourProvider, useTour } from './TourContext';
import type { TourGuide, TourStorage } from '../types/tour';

// 使用 vi.hoisted 确保 mockGuides 在 vi.mock 提升之前定义
const mockGuides = vi.hoisted(() => [
  {
    id: 'test-guide-1',
    name: '测试引导1',
    description: '这是一个测试引导',
    category: '项目管理' as const,
    estimatedTime: '2 分钟',
    steps: [
      { target: 'step-1', title: '步骤1', content: '第一步' },
      { target: 'step-2', title: '步骤2', content: '第二步' },
      { target: 'step-3', title: '步骤3', content: '第三步' },
    ],
  },
  {
    id: 'test-guide-2',
    name: '测试引导2',
    description: '这是另一个测试引导',
    category: '图库管理' as const,
    estimatedTime: '3 分钟',
    steps: [
      { target: 'step-a', title: '步骤A', content: '第一步' },
      { target: 'step-b', title: '步骤B', content: '第二步' },
    ],
  },
] satisfies TourGuide[]);

// Mock tourGuides 模块
vi.mock('../config/tourGuides', () => ({
  tourGuides: mockGuides,
}));

// localStorage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get store() {
      return store;
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// 辅助函数：创建 wrapper
function createWrapper(guides?: TourGuide[]) {
  return ({ children }: { children: ReactNode }) => (
    <TourProvider guides={guides}>{children}</TourProvider>
  );
}

describe('TourContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  describe('loadTourState', () => {
    it('should return default state when localStorage is empty', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      expect(result.current.completedGuides).toEqual([]);
      expect(result.current.currentGuide).toBeNull();
      expect(result.current.currentStep).toBe(0);
    });

    it('should load state from localStorage correctly', () => {
      const storedState: TourStorage = {
        completedGuides: ['test-guide-1'],
        currentGuide: 'test-guide-2',
        currentStep: 1,
        dismissed: true,
      };
      localStorageMock.setItem(
        'cloudcad_tour_state',
        JSON.stringify(storedState)
      );

      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      expect(result.current.completedGuides).toEqual(['test-guide-1']);
    });

    it('should handle invalid JSON in localStorage gracefully', () => {
      localStorageMock.setItem('cloudcad_tour_state', 'invalid-json');

      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      expect(result.current.completedGuides).toEqual([]);
    });

    it('should handle partial state in localStorage', () => {
      const partialState = { completedGuides: ['test-guide-1'] };
      localStorageMock.setItem(
        'cloudcad_tour_state',
        JSON.stringify(partialState)
      );

      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      expect(result.current.completedGuides).toEqual(['test-guide-1']);
    });
  });

  describe('saveTourState', () => {
    it('should save state to localStorage when state changes', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.startTour('test-guide-1');
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'cloudcad_tour_state',
        expect.stringContaining('"currentGuide":"test-guide-1"')
      );
    });
  });

  describe('TourProvider initialization', () => {
    it('should initialize with default guides when not provided', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      expect(result.current.guides).toEqual(mockGuides);
    });

    it('should initialize with custom guides when provided', () => {
      const customGuides: TourGuide[] = [
        {
          id: 'custom-guide',
          name: '自定义引导',
          description: '自定义描述',
          category: '系统管理',
          estimatedTime: '1 分钟',
          steps: [{ target: 'custom-step', title: '步骤', content: '内容' }],
        },
      ];

      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(customGuides),
      });

      expect(result.current.guides).toEqual(customGuides);
    });

    it('should show start modal for first-time users', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isStartModalOpen).toBe(true);
    });

    it('should not show start modal when dismissed', () => {
      localStorageMock.setItem(
        'cloudcad_tour_state',
        JSON.stringify({ dismissed: true, completedGuides: [] })
      );

      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isStartModalOpen).toBe(false);
    });

    it('should not show start modal when user has completed guides', () => {
      localStorageMock.setItem(
        'cloudcad_tour_state',
        JSON.stringify({
          dismissed: false,
          completedGuides: ['test-guide-1'],
        })
      );

      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isStartModalOpen).toBe(false);
    });
  });

  describe('startTour', () => {
    it('should start a tour by guide id', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.startTour('test-guide-1');
      });

      expect(result.current.isActive).toBe(true);
      expect(result.current.currentGuide?.id).toBe('test-guide-1');
      expect(result.current.currentStep).toBe(0);
    });

    it('should close tour center when starting tour', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.openTourCenter();
      });

      expect(result.current.isTourCenterOpen).toBe(true);

      act(() => {
        result.current.startTour('test-guide-1');
      });

      expect(result.current.isTourCenterOpen).toBe(false);
    });

    it('should do nothing when guide id does not exist', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.startTour('non-existent-guide');
      });

      expect(result.current.isActive).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Tour] Guide not found: non-existent-guide'
      );

      consoleSpy.mockRestore();
    });

    it('should save tour state to localStorage', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.startTour('test-guide-1');
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'cloudcad_tour_state',
        expect.stringContaining('"currentGuide":"test-guide-1"')
      );
    });
  });

  describe('nextStep', () => {
    it('should move to next step', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.startTour('test-guide-1');
      });

      expect(result.current.currentStep).toBe(0);

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.currentStep).toBe(1);
    });

    it('should complete tour when reaching last step', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.startTour('test-guide-1');
      });

      // 移动到最后一步（每次操作需要独立的 act）
      act(() => {
        result.current.nextStep(); // step 1
      });

      act(() => {
        result.current.nextStep(); // step 2
      });

      expect(result.current.currentStep).toBe(2);

      // 再下一步应完成引导
      act(() => {
        result.current.nextStep();
      });

      expect(result.current.isActive).toBe(false);
      expect(result.current.currentGuide).toBeNull();
      expect(result.current.completedGuides).toContain('test-guide-1');
    });

    it('should do nothing when no tour is active', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.currentStep).toBe(0);
    });

    it('should save step state to localStorage', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.startTour('test-guide-1');
      });

      localStorageMock.setItem.mockClear();

      act(() => {
        result.current.nextStep();
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'cloudcad_tour_state',
        expect.stringContaining('"currentStep":1')
      );
    });
  });

  describe('prevStep', () => {
    it('should move to previous step', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.startTour('test-guide-1');
      });

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.currentStep).toBe(1);

      act(() => {
        result.current.prevStep();
      });

      expect(result.current.currentStep).toBe(0);
    });

    it('should not go below step 0', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.startTour('test-guide-1');
      });

      expect(result.current.currentStep).toBe(0);

      act(() => {
        result.current.prevStep();
      });

      expect(result.current.currentStep).toBe(0);
    });
  });

  describe('skipTour', () => {
    it('should skip the current tour', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.startTour('test-guide-1');
      });

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.isActive).toBe(true);
      expect(result.current.currentStep).toBe(1);

      act(() => {
        result.current.skipTour();
      });

      expect(result.current.isActive).toBe(false);
      expect(result.current.currentGuide).toBeNull();
      expect(result.current.currentStep).toBe(0);
    });

    it('should not mark tour as completed when skipped', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.startTour('test-guide-1');
        result.current.skipTour();
      });

      expect(result.current.completedGuides).not.toContain('test-guide-1');
    });

    it('should clear currentGuide from localStorage', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.startTour('test-guide-1');
      });

      localStorageMock.setItem.mockClear();

      act(() => {
        result.current.skipTour();
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'cloudcad_tour_state',
        expect.stringContaining('"currentGuide":null')
      );
    });
  });

  describe('completeTour', () => {
    it('should complete the current tour', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.startTour('test-guide-1');
      });

      act(() => {
        result.current.completeTour();
      });

      expect(result.current.isActive).toBe(false);
      expect(result.current.currentGuide).toBeNull();
      expect(result.current.completedGuides).toContain('test-guide-1');
    });

    it('should not duplicate completed guide ids', () => {
      localStorageMock.setItem(
        'cloudcad_tour_state',
        JSON.stringify({
          completedGuides: ['test-guide-1'],
          dismissed: true,
        })
      );

      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.startTour('test-guide-1');
        result.current.completeTour();
      });

      const completedCount = result.current.completedGuides.filter(
        (id) => id === 'test-guide-1'
      ).length;
      expect(completedCount).toBe(1);
    });

    it('should do nothing when no tour is active', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.completeTour();
      });

      expect(result.current.completedGuides).toEqual([]);
    });
  });

  describe('resumeTour', () => {
    it('should resume a tour at specific step', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.resumeTour('test-guide-1', 2);
      });

      expect(result.current.isActive).toBe(true);
      expect(result.current.currentGuide?.id).toBe('test-guide-1');
      expect(result.current.currentStep).toBe(2);
    });

    it('should clamp step index to valid range', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.resumeTour('test-guide-1', 100);
      });

      expect(result.current.currentStep).toBe(2); // test-guide-1 has 3 steps (0-2)
    });

    it('should clamp negative step index to 0', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.resumeTour('test-guide-1', -5);
      });

      expect(result.current.currentStep).toBe(0);
    });

    it('should do nothing when guide id does not exist', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.resumeTour('non-existent', 0);
      });

      expect(result.current.isActive).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Tour] Guide not found: non-existent'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('openTourCenter / closeTourCenter', () => {
    it('should open tour center', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.openTourCenter();
      });

      expect(result.current.isTourCenterOpen).toBe(true);
    });

    it('should close tour center', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.openTourCenter();
        result.current.closeTourCenter();
      });

      expect(result.current.isTourCenterOpen).toBe(false);
    });
  });

  describe('dismissStartModal', () => {
    it('should close start modal', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      // 首次使用会自动打开 start modal
      expect(result.current.isStartModalOpen).toBe(true);

      act(() => {
        result.current.dismissStartModal();
      });

      expect(result.current.isStartModalOpen).toBe(false);
    });

    it('should set dismissed flag in localStorage', () => {
      const { result } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.dismissStartModal();
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'cloudcad_tour_state',
        expect.stringContaining('"dismissed":true')
      );
    });
  });

  describe('useTour hook', () => {
    it('should throw error when used outside TourProvider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useTour());
      }).toThrow('useTour must be used within a TourProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('memoization', () => {
    it('should return stable callback references', () => {
      const { result, rerender } = renderHook(() => useTour(), {
        wrapper: createWrapper(),
      });

      const firstRender = result.current;
      rerender();
      const secondRender = result.current;

      expect(firstRender.startTour).toBe(secondRender.startTour);
      expect(firstRender.nextStep).toBe(secondRender.nextStep);
      expect(firstRender.prevStep).toBe(secondRender.prevStep);
      expect(firstRender.skipTour).toBe(secondRender.skipTour);
      expect(firstRender.completeTour).toBe(secondRender.completeTour);
      expect(firstRender.openTourCenter).toBe(secondRender.openTourCenter);
      expect(firstRender.closeTourCenter).toBe(secondRender.closeTourCenter);
      expect(firstRender.dismissStartModal).toBe(secondRender.dismissStartModal);
      expect(firstRender.resumeTour).toBe(secondRender.resumeTour);
    });
  });
});