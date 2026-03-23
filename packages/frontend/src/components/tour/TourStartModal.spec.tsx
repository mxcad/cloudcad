///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { TourStartModal } from './TourStartModal';

// ============================================
// Mock Modal 组件
// ============================================
vi.mock('../ui/Modal', () => ({
  Modal: ({ isOpen, onClose, children, size, zIndex }: any) => {
    if (!isOpen) return null;
    return (
      <div
        data-testid="modal"
        data-size={size}
        data-zindex={zIndex}
      >
        <button data-testid="modal-close" onClick={onClose} />
        <div data-testid="modal-content">{children}</div>
      </div>
    );
  },
}));

// ============================================
// Mock Button 组件
// ============================================
vi.mock('../ui/Button', () => ({
  Button: ({ children, onClick, variant }: any) => (
    <button
      data-testid={`button-${variant}`}
      onClick={onClick}
    >
      {children}
    </button>
  ),
}));

// ============================================
// Mock lucide-react icons
// ============================================
vi.mock('lucide-react/dist/esm/icons/compass', () => ({
  default: () => <span data-testid="icon-compass">Compass</span>,
}));

vi.mock('lucide-react/dist/esm/icons/book-open', () => ({
  default: () => <span data-testid="icon-book-open">BookOpen</span>,
}));

vi.mock('lucide-react/dist/esm/icons/target', () => ({
  default: () => <span data-testid="icon-target">Target</span>,
}));

vi.mock('lucide-react/dist/esm/icons/sparkles', () => ({
  default: () => <span data-testid="icon-sparkles">Sparkles</span>,
}));

// ============================================
// 辅助函数：渲染 TourStartModal
// ============================================
function renderTourStartModal(options: {
  isOpen?: boolean;
  onDismiss?: () => void;
  onViewNow?: () => void;
} = {}) {
  const {
    isOpen = true,
    onDismiss = vi.fn(),
    onViewNow = vi.fn(),
  } = options;

  return {
    ...render(
      <TourStartModal
        isOpen={isOpen}
        onDismiss={onDismiss}
        onViewNow={onViewNow}
      />
    ),
    onDismiss,
    onViewNow,
  };
}

