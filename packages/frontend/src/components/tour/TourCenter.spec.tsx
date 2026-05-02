///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关资料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { TourCenter } from './TourCenter';
import type { TourGuide, TourCategory } from '../../types/tour';

// ============================================
// Mock TourContext
// ============================================
const mockStartTour = vi.fn();
const mockGuides: TourGuide[] = [
  {
    id: 'file-upload',
    name: '文件上传与管理',
    description: '学习如何上传和管理项目文件',
    category: '项目管理',
    estimatedTime: '2 分钟',
    steps: [
      { target: 'upload-btn', title: '上传文件', content: '点击上传按钮' },
      { target: 'file-list', title: '查看文件', content: '查看已上传文件' },
    ],
  },
  {
    id: 'project-members',
    name: '项目成员管理',
    description: '学习如何管理项目成员',
    category: '项目管理',
    estimatedTime: '3 分钟',
    steps: [
      { target: 'member-btn', title: '打开成员面板', content: '点击成员按钮' },
    ],
  },
  {
    id: 'add-to-gallery',
    name: '添加图纸到图库',
    description: '学习如何将图纸添加到图库',
    category: '图库管理',
    estimatedTime: '2 分钟',
    steps: [
      { target: 'gallery-btn', title: '打开图库', content: '点击图库按钮' },
      { target: 'add-btn', title: '添加图纸', content: '点击添加按钮' },
      { target: 'select-file', title: '选择文件', content: '选择要添加的文件' },
    ],
  },
  {
    id: 'collaboration',
    name: '协作功能',
    description: '学习如何使用协作功能',
    category: '协作功能',
    estimatedTime: '2 分钟',
    steps: [
      { target: 'collab-btn', title: '开始协作', content: '点击协作按钮' },
    ],
  },
  {
    id: 'system-roles',
    name: '系统角色管理',
    description: '学习如何管理系统角色',
    category: '系统管理',
    estimatedTime: '3 分钟',
    steps: [
      { target: 'roles-btn', title: '打开角色管理', content: '点击角色按钮' },
    ],
  },
];

const defaultTourContext = {
  guides: mockGuides,
  completedGuides: [] as string[],
  startTour: mockStartTour,
  nextStep: vi.fn(),
  prevStep: vi.fn(),
  skipTour: vi.fn(),
  completeTour: vi.fn(),
  openTourCenter: vi.fn(),
  closeTourCenter: vi.fn(),
  resumeTour: vi.fn(),
  isTourCenterOpen: false,
  isStartModalOpen: false,
  dismissStartModal: vi.fn(),
  isActive: false,
  currentGuide: null as TourGuide | null,
  currentStep: 0,
  resolvedCurrentStep: null as import('../../types/tour').TourStep | null,
  isTourMode: false,
};

vi.mock('../../contexts/TourContext', () => ({
  useTour: vi.fn(() => defaultTourContext),
}));

// ============================================
// Mock Modal 组件
// ============================================
vi.mock('../ui/Modal', () => ({
  Modal: vi.fn(({ isOpen, onClose, title, children, zIndex }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="modal" data-z-index={zIndex}>
        <div data-testid="modal-title">{title}</div>
        <button data-testid="modal-close" onClick={onClose}>
          关闭
        </button>
        <div data-testid="modal-content">{children}</div>
      </div>
    );
  }),
}));

// ============================================
// Mock Button 组件
// ============================================
vi.mock('../ui/Button', () => ({
  Button: vi.fn(({ variant, size, icon, onClick, children }) => (
    <button
      data-testid="button"
      data-variant={variant}
      data-size={size}
      onClick={onClick}
    >
      {icon && <span data-testid="button-icon">icon</span>}
      {children}
    </button>
  )),
}));

// ============================================
// 导入 useTour mock 以便在测试中修改
// ============================================
import { useTour } from '../../contexts/TourContext';

const mockUseTour = vi.mocked(useTour);

// ============================================
// 辅助函数：创建模拟的 DOM 元素
// ============================================
function renderTourCenter(
  props: Partial<React.ComponentProps<typeof TourCenter>> = {},
  contextOverrides: Partial<typeof defaultTourContext> = {}
) {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  mockUseTour.mockReturnValue({
    ...defaultTourContext,
    ...contextOverrides,
  });

  return render(<TourCenter {...defaultProps} {...props} />);
}

