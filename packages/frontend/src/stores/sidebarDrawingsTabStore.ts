///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2026，成都梦想凯德科技有限公司。
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { create } from 'zustand';

/**
 * 子tab持久化状态
 */
interface SubTabState {
  /** 选中的项目ID */
  selectedProjectId: string | null;
  /** 面包屑导航 */
  breadcrumb: { id: string; name: string }[];
  /** 搜索查询 */
  searchQuery: string;
  /** 当前页码 */
  currentPage: number;
  /** 是否已初始化 */
  initialized: boolean;
}

/**
 * 侧边栏图纸tab状态
 */
interface SidebarDrawingsTabState {
  /** 每个子tab的状态 */
  subTabs: Record<string, SubTabState>;
  
  /** 更新子tab状态 */
  updateSubTab: (tabId: string, state: Partial<SubTabState>) => void;
  
  /** 获取子tab状态 */
  getSubTabState: (tabId: string) => SubTabState;
  
  /** 重置子tab状态 */
  resetSubTab: (tabId: string) => void;
  
  /** 标记子tab已初始化 */
  setInitialized: (tabId: string, initialized: boolean) => void;
}

/** 默认子tab状态 */
const defaultSubTabState: SubTabState = {
  selectedProjectId: null,
  breadcrumb: [],
  searchQuery: '',
  currentPage: 1,
  initialized: false,
};

/**
 * 侧边栏图纸tab状态管理
 * 用于持久化子tab状态，避免切换时重新加载数据
 */
export const useSidebarDrawingsTabStore = create<SidebarDrawingsTabState>(
  (set, get) => ({
    subTabs: {},

    updateSubTab: (tabId, state) =>
      set((prev) => ({
        subTabs: {
          ...prev.subTabs,
          [tabId]: {
            ...(prev.subTabs[tabId] || defaultSubTabState),
            ...state,
          },
        },
      })),

    getSubTabState: (tabId) => {
      const state = get();
      return state.subTabs[tabId] || defaultSubTabState;
    },

    resetSubTab: (tabId) =>
      set((prev) => ({
        subTabs: {
          ...prev.subTabs,
          [tabId]: defaultSubTabState,
        },
      })),

    setInitialized: (tabId, initialized) =>
      set((prev) => ({
        subTabs: {
          ...prev.subTabs,
          [tabId]: {
            ...(prev.subTabs[tabId] || defaultSubTabState),
            initialized,
          },
        },
      })),
  })
);
