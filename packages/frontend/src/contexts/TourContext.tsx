/**
 * 用户引导上下文 - 管理引导状态
 * - dismissed 状态持久化到 localStorage
 * - 其他状态仅内存存储（会话级别）
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { TourContextValue, TourGuide, TourStep, UICondition } from '../types/tour';
import { tourGuides as defaultGuides } from '../config/tourGuides';

/** localStorage 存储键名（仅用于 dismissed 状态） */
const TOUR_DISMISSED_KEY = 'cloudcad_tour_dismissed';

/** 
 * 引导模式运行时状态（模块级变量，用于跨组件通信）
 * 不持久化，仅在当前会话中有效
 */
let tourModeState = false;

/**
 * 待继续的目标引导栈（内存中，用于多层前置引导嵌套）
 * 例如：用户启动 project-management-full → 检测到需要项目 → 压栈并启动 create-project
 *      create-project 检测到需要在项目管理页面 → 压栈并启动 navigate-to-projects
 *      navigate-to-projects 完成 → 弹栈启动 create-project
 *      create-project 完成 → 弹栈启动 project-management-full
 */
const pendingTargetGuidesStack: string[] = [];

/** 获取当前引导模式状态 */
export function isTourModeActive(): boolean {
  return tourModeState;
}

/**
 * 从 localStorage 读取 dismissed 状态
 */
