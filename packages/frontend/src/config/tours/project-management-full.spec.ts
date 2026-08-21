/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////
/**
 * 项目管理引导：'更多操作'（file-item-menu-btn）步骤的回归测试
 *
 * 背景：列表视图宽屏下操作按钮直接展开，页面不存在"更多"菜单按钮
 * （file-item-menu-btn），导致引导第二步（及成员管理/操作历史前的
 * "更多操作"步骤）找不到目标元素，进入 fallback 后被全屏遮罩拦截，
 * 用户只能强行退出引导。
 * 修复：这三处步骤配置 custom skipCondition —— 当页面处于"列表视图且
 * 操作按钮直接展开"时跳过"更多操作"步骤，直接进入后续具体操作步骤。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getProjectManagementFullGuide } from './project-management-full';
import type { TourStep } from '../../types/tour';

/** 模拟 DOM：file-item-actions（列表模式操作按钮容器）与 file-item-menu-btn（"更多"按钮）是否存在 */
function mockItemActionsDom(options: {
  hasFileItemActions: boolean;
  hasFileItemMenuBtn: boolean;
}) {
  vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
    if (selector === '[data-tour="file-item-actions"]') {
      return options.hasFileItemActions ? ({} as Element) : null;
    }
    if (selector === '[data-tour="file-item-menu-btn"]') {
      return options.hasFileItemMenuBtn ? ({} as Element) : null;
    }
    return null;
  });
}

/** 获取所有 target 为 file-item-menu-btn 且配置了 custom skipCondition 的步骤 */
function getCustomSkipSteps(): TourStep[] {
  const guide = getProjectManagementFullGuide();
  return guide.steps.filter(
    (step) =>
      step.target === 'file-item-menu-btn' &&
      step.skipCondition?.type === 'custom' &&
      !!step.skipCondition.customCheck
  );
}

describe('project-management-full 引导 - "更多操作"步骤', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('所有 file-item-menu-btn 步骤都应配置 custom skipCondition，避免列表视图卡死', () => {
    const steps = getCustomSkipSteps();
    // 覆盖：更多操作→角色管理、更多操作→成员管理、更多操作→操作历史
    expect(steps.length).toBeGreaterThanOrEqual(3);
  });

  it('列表视图宽屏（操作按钮直接展开、无"更多"按钮）时应跳过', () => {
    mockItemActionsDom({ hasFileItemActions: true, hasFileItemMenuBtn: false });
    const steps = getCustomSkipSteps();
    expect(steps.length).toBeGreaterThanOrEqual(3);
    steps.forEach((step) => {
      expect(step.skipCondition!.customCheck!()).toBe(true);
    });
  });

  it('卡片视图（无操作按钮容器）时不应跳过，保持"更多"菜单流程', () => {
    mockItemActionsDom({ hasFileItemActions: false, hasFileItemMenuBtn: true });
    const steps = getCustomSkipSteps();
    expect(steps.length).toBeGreaterThanOrEqual(3);
    steps.forEach((step) => {
      expect(step.skipCondition!.customCheck!()).toBe(false);
    });
  });

  it('列表视图窄屏（compact，存在"更多"按钮）时不应跳过', () => {
    mockItemActionsDom({ hasFileItemActions: true, hasFileItemMenuBtn: true });
    const steps = getCustomSkipSteps();
    expect(steps.length).toBeGreaterThanOrEqual(3);
    steps.forEach((step) => {
      expect(step.skipCondition!.customCheck!()).toBe(false);
    });
  });
});