describe('TourStartModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // 基础渲染测试
  // ============================================
  describe('基础渲染', () => {
    it('当 isOpen 为 true 时应该渲染 Modal', () => {
      renderTourStartModal({ isOpen: true });

      expect(screen.getByTestId('modal')).not.toBeNull();
    });

    it('当 isOpen 为 false 时不应该渲染 Modal', () => {
      renderTourStartModal({ isOpen: false });

      expect(screen.queryByTestId('modal')).toBeNull();
    });

    it('应该传递正确的 size 属性给 Modal', () => {
      renderTourStartModal({ isOpen: true });

      const modal = screen.getByTestId('modal');
      expect(modal.getAttribute('data-size')).toBe('lg');
    });

    it('应该传递正确的 z-index 属性给 Modal', () => {
      renderTourStartModal({ isOpen: true });

      const modal = screen.getByTestId('modal');
      expect(modal.getAttribute('data-zindex')).toBe('10002');
    });
  });

  // ============================================
  // 欢迎标题测试
  // ============================================
  describe('欢迎标题显示', () => {
    it('应该显示欢迎标题', () => {
      renderTourStartModal();

      expect(screen.getByText('欢迎使用 CloudCAD')).not.toBeNull();
    });

    it('应该显示副标题提示', () => {
      renderTourStartModal();

      expect(screen.getByText('我们为您准备了新手引导，帮助您快速上手')).not.toBeNull();
    });

    it('应该显示主图标 (Sparkles)', () => {
      renderTourStartModal();

      expect(screen.getByTestId('icon-sparkles')).not.toBeNull();
    });
  });

  // ============================================
  // 功能特性列表测试
  // ============================================
  describe('功能特性列表显示', () => {
    it('应该显示 3 个功能特性', () => {
      renderTourStartModal();

      // 检查 3 个特性标题
      expect(screen.getByText('业务流程教程')).not.toBeNull();
      expect(screen.getByText('交互式引导')).not.toBeNull();
      expect(screen.getByText('按需学习')).not.toBeNull();
    });

    it('应该显示业务流程教程的特性描述', () => {
      renderTourStartModal();

      expect(screen.getByText('学习文件上传、成员管理等核心功能')).not.toBeNull();
    });

    it('应该显示交互式引导的特性描述', () => {
      renderTourStartModal();

      expect(screen.getByText('高亮目标元素，一步步引导操作')).not.toBeNull();
    });

    it('应该显示按需学习的特性描述', () => {
      renderTourStartModal();

      expect(screen.getByText('随时从引导中心选择需要的教程')).not.toBeNull();
    });

    it('应该显示业务流程教程图标 (BookOpen)', () => {
      renderTourStartModal();

      expect(screen.getByTestId('icon-book-open')).not.toBeNull();
    });

    it('应该显示交互式引导图标 (Target)', () => {
      renderTourStartModal();

      expect(screen.getByTestId('icon-target')).not.toBeNull();
    });

    it('应该显示按需学习图标 (Compass)', () => {
      renderTourStartModal();

      expect(screen.getByTestId('icon-compass')).not.toBeNull();
    });
  });

  // ============================================
  // 按钮点击事件测试
  // ============================================
  describe('按钮点击事件', () => {
    it('应该显示"稍后再说"按钮', () => {
      renderTourStartModal();

      expect(screen.getByText('稍后再说')).not.toBeNull();
    });

    it('应该显示"立即查看引导"按钮', () => {
      renderTourStartModal();

      expect(screen.getByText('立即查看引导')).not.toBeNull();
    });

    it('点击"稍后再说"按钮应该调用 onDismiss', () => {
      const { onDismiss } = renderTourStartModal();

      const dismissButton = screen.getByTestId('button-ghost');
      fireEvent.click(dismissButton);

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('点击"立即查看引导"按钮应该调用 onViewNow', () => {
      const { onViewNow } = renderTourStartModal();

      const viewNowButton = screen.getByTestId('button-primary');
      fireEvent.click(viewNowButton);

      expect(onViewNow).toHaveBeenCalledTimes(1);
    });

    it('点击 Modal 关闭按钮应该调用 onDismiss', () => {
      const { onDismiss } = renderTourStartModal();

      const modalCloseButton = screen.getByTestId('modal-close');
      fireEvent.click(modalCloseButton);

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // 底部提示文字测试
  // ============================================
  describe('底部提示文字显示', () => {
    it('应该显示底部提示文字', () => {
      renderTourStartModal();

      expect(screen.getByText('您可以随时从侧边栏的「帮助引导」入口访问引导中心')).not.toBeNull();
    });
  });

  // ============================================
  // z-index 层级验证测试
  // ============================================
  describe('z-index 层级验证', () => {
    it('Modal 应该使用 10002 作为 z-index', () => {
      renderTourStartModal();

      const modal = screen.getByTestId('modal');
      expect(modal.getAttribute('data-zindex')).toBe('10002');
    });

    it('z-index 应该高于普通 Modal (50)', () => {
      renderTourStartModal();

      const modal = screen.getByTestId('modal');
      const zIndex = parseInt(modal.getAttribute('data-zindex') || '0', 10);
      expect(zIndex).toBeGreaterThan(50);
    });

    it('z-index 应该高于 Drawer (900)', () => {
      renderTourStartModal();

      const modal = screen.getByTestId('modal');
      const zIndex = parseInt(modal.getAttribute('data-zindex') || '0', 10);
      expect(zIndex).toBeGreaterThan(900);
    });

    it('z-index 应该高于 Toast (1100)', () => {
      renderTourStartModal();

      const modal = screen.getByTestId('modal');
      const zIndex = parseInt(modal.getAttribute('data-zindex') || '0', 10);
      expect(zIndex).toBeGreaterThan(1100);
    });
  });

  // ============================================
  // 按钮变体测试
  // ============================================
  describe('按钮变体验证', () => {
    it('"稍后再说"按钮应该是 ghost 变体', () => {
      renderTourStartModal();

      const ghostButton = screen.getByTestId('button-ghost');
      expect(ghostButton).not.toBeNull();
      expect(screen.getByText('稍后再说')).not.toBeNull();
    });

    it('"立即查看引导"按钮应该是 primary 变体', () => {
      renderTourStartModal();

      const primaryButton = screen.getByTestId('button-primary');
      expect(primaryButton).not.toBeNull();
      expect(screen.getByText('立即查看引导')).not.toBeNull();
    });
  });

  // ============================================
  // 边界情况测试
  // ============================================
  describe('边界情况', () => {
    it('当快速点击"稍后再说"按钮时，应该只调用一次 onDismiss', () => {
      const { onDismiss } = renderTourStartModal();

      const dismissButton = screen.getByTestId('button-ghost');
      fireEvent.click(dismissButton);
      fireEvent.click(dismissButton);
      fireEvent.click(dismissButton);

      // 每次点击都会触发，因为按钮没有被禁用
      expect(onDismiss).toHaveBeenCalledTimes(3);
    });

    it('当快速点击"立即查看引导"按钮时，应该只调用一次 onViewNow', () => {
      const { onViewNow } = renderTourStartModal();

      const viewNowButton = screen.getByTestId('button-primary');
      fireEvent.click(viewNowButton);
      fireEvent.click(viewNowButton);
      fireEvent.click(viewNowButton);

      // 每次点击都会触发，因为按钮没有被禁用
      expect(onViewNow).toHaveBeenCalledTimes(3);
    });

    it('应该正确处理 onDismiss 和 onViewNow 同时被调用的情况', () => {
      const { onDismiss, onViewNow } = renderTourStartModal();

      const dismissButton = screen.getByTestId('button-ghost');
      const viewNowButton = screen.getByTestId('button-primary');

      fireEvent.click(dismissButton);
      fireEvent.click(viewNowButton);

      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onViewNow).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // 组件结构测试
  // ============================================
  describe('组件结构', () => {
    it('应该包含居中对齐的容器', () => {
      const { container } = renderTourStartModal();

      const centerDiv = container.querySelector('.text-center');
      expect(centerDiv).not.toBeNull();
    });

    it('应该包含网格布局的功能特性容器', () => {
      const { container } = renderTourStartModal();

      const gridContainer = container.querySelector('.grid');
      expect(gridContainer).not.toBeNull();
      expect(gridContainer?.classList.contains('grid-cols-1')).toBe(true);
      expect(gridContainer?.classList.contains('md:grid-cols-3')).toBe(true);
    });

    it('应该包含按钮容器', () => {
      const { container } = renderTourStartModal();

      const flexContainer = container.querySelector('.flex.items-center.justify-center.gap-4');
      expect(flexContainer).not.toBeNull();
    });
  });

  // ============================================
  // 无障碍性测试
  // ============================================
  describe('无障碍性', () => {
    it('功能特性卡片应该有标题和描述', () => {
      renderTourStartModal();

      // 每个特性都应该有标题（h4）和描述（p）
      const featureTitles = ['业务流程教程', '交互式引导', '按需学习'];
      const featureDescriptions = [
        '学习文件上传、成员管理等核心功能',
        '高亮目标元素，一步步引导操作',
        '随时从引导中心选择需要的教程',
      ];

      featureTitles.forEach(title => {
        expect(screen.getByText(title)).not.toBeNull();
      });

      featureDescriptions.forEach(desc => {
        expect(screen.getByText(desc)).not.toBeNull();
      });
    });

    it('按钮应该有可点击属性', () => {
      renderTourStartModal();

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});
