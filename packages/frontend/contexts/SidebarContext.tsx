import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from 'react';

/**
 * 侧边栏类型定义
 * 支持扩展：新增侧边栏只需在此添加类型
 */
export type SidebarType = 'gallery' | 'collaborate';

/**
 * 侧边栏上下文类型
 */
interface SidebarContextType {
  /** 当前活动的侧边栏 */
  activeSidebar: SidebarType | null;
  /** 打开指定侧边栏（自动关闭其他） */
  openSidebar: (type: SidebarType) => void;
  /** 关闭指定侧边栏 */
  closeSidebar: (type: SidebarType) => void;
  /** 关闭所有侧边栏 */
  closeAll: () => void;
  /** 切换侧边栏（已打开则关闭，未打开则打开并关闭其他） */
  toggleSidebar: (type: SidebarType) => void;
  /** 检查指定侧边栏是否活动 */
  isActive: (type: SidebarType) => boolean;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

/**
 * 侧边栏管理器 Provider
 * 统一管理所有侧边栏状态，实现互斥显示
 */
export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [activeSidebar, setActiveSidebar] = useState<SidebarType | null>(null);

  const openSidebar = useCallback((type: SidebarType) => {
    setActiveSidebar(type);
  }, []);

  const closeSidebar = useCallback((type: SidebarType) => {
    setActiveSidebar((current) => (current === type ? null : current));
  }, []);

  const closeAll = useCallback(() => {
    setActiveSidebar(null);
  }, []);

  const toggleSidebar = useCallback((type: SidebarType) => {
    setActiveSidebar((current) => (current === type ? null : type));
  }, []);

  const isActive = useCallback(
    (type: SidebarType) => activeSidebar === type,
    [activeSidebar]
  );

  const value = useMemo(
    () => ({
      activeSidebar,
      openSidebar,
      closeSidebar,
      closeAll,
      toggleSidebar,
      isActive,
    }),
    [
      activeSidebar,
      openSidebar,
      closeSidebar,
      closeAll,
      toggleSidebar,
      isActive,
    ]
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
};

/**
 * 侧边栏 Hook
 * 用于在侧边栏组件中获取状态和控制方法
 */
export const useSidebar = (type: SidebarType) => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }

  const { activeSidebar, openSidebar, closeSidebar, toggleSidebar, isActive } =
    context;

  return {
    /** 当前侧边栏是否活动 */
    isActive: isActive(type),
    /** 打开当前侧边栏 */
    open: useCallback(() => openSidebar(type), [openSidebar, type]),
    /** 关闭当前侧边栏 */
    close: useCallback(() => closeSidebar(type), [closeSidebar, type]),
    /** 切换当前侧边栏 */
    toggle: useCallback(() => toggleSidebar(type), [toggleSidebar, type]),
    /** 当前活动的侧边栏类型 */
    activeSidebar,
  };
};

/**
 * 侧边栏管理器 Hook
 * 用于在命令或其他组件中控制侧边栏
 */
export const useSidebarManager = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebarManager must be used within a SidebarProvider');
  }
  return context;
};

export default SidebarContext;
