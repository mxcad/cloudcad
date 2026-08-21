///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
/**
 * 用户引导系统类型定义
 * @version 1.4.0
 */

import type { Permission } from '../constants/permissions';

/** 前置条件配置 */
export interface TourPrecondition {
  /** 条件描述（显示给用户） */
  description: string;
  
  /** 
   * 检测函数
   * 返回 true 表示条件满足
   */
  check: () => boolean | Promise<boolean>;
  
  /** 
   * 解决方式
   */
  resolve?: {
    /** 引导 ID（跳转到其他引导） */
    guideId?: string;
    /** 直接插入的步骤 */
    steps?: TourStep[];
    /** 自定义处理函数 */
    handler?: () => void | Promise<void>;
  };
}

/** 引导可见性配置 */
export interface TourVisibility {
  /** 
   * 所需权限列表
   * 用户需要拥有所有列出的权限才能看到此引导
   */
  permissions?: Permission[];
  
  /** 
   * 自定义可见性检测
   * 返回 true 表示可见
   */
  check?: () => boolean | Promise<boolean>;
}

/** 跳过条件类型 */
export type SkipConditionType = 'element-exists' | 'element-not-exists' | 'element-count-zero' | 'feature-disabled' | 'custom';

/** 跳过条件（声明式配置，支持序列化） */
export interface SkipCondition {
  /** 条件类型 */
  type: SkipConditionType;
  /** 
   * 目标选择器
   * - type=element-exists: 当元素存在时跳过
   * - type=element-not-exists: 当元素不存在时跳过
   * - type=element-count-zero: 检查元素数量是否为 0
   */
  selector?: string;
  /** 功能开关名称（type=feature-disabled 时使用） */
  featureFlag?: string;
  /** 自定义条件函数（仅运行时使用，不参与序列化） */
  customCheck?: () => boolean;
}

/** UI 条件类型 */
export type UIConditionType = 'element-exists' | 'view-mode' | 'custom';

/** UI 条件配置 */
export interface UICondition {
  /** 条件类型 */
  type: UIConditionType;
  /** 
   * 目标选择器（type=element-exists 时使用）
   * 检查指定元素是否存在
   */
  selector?: string;
  /** 
   * 视图模式（type=view-mode 时使用）
   * 检查当前视图是否匹配
   */
  viewMode?: 'grid' | 'list';
  /** 
   * 自定义检测函数（仅运行时使用）
   * 返回 true 表示条件满足
   */
  customCheck?: () => boolean;
}

/** 气泡位置 */
export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

/** 步骤模式 */
export type StepMode = 'display' | 'interactive';

/** 引导步骤 */
export interface TourStep {
  /** 目标元素选择器（data-tour 属性值） */
  target: string;
  /** 步骤标题 */
  title: string;
  /** 步骤描述 */
  content: string;
  /** 气泡位置 */
  placement?: TooltipPlacement;
  /** 
   * 步骤模式
   * - 'display': 展示模式，用户点击"下一步"按钮即可继续
   * - 'interactive': 交互模式，用户需要完成指定操作才能继续
   */
  mode?: StepMode;
  /** 
   * 交互模式下需要用户执行的操作类型
   * - 'click': 点击目标元素
   * - 'input': 在目标元素输入内容
   * - 'select': 选择下拉选项
   * - 'right-click': 右键点击
   */
  actionType?: 'click' | 'input' | 'select' | 'right-click';
  /** 交互模式的操作提示（覆盖默认提示） */
  actionHint?: string;
  /** 跨页面时跳转的路由（支持动态参数，如 /cad-editor/:fileId） */
  route?: string;
  /** 
   * 元素等待策略
   * - number: 超时时间（ms），超时后执行 skipCondition 或跳过
   * - 'auto': 使用 MutationObserver 自动检测，最长等待 5 秒
   */
  waitForElement?: number | 'auto';
  /** 
   * 跳过条件（声明式配置）
   * 当条件满足时自动跳过此步骤
   */
  skipCondition?: SkipCondition;
  /** 
   * 当目标元素不存在时显示的替代内容
   * 设置后，即使元素不存在也会显示提示气泡（居中显示）
   */
  fallbackContent?: string;
  /** 
   * 是否高亮强调目标元素（用于重要操作提示）
   * 在目标元素上添加脉冲动画效果
   */
  highlight?: boolean;
  /** 
   * UI 条件（用于条件分支）
   * 当条件满足时使用当前步骤，否则查找 alternatives
   */
  uiCondition?: UICondition;
  /** 
   * 条件分支步骤
   * 当 uiCondition 不满足时，按顺序检查 alternatives 中的条件
   * 使用第一个满足条件的替代步骤
   */
  alternatives?: TourStepAlternative[];
}