function loadDismissedState(): boolean {
  try {
    return localStorage.getItem(TOUR_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * 保存 dismissed 状态到 localStorage
 */
function saveDismissedState(dismissed: boolean): void {
  try {
    localStorage.setItem(TOUR_DISMISSED_KEY, String(dismissed));
  } catch {
    // 忽略存储错误（如隐私模式）
  }
}

/**
 * 获取引导的起始路由
 */
function getStartRoute(guide: TourGuide): string | null {
  // 优先使用 startPage，如果没有则使用 initialRoute（向后兼容）
  const startPage = guide.startPage ?? guide.initialRoute;
  
  if (!startPage) {
    // 默认跳转到首页仪表盘
    return '/';
  }
  
  // 'dashboard' 表示首页仪表盘
  if (startPage === 'dashboard') {
    return '/';
  }
  
  // 'current' 表示保持当前页面
  if (startPage === 'current') {
    return null; // null 表示不需要跳转
  }
  
  // 自定义路由路径
  return startPage;
}

/**
 * 检查 UI 条件是否满足
 */
function checkUICondition(condition: UICondition): boolean {
  switch (condition.type) {
    case 'element-exists':
      if (condition.selector) {
        return document.querySelector(condition.selector) !== null;
      }
      return false;
    case 'view-mode':
      // 通过检查文件列表容器的 data-view-mode 属性来检测视图模式
      if (condition.viewMode) {
        const container = document.querySelector('[data-view-mode]');
        if (container) {
          const currentMode = container.getAttribute('data-view-mode');
          return currentMode === condition.viewMode;
        }
      }
      return false;
    case 'custom':
      if (condition.customCheck) {
        return condition.customCheck();
      }
      return false;
    default:
      return false;
  }
}

/**
 * 解析步骤配置
 * 根据 UI 条件选择正确的步骤配置（支持条件分支）
 */
function resolveStepConfig(step: TourStep): TourStep {
  // 如果没有条件分支，直接返回原步骤
  if (!step.uiCondition && !step.alternatives?.length) {
    return step;
  }

  // 检查主条件是否满足
  if (step.uiCondition && checkUICondition(step.uiCondition)) {
    return step;
  }

  // 检查替代步骤
  if (step.alternatives) {
    for (const alt of step.alternatives) {
      if (checkUICondition(alt.condition)) {
        // 合并替代步骤配置
        return {
          ...step,
          ...alt.step,
        };
      }
    }
  }

  // 没有满足条件的替代步骤，返回原步骤
  return step;
}

/**
 * 检查当前路由是否匹配目标路由
 * 支持动态路由参数匹配
 */
function isRouteMatch(currentPath: string, targetRoute: string): boolean {
  // 精确匹配
  if (currentPath === targetRoute) return true;
  
  // 动态路由匹配（如 /projects/:projectId/files 匹配 /projects/abc/files）
  const currentParts = currentPath.split('/').filter(Boolean);
  const targetParts = targetRoute.split('/').filter(Boolean);
  
  if (currentParts.length !== targetParts.length) return false;
  
  for (let i = 0; i < targetParts.length; i++) {
    const targetPart = targetParts[i]!;
    const currentPart = currentParts[i]!;
    
    // 动态参数（以 : 开头）可以匹配任意值
    if (targetPart.startsWith(':')) continue;
    
    if (targetPart !== currentPart) return false;
  }
  
  return true;
}

const TourContext = createContext<TourContextValue | undefined>(undefined);

interface TourProviderProps {
  children: React.ReactNode;
  /** 引导流程配置（可选，默认为空数组） */
  guides?: TourGuide[];
}

/** 过滤掉 isHide 为 true 的引导（引导中心不显示隐藏的引导） */
function filterVisibleGuides(guides: TourGuide[]): TourGuide[] {
  return guides.filter(guide => !guide.isHide);
}

export const TourProvider: React.FC<TourProviderProps> = ({ 
  children,
  guides = defaultGuides 
}) => {
  // 过滤掉隐藏的引导，仅显示在引导中心
  const visibleGuides = useMemo(() => filterVisibleGuides(guides), [guides]);
  const navigate = useNavigate();
  const location = useLocation();
  
  // 内存状态（不持久化）
  const [completedGuides, setCompletedGuides] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(false);
  /** 引导模式状态（用于控制特定行为，如 CAD 文件在当前页面打开） */
  const [isTourMode, setIsTourMode] = useState(false);
  const [currentGuide, setCurrentGuide] = useState<TourGuide | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isTourCenterOpen, setIsTourCenterOpen] = useState(false);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  
  // 等待路由跳转后激活引导
  const pendingActivationRef = useRef(false);
  
  // 防止重复初始化
  const initializedRef = useRef(false);

  // 初始化：检查是否需要显示欢迎提示（dismissed 状态持久化）
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    // 从 localStorage 检查 dismissed 状态
    const dismissed = loadDismissedState();
    if (!dismissed) {
      setIsStartModalOpen(true);
    }
  }, []);

  // 监听路由变化，在跳转完成后激活引导
  useEffect(() => {
    if (pendingActivationRef.current && currentGuide) {
      pendingActivationRef.current = false;
      // 延迟激活，等待新页面渲染完成
      setTimeout(() => {
        setIsActive(true);
      }, 500);
    }
  }, [location.pathname, currentGuide]);

  /**
   * 执行插入的步骤（用于前置条件解决）
   */
  const executeInsertedSteps = useCallback(
    async (steps: TourStep[]): Promise<void> => {
      // 插入的步骤暂时只做简单的展示，不修改当前引导状态
      // 这是一个简化实现，实际可能需要一个临时引导状态
      for (const step of steps) {
        console.log(`[Tour] 执行插入步骤: ${step.title}`);
        // 等待用户操作或自动继续
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    },
    []
  );

  /**
   * 开始引导（带前置条件处理）
   * 检测前置条件，不满足时自动执行解决方案
   * 
   * 返回值：
   * - canStart: true 表示所有条件满足，可以开始引导
   * - needsWait: true 表示需要先完成前置引导
   * - prerequisiteGuideId: 需要先完成的前置引导 ID
   */
  const startTourWithPreconditions = useCallback(
    async (guideId: string): Promise<{ canStart: boolean; needsWait?: boolean; prerequisiteGuideId?: string }> => {
      const guide = guides.find((g) => g.id === guideId);
      if (!guide) {
        console.warn(`[Tour] Guide not found: ${guideId}`);
        return { canStart: false };
      }

      // 检测前置条件
      const preconditions = guide.preconditions || [];
      for (const condition of preconditions) {
        let met = false;
        try {
          met = await condition.check();
        } catch (error) {
          console.warn(`[Tour] Precondition check failed: ${condition.description}`, error);
          met = false;
        }

        if (!met) {
          console.log(`[Tour] Precondition not met: ${condition.description}`);

          // 执行 resolve
          if (condition.resolve?.guideId) {
            // 将当前目标引导压入栈
            pendingTargetGuidesStack.push(guideId);
            console.log(`[Tour] Pushed target guide to stack: ${guideId}, stack: [${pendingTargetGuidesStack.join(', ')}]`);
            
            // 获取前置引导
            const prerequisiteGuide = guides.find((g) => g.id === condition.resolve!.guideId);
            if (!prerequisiteGuide) {
              console.warn(`[Tour] Prerequisite guide not found: ${condition.resolve.guideId}`);
              // 移除压入的引导
              pendingTargetGuidesStack.pop();
              return { canStart: false };
            }

            console.log(`[Tour] Starting prerequisite guide: ${condition.resolve.guideId}`);
            
            // 返回需要等待，由外部启动前置引导
            return { canStart: false, needsWait: true, prerequisiteGuideId: condition.resolve.guideId };
          } else if (condition.resolve?.steps) {
            // 直接插入步骤执行
            await executeInsertedSteps(condition.resolve.steps);
          } else if (condition.resolve?.handler) {
            // 执行自定义处理
            await condition.resolve.handler();
          } else {
            // 无法解决，返回失败
            console.warn(`[Tour] No resolve method for precondition: ${condition.description}`);
            return { canStart: false };
          }

          // 重新检测条件
          try {
            met = await condition.check();
          } catch {
            met = false;
          }
          if (!met) {
            console.warn(`[Tour] Precondition still not met after resolve: ${condition.description}`);
            return { canStart: false };
          }
        }
      }

      // 所有条件满足，可以开始引导
      return { canStart: true };
    },
    [guides, executeInsertedSteps]
  );

  /**
   * 内部启动引导（跳过前置条件检查）
   */
  const startTourInternal = useCallback(
    (guide: TourGuide): void => {
      // 开启引导模式
      setIsTourMode(true);
      tourModeState = true;

      // 设置引导状态
      setCurrentGuide(guide);
      setCurrentStep(0);
      setIsTourCenterOpen(false);

      // 获取起始路由
      const startRoute = getStartRoute(guide);

      // 如果需要跳转且当前不在目标路由
      if (startRoute !== null && !isRouteMatch(location.pathname, startRoute)) {
        // 先跳转，跳转完成后再激活引导
        pendingActivationRef.current = true;
        navigate(startRoute);
      } else {
        // 已经在目标页面或不需要跳转，直接激活
        setTimeout(() => {
          setIsActive(true);
        }, 100);
      }
    },
    [location.pathname, navigate]
  );

  /** 开始引导 */
  const startTour = useCallback(
    async (guideId: string): Promise<void> => {
      const guide = guides.find((g) => g.id === guideId);
      if (!guide || guide.steps.length === 0) {
        console.warn(`[Tour] Guide not found or empty: ${guideId}`);
        return;
      }

      // 检测前置条件
      const result = await startTourWithPreconditions(guideId);
      
      if (result.needsWait && result.prerequisiteGuideId) {
        // 需要先完成前置引导
        const prerequisiteGuide = guides.find((g) => g.id === result.prerequisiteGuideId);
        if (prerequisiteGuide) {
          // 递归启动前置引导（会继续检查前置引导的前置条件）
          await startTour(result.prerequisiteGuideId);
        }
        return;
      }
      
      if (!result.canStart) {
        console.warn(`[Tour] Preconditions not met for guide: ${guideId}`);
        return;
      }

      // 所有条件满足，启动引导
      startTourInternal(guide);
    },
    [guides, startTourWithPreconditions, startTourInternal]
  );

  /** 恢复引导 */
  const resumeTour = useCallback((guideId: string, stepIndex: number) => {
    const guide = guides.find(g => g.id === guideId);
    if (!guide) {
      console.warn(`[Tour] Guide not found: ${guideId}`);
      return;
    }

    // 确保步骤索引在有效范围内
    const validStepIndex = Math.max(0, Math.min(stepIndex, guide.steps.length - 1));
    
    setCurrentGuide(guide);
    setCurrentStep(validStepIndex);
    setIsActive(true);
  }, [guides]);

  /** 完成引导 */
  const completeTour = useCallback(() => {
    if (!currentGuide) return;

    const guideId = currentGuide.id;
    
    setIsActive(false);
    setCurrentGuide(null);
    setCurrentStep(0);
    
    // 更新已完成引导列表（内存中）
    setCompletedGuides(prev => 
      prev.includes(guideId) ? prev : [...prev, guideId]
    );

    // 检查栈是否有待继续的引导
    if (pendingTargetGuidesStack.length > 0) {
      const nextGuideId = pendingTargetGuidesStack.pop()!;
      console.log(`[Tour] Popped target guide from stack: ${nextGuideId}, remaining: [${pendingTargetGuidesStack.join(', ')}]`);
      
      // 延迟启动，等待当前引导完全关闭，并重新检查前置条件
      setTimeout(() => {
        startTour(nextGuideId);
      }, 300);
      return;
    }
    
    // 没有待继续的引导，关闭引导模式
    setIsTourMode(false);
    tourModeState = false;
  }, [currentGuide, startTour]);

  /** 下一步 */
  const nextStep = useCallback(() => {
    if (!currentGuide) return;

    const nextIndex = currentStep + 1;
    
    if (nextIndex >= currentGuide.steps.length) {
      // 引导完成
      completeTour();
      return;
    }

    const nextStepConfig = currentGuide.steps[nextIndex];
    if (!nextStepConfig) {
      // 防御性检查
      completeTour();
      return;
    }

    // 检查步骤是否有指定的路由
    const stepRoute = nextStepConfig.route;

    // 更新步骤索引
    setCurrentStep(nextIndex);

    // 检查是否需要跳转到目标页面
    if (stepRoute && !isRouteMatch(location.pathname, stepRoute)) {
      // 先跳转，跳转完成后再激活引导
      setIsActive(false);
      pendingActivationRef.current = true;
      navigate(stepRoute);
    }
    // 如果没有指定路由或已在目标页面，不需要做任何操作（引导保持激活状态）
  }, [currentGuide, currentStep, location.pathname, navigate, completeTour]);

  /** 跳过引导 */
  const skipTour = useCallback(() => {
    setIsActive(false);
    setCurrentGuide(null);
    setCurrentStep(0);

    // 检查栈是否有待继续的引导
    if (pendingTargetGuidesStack.length > 0) {
      const nextGuideId = pendingTargetGuidesStack.pop()!;
      console.log(`[Tour] Popped target guide from stack (after skip): ${nextGuideId}`);
      
      // 延迟启动，重新检查前置条件
      setTimeout(() => {
        startTour(nextGuideId);
      }, 300);
      return;
    }
    
    // 没有待继续的引导，关闭引导模式
    setIsTourMode(false);
    tourModeState = false;
  }, [startTour]);

  /** 打开引导中心 */
  const openTourCenter = useCallback(() => {
    setIsTourCenterOpen(true);
  }, []);

  /** 关闭引导中心 */
  const closeTourCenter = useCallback(() => {
    setIsTourCenterOpen(false);
  }, []);

  /** 关闭首次登录提示 */
  const dismissStartModal = useCallback(() => {
    setIsStartModalOpen(false);
    // 持久化 dismissed 状态
    saveDismissedState(true);
  }, []);

  // 计算解析后的当前步骤配置
  const resolvedCurrentStep = useMemo(() => {
    if (!currentGuide || currentStep < 0 || currentStep >= currentGuide.steps.length) {
      return null;
    }
    const step = currentGuide.steps[currentStep];
    if (!step) return null;
    return resolveStepConfig(step);
  }, [currentGuide, currentStep]);

  const value: TourContextValue = {
    // 状态
    isActive,
    currentGuide,
    currentStep,
    guides: visibleGuides,
    completedGuides,
    resolvedCurrentStep,
    isTourMode,
    
    // 操作
    startTour,
    nextStep,
    skipTour,
    completeTour,
    openTourCenter,
    closeTourCenter,
    resumeTour,
    
    // 弹窗状态
    isTourCenterOpen,
    isStartModalOpen,
    dismissStartModal,
  };

  return (
    <TourContext.Provider value={value}>
      {children}
    </TourContext.Provider>
  );
};

/**
 * 使用引导上下文的 Hook
 */
export function useTour(): TourContextValue {
  const context = useContext(TourContext);
  if (context === undefined) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
}

export default TourContext;