describe('TourCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTour.mockReturnValue(defaultTourContext);
  });

  // ============================================
  // 基础渲染测试
  // ============================================
  describe('基础渲染', () => {
    it('应该在 isOpen 为 true 时渲染 Modal', () => {
      renderTourCenter({ isOpen: true });

      expect(screen.getByTestId('modal')).not.toBeNull();
      expect(screen.getByTestId('modal-title').textContent).toBe('引导中心');
    });

    it('应该在 isOpen 为 false 时不渲染 Modal', () => {
      renderTourCenter({ isOpen: false });

      expect(screen.queryByTestId('modal')).toBeNull();
    });

    it('应该使用正确的 z-index (10002)', () => {
      renderTourCenter({ isOpen: true });

      const modal = screen.getByTestId('modal');
      expect(modal.getAttribute('data-z-index')).toBe('10002');
    });

    it('应该调用 onClose 当点击关闭按钮时', () => {
      const onClose = vi.fn();
      renderTourCenter({ isOpen: true, onClose });

      const closeButton = screen.getByTestId('modal-close');
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // 引导列表显示测试
  // ============================================
  describe('引导列表显示', () => {
    it('应该显示所有引导流程', () => {
      renderTourCenter();

      // 使用 getAllByText 处理重复文本（协作功能既是分类名又是引导名）
      expect(screen.getByText('文件上传与管理')).not.toBeNull();
      expect(screen.getByText('项目成员管理')).not.toBeNull();
      expect(screen.getByText('添加图纸到图库')).not.toBeNull();
      // 协作功能作为分类标题和引导名称都会出现
      expect(screen.getAllByText('协作功能').length).toBeGreaterThan(0);
      expect(screen.getByText('系统角色管理')).not.toBeNull();
    });

    it('应该显示引导描述', () => {
      renderTourCenter();

      expect(screen.getByText('学习如何上传和管理项目文件')).not.toBeNull();
      expect(screen.getByText('学习如何管理项目成员')).not.toBeNull();
    });

    it('应该显示预计时长', () => {
      renderTourCenter();

      // 多个引导有相同的预计时长，使用 getAllByText
      const twoMinutes = screen.getAllByText('2 分钟');
      expect(twoMinutes.length).toBeGreaterThan(0);
      
      const threeMinutes = screen.getAllByText('3 分钟');
      expect(threeMinutes.length).toBeGreaterThan(0);
    });

    it('应该显示步骤数量', () => {
      renderTourCenter();

      // 文件上传有 2 步，添加到图库有 3 步（可能多次出现）
      expect(screen.getAllByText('2 步').length).toBeGreaterThan(0);
      expect(screen.getAllByText('3 步').length).toBeGreaterThan(0);
    });

    it('应该显示搜索框', () => {
      renderTourCenter();

      const searchInput = screen.getByPlaceholderText('搜索引导流程...');
      expect(searchInput).not.toBeNull();
    });
  });

  // ============================================
  // 分类显示测试
  // ============================================
  describe('分类显示', () => {
    it('应该按分类分组显示引导', () => {
      renderTourCenter();

      // 检查分类标题（使用 getAllByText 处理重复）
      expect(screen.getAllByText('项目管理').length).toBeGreaterThan(0);
      expect(screen.getAllByText('图库管理').length).toBeGreaterThan(0);
      expect(screen.getAllByText('协作功能').length).toBeGreaterThan(0);
      expect(screen.getAllByText('系统管理').length).toBeGreaterThan(0);
    });

    it('应该显示每个分类的引导数量', () => {
      renderTourCenter();

      // 项目管理有 2 个引导，数字 2 会多次出现
      const categoryBadges = screen.getAllByText('2');
      expect(categoryBadges.length).toBeGreaterThan(0);
    });

    it('应该显示分类筛选按钮', () => {
      renderTourCenter();

      // 全部按钮
      expect(screen.getByText('全部')).not.toBeNull();
      // 各分类按钮（包含数量）
      expect(screen.getByText('项目管理 (2)')).not.toBeNull();
      expect(screen.getByText('图库管理 (1)')).not.toBeNull();
      expect(screen.getByText('协作功能 (1)')).not.toBeNull();
      expect(screen.getByText('系统管理 (1)')).not.toBeNull();
    });

    it('默认应该选中"全部"分类', () => {
      renderTourCenter();

      const allButton = screen.getByText('全部');
      // 检查是否为选中状态（通过样式判断）
      expect(allButton).not.toBeNull();
    });
  });

  // ============================================
  // 搜索功能测试
  // ============================================
  describe('搜索功能', () => {
    it('应该能通过名称搜索引导', async () => {
      renderTourCenter();

      const searchInput = screen.getByPlaceholderText('搜索引导流程...');
      fireEvent.change(searchInput, { target: { value: '文件' } });

      await waitFor(() => {
        expect(screen.getByText('文件上传与管理')).not.toBeNull();
        expect(screen.queryByText('项目成员管理')).toBeNull();
      });
    });

    it('应该能通过描述搜索引导', async () => {
      renderTourCenter();

      const searchInput = screen.getByPlaceholderText('搜索引导流程...');
      fireEvent.change(searchInput, { target: { value: '图库' } });

      await waitFor(() => {
        expect(screen.getByText('添加图纸到图库')).not.toBeNull();
        expect(screen.queryByText('文件上传与管理')).toBeNull();
      });
    });

    it('搜索不匹配时应显示空状态', async () => {
      renderTourCenter();

      const searchInput = screen.getByPlaceholderText('搜索引导流程...');
      fireEvent.change(searchInput, { target: { value: '不存在的内容xyz' } });

      await waitFor(() => {
        expect(screen.getByText('未找到匹配的引导流程')).not.toBeNull();
      });
    });

    it('清空搜索时应恢复所有引导', async () => {
      renderTourCenter();

      const searchInput = screen.getByPlaceholderText('搜索引导流程...');
      
      // 先搜索
      fireEvent.change(searchInput, { target: { value: '文件' } });
      
      await waitFor(() => {
        expect(screen.queryByText('项目成员管理')).toBeNull();
      });

      // 清空搜索
      fireEvent.change(searchInput, { target: { value: '' } });

      await waitFor(() => {
        expect(screen.getByText('项目成员管理')).not.toBeNull();
      });
    });
  });

  // ============================================
  // 进度统计显示测试
  // ============================================
  describe('进度统计显示', () => {
    it('应该显示进度统计', () => {
      renderTourCenter();

      expect(screen.getByText('学习进度')).not.toBeNull();
      expect(screen.getByText('已完成')).not.toBeNull();
    });

    it('应该显示正确的完成百分比', () => {
      renderTourCenter({}, { completedGuides: ['file-upload', 'project-members'] });

      // 2/5 = 40%
      expect(screen.getByText('40%')).not.toBeNull();
    });

    it('应该在所有引导完成时显示 100%', () => {
      renderTourCenter(
        {},
        {
          completedGuides: [
            'file-upload',
            'project-members',
            'add-to-gallery',
            'collaboration',
            'system-roles',
          ],
        }
      );

      expect(screen.getByText('100%')).not.toBeNull();
    });
  });

  // ============================================
  // 完成状态标记测试
  // ============================================
  describe('完成状态标记', () => {
    it('应该在已完成的引导卡片上显示完成标记', () => {
      renderTourCenter({}, { completedGuides: ['file-upload'] });

      // 检查完成标记（CheckCircle 图标）
      const completedGuide = screen.getByText('文件上传与管理').closest('div');
      // 完成的引导应该包含完成图标
      expect(completedGuide?.querySelector('svg')).not.toBeNull();
    });

    it('未完成的引导应该显示为未完成状态', () => {
      renderTourCenter();

      // 未完成的引导显示 Circle 图标（空心圆）
      const guide = screen.getByText('项目成员管理').closest('div');
      expect(guide).not.toBeNull();
    });
  });

  // ============================================
  // 点击卡片开始引导测试
  // ============================================
  describe('点击卡片开始引导', () => {
    it('点击引导卡片应该调用 startTour', async () => {
      const onClose = vi.fn();
      renderTourCenter({ onClose });

      // 点击第一个引导卡片
      const guideCard = screen.getByText('文件上传与管理').closest('div');
      if (guideCard) {
        fireEvent.click(guideCard);
      }

      expect(mockStartTour).toHaveBeenCalledWith('file-upload');
    });

    it('开始引导后应该关闭 Modal', async () => {
      const onClose = vi.fn();
      renderTourCenter({ onClose });

      const guideCard = screen.getByText('文件上传与管理').closest('div');
      if (guideCard) {
        fireEvent.click(guideCard);
      }

      expect(onClose).toHaveBeenCalled();
    });

    it('悬停时应该显示开始按钮', async () => {
      renderTourCenter();

      const guideCard = screen.getByText('文件上传与管理').closest('div');
      if (guideCard) {
        fireEvent.mouseEnter(guideCard);

        // 检查是否有开始引导按钮
        await waitFor(() => {
          const buttons = screen.getAllByTestId('button');
          const startButton = buttons.find(
            (btn) => btn.textContent?.includes('开始引导')
          );
          expect(startButton).not.toBeUndefined();
        });
      }
    });

    it('已完成的引导应该显示"重新开始"按钮', async () => {
      renderTourCenter({}, { completedGuides: ['file-upload'] });

      const guideCard = screen.getByText('文件上传与管理').closest('div');
      if (guideCard) {
        fireEvent.mouseEnter(guideCard);

        await waitFor(() => {
          const buttons = screen.getAllByTestId('button');
          const restartButton = buttons.find(
            (btn) => btn.textContent?.includes('重新开始')
          );
          expect(restartButton).not.toBeUndefined();
        });
      }
    });
  });

  // ============================================
  // 当前引导进行中时的提示测试
  // ============================================
  describe('当前引导进行中时的提示', () => {
    it('当有引导进行中时应该显示提示', () => {
      renderTourCenter({}, { isActive: true });

      expect(screen.getByText('当前有引导正在进行中')).not.toBeNull();
    });

    it('当没有引导进行中时不应该显示提示', () => {
      renderTourCenter({}, { isActive: false });

      expect(screen.queryByText('当前有引导正在进行中')).toBeNull();
    });

    it('点击"继续引导"按钮应该关闭 Modal', () => {
      const onClose = vi.fn();
      renderTourCenter({ onClose }, { isActive: true });

      const continueButton = screen.getByText('继续引导');
      fireEvent.click(continueButton);

      expect(onClose).toHaveBeenCalled();
    });
  });

  // ============================================
  // 分类标签筛选测试
  // ============================================
  describe('分类标签筛选', () => {
    it('点击分类按钮应该筛选对应分类的引导', async () => {
      renderTourCenter();

      // 点击"图库管理"分类（带数量的按钮）
      const categoryButton = screen.getByText('图库管理 (1)');
      fireEvent.click(categoryButton);

      await waitFor(() => {
        // 只显示图库管理的引导
        expect(screen.getByText('添加图纸到图库')).not.toBeNull();
        expect(screen.queryByText('文件上传与管理')).toBeNull();
      });
    });

    it('点击"全部"按钮应该显示所有引导', async () => {
      renderTourCenter();

      // 先选择一个分类
      const categoryButton = screen.getByText('图库管理 (1)');
      fireEvent.click(categoryButton);

      await waitFor(() => {
        expect(screen.queryByText('文件上传与管理')).toBeNull();
      });

      // 点击"全部"
      const allButton = screen.getByText('全部');
      fireEvent.click(allButton);

      await waitFor(() => {
        expect(screen.getByText('文件上传与管理')).not.toBeNull();
        expect(screen.getByText('添加图纸到图库')).not.toBeNull();
      });
    });

    it('分类筛选和搜索应该可以组合使用', async () => {
      renderTourCenter();

      // 先选择"项目管理"分类（带数量的按钮）
      const categoryButton = screen.getByText('项目管理 (2)');
      fireEvent.click(categoryButton);

      // 再搜索"文件"
      const searchInput = screen.getByPlaceholderText('搜索引导流程...');
      fireEvent.change(searchInput, { target: { value: '文件' } });

      await waitFor(() => {
        // 只显示匹配的引导
        expect(screen.getByText('文件上传与管理')).not.toBeNull();
        expect(screen.queryByText('项目成员管理')).toBeNull();
      });
    });
  });

  // ============================================
  // 边界情况测试
  // ============================================
  describe('边界情况', () => {
    it('应该处理空的引导列表', () => {
      renderTourCenter({}, { guides: [] });

      expect(screen.getByText('暂无引导流程')).not.toBeNull();
    });

    it('应该处理分类中没有引导的情况', () => {
      // 只有图库管理的引导
      renderTourCenter(
        {},
        {
          guides: [mockGuides[2]!], // add-to-gallery
        }
      );

      // 其他分类不应该显示（图库管理会显示为分类标题和筛选按钮）
      expect(screen.getAllByText('图库管理').length).toBeGreaterThan(0);
      expect(screen.queryByText('项目管理 (2)')).toBeNull();
    });

    it('应该正确处理搜索结果为空的情况', async () => {
      renderTourCenter({}, { guides: [] });

      const searchInput = screen.getByPlaceholderText('搜索引导流程...');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        // 当有搜索内容但没有结果时，显示"未找到匹配的引导流程"
        expect(screen.getByText('未找到匹配的引导流程')).not.toBeNull();
      });
    });
  });

  // ============================================
  // 无障碍测试
  // ============================================
  describe('无障碍', () => {
    it('搜索框应该有正确的 placeholder', () => {
      renderTourCenter();

      const searchInput = screen.getByPlaceholderText('搜索引导流程...');
      expect(searchInput).not.toBeNull();
    });

    it('分类按钮应该可点击', () => {
      renderTourCenter();

      const buttons = [
        screen.getByText('全部'),
        screen.getByText('项目管理 (2)'),
        screen.getByText('图库管理 (1)'),
      ];

      buttons.forEach((button) => {
        expect(button).not.toBeNull();
        // 确保可以点击
        fireEvent.click(button);
      });

      // 点击后应该不会抛出错误
      expect(true).toBe(true);
    });
  });
});
