/**
 * 用户引导上下文 - 管理引导状态、localStorage 持久化
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { TourContextValue, TourGuide, TourStorage, TourStep, UICondition } from '../types/tour';
import { tourGuides as defaultGuides } from '../config/tourGuides';

/** localStorage 存储键名 */
const TOUR_STORAGE_KEY = 'cloudcad_tour_state';

/** 默认存储状态 */
const DEFAULT_STORAGE: TourStorage = {
  completedGuides: [],
  currentGuide: null,
  currentStep: 0,
  dismissed: false,
};

/**
 * 从 localStorage 读取引导状态
 */
function loadTourState(): TourStorage {
  try {
    const stored = localStorage.getItem(TOUR_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<TourStorage>;
      return {
        completedGuides: parsed.completedGuides ?? [],
        currentGuide: parsed.currentGuide ?? null,
        currentStep: parsed.currentStep ?? 0,
        dismissed: parsed.dismissed ?? false,
      };
    }
  } catch {
    // 忽略解析错误
  }
  return { ...DEFAULT_STORAGE };
}

/**
 * 保存引导状态到 localStorage
 */
function saveTourState(state: TourStorage): void {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
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

export const TourProvider: React.FC<TourProviderProps> = ({ 
  children,
  guides = defaultGuides 
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // 从 localStorage 初始化状态
  const [storageState, setStorageState] = useState<TourStorage>(loadTourState);
  
  // 运行时状态
  const [isActive, setIsActive] = useState(false);
  const [currentGuide, setCurrentGuide] = useState<TourGuide | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isTourCenterOpen, setIsTourCenterOpen] = useState(false);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  
  // 等待路由跳转后激活引导
  const pendingActivationRef = useRef(false);
  
  // 防止重复初始化
  const initializedRef = useRef(false);

  // 初始化：检查是否需要显示首次登录提示
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const state = loadTourState();
    
    // 首次使用且未关闭提示
    if (!state.dismissed && state.completedGuides.length === 0) {
      setIsStartModalOpen(true);
    }

    // 恢复进行中的引导
    if (state.currentGuide) {
      const guide = guides.find(g => g.id === state.currentGuide);
      if (guide) {
        const step = guide.steps[state.currentStep];
        if (step) {
          // 步骤级别有 route 配置时优先使用
          const stepRoute = step.route;
          const startRoute = getStartRoute(guide);
          
          // 检查是否需要跳转到目标页面
          // 优先检查步骤路由，其次检查起始路由
          const requiredRoute = stepRoute ?? startRoute;
          
          if (requiredRoute !== null && !isRouteMatch(location.pathname, requiredRoute)) {
            // 标记需要等待路由跳转后激活
            pendingActivationRef.current = true;
            navigate(requiredRoute);
          } else {
            setCurrentGuide(guide);
            setCurrentStep(state.currentStep);
            // 延迟恢复引导（等待页面渲染完成）
            setTimeout(() => {
              setIsActive(true);
            }, 500);
          }
        }
      }
    }
  }, [guides, navigate, location.pathname]);

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

  // 保存状态到 localStorage
  useEffect(() => {
    saveTourState(storageState);
  }, [storageState]);

  /** 开始引导 */
  const startTour = useCallback((guideId: string) => {
    const guide = guides.find(g => g.id === guideId);
    if (!guide || guide.steps.length === 0) {
      console.warn(`[Tour] Guide not found or empty: ${guideId}`);
      return;
    }

    // 设置引导状态
    setCurrentGuide(guide);
    setCurrentStep(0);
    setIsTourCenterOpen(false);
    
    // 更新存储状态
    setStorageState(prev => ({
      ...prev,
      currentGuide: guideId,
      currentStep: 0,
    }));

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
  }, [guides, location.pathname, navigate]);

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
    
    setStorageState(prev => {
      const completedGuides = prev.completedGuides.includes(guideId)
        ? prev.completedGuides
        : [...prev.completedGuides, guideId];
      
      return {
        ...prev,
        completedGuides,
        currentGuide: null,
        currentStep: 0,
      };
    });
  }, [currentGuide]);

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
    setStorageState(prev => ({
      ...prev,
      currentStep: nextIndex,
    }));

    // 检查是否需要跳转到目标页面
    if (stepRoute && !isRouteMatch(location.pathname, stepRoute)) {
      // 先跳转，跳转完成后再激活引导
      setIsActive(false);
      pendingActivationRef.current = true;
      navigate(stepRoute);
    }
    // 如果没有指定路由或已在目标页面，不需要做任何操作（引导保持激活状态）
  }, [currentGuide, currentStep, location.pathname, navigate, completeTour]);

  /** 上一步 */
  const prevStep = useCallback(() => {
    if (currentStep <= 0) return;

    const prevIndex = currentStep - 1;
    setCurrentStep(prevIndex);
    setStorageState(prev => ({
      ...prev,
      currentStep: prevIndex,
    }));
  }, [currentStep]);

  /** 跳过引导 */
  const skipTour = useCallback(() => {
    setIsActive(false);
    setCurrentGuide(null);
    setCurrentStep(0);
    setStorageState(prev => ({
      ...prev,
      currentGuide: null,
      currentStep: 0,
    }));
  }, []);

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
    setStorageState(prev => ({
      ...prev,
      dismissed: true,
    }));
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
    guides,
    completedGuides: storageState.completedGuides,
    resolvedCurrentStep,
    
    // 操作
    startTour,
    nextStep,
    prevStep,
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