/** 条件分支步骤 */
export interface TourStepAlternative {
  /** UI 条件 */
  condition: UICondition;
  /** 满足条件时使用的步骤配置（部分属性会覆盖原步骤） */
  step: Partial<TourStep>;
}

/** 引导流程分类（动态，由引导配置决定） */
export type TourCategory = string;

/** 引导起始页面配置 */
export type TourStartPage = 'dashboard' | 'current' | string;

/** 引导流程 */
export interface TourGuide {
  /** 是否隐藏 */
  isHide?: boolean
  /** 唯一标识 */
  id: string;
  /** 流程名称 */
  name: string;
  /** 流程描述 */
  description: string;
  /** 分类 */
  category: TourCategory;
  /** 步骤列表 */
  steps: TourStep[];
  /** 预计时长 */
  estimatedTime: string;
  /** 
   * 起始页面配置
   * - 'dashboard': 跳转到首页仪表盘（默认值）
   * - 'current': 保持当前页面不变（适用于 CAD 编辑器等新标签打开的场景）
   * - string: 自定义路由路径（如 '/projects'）
   */
  startPage?: TourStartPage;
  /** 
   * 初始路由（已废弃，请使用 startPage）
   * @deprecated 使用 startPage 替代
   */
  initialRoute?: string;
  /** 
   * 动态路由参数（用于跨页面引导）
   * 如 { fileId: 'xxx' }，用于替换 route 中的 :fileId 占位符
   */
  routeParams?: Record<string, string>;
  /** 可见性配置 */
  visibility?: TourVisibility;
  /** 前置条件列表（按顺序检测） */
  preconditions?: TourPrecondition[];
}

/** 引导存储状态 */
export interface TourStorage {
  /** 已完成的引导 ID 列表 */
  completedGuides: string[];
  /** 当前进行中的引导 ID */
  currentGuide: string | null;
  /** 当前步骤索引 */
  currentStep: number;
  /** 是否关闭了首次登录提示 */
  dismissed: boolean;
}

/** 引导上下文状态 */
export interface TourState {
  /** 是否正在引导中 */
  isActive: boolean;
  /** 当前引导流程 */
  currentGuide: TourGuide | null;
  /** 当前步骤索引 */
  currentStep: number;
  /** 所有引导流程 */
  guides: TourGuide[];
  /** 已完成的引导 ID 列表 */
  completedGuides: string[];
}

/** 引导上下文值 */
export interface TourContextValue extends TourState {
  /** 开始引导（带前置条件检测） */
  startTour: (guideId: string) => Promise<void>;
  /** 下一步 */
  nextStep: () => void;
  /** 跳过引导 */
  skipTour: () => void;
  /** 完成引导 */
  completeTour: () => void;
  /** 打开引导中心 */
  openTourCenter: () => void;
  /** 关闭引导中心 */
  closeTourCenter: () => void;
  /** 引导中心弹窗是否打开 */
  isTourCenterOpen: boolean;
  /** 首次登录提示弹窗是否打开 */
  isStartModalOpen: boolean;
  /** 关闭首次登录提示 */
  dismissStartModal: () => void;
  /** 恢复引导 */
  resumeTour: (guideId: string, stepIndex: number) => void;
  /** 
   * 解析后的当前步骤配置
   * 根据 UI 条件选择正确的步骤配置
   */
  resolvedCurrentStep: TourStep | null;
  /** 
   * 是否处于引导模式
   * 用于控制特定行为：
   * - CAD 文件在当前页面打开（而非新标签页）
   * - CAD 编辑器侧边栏默认关闭
   */
  isTourMode: boolean;
}

/** 元素等待结果 */
export interface WaitForElementResult {
  /** 找到的元素 */
  element: HTMLElement | null;
  /** 未找到的原因 */
  reason?: 'timeout' | 'not-visible' | 'not-exists';
}

/** 元素等待选项 */
export interface WaitForElementOptions {
  /** 超时时间（ms） */
  timeout: number;
  /** 检测策略 */
  strategy: 'polling' | 'observer';
  /** 是否要求元素可见（默认 true） */
  requireVisible?: boolean;
}
