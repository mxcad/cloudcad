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

import { useUIStore } from '../stores/uiStore';

/**
 * 全局 Loading 工具函数
 * 
 * 用于非 React 环境（如工具函数、API 调用等）中控制全局 loading 状态
 * 
 * 注意：必须使用 zustand 的 setState 方法来触发响应式更新
 */

/**
 * 显示全局 loading
 * @param message 加载消息
 */
export const showGlobalLoading = (message?: string): void => {
  useUIStore.setState({ 
    globalLoading: true, 
    loadingMessage: message || '', 
    loadingProgress: 0 
  });
};

/**
 * 隐藏全局 loading
 */
export const hideGlobalLoading = (): void => {
  useUIStore.setState({ 
    globalLoading: false, 
    loadingMessage: '', 
    loadingProgress: 0 
  });
};

/**
 * 设置 loading 消息
 * @param message 消息内容
 */
export const setLoadingMessage = (message: string): void => {
  useUIStore.setState({ loadingMessage: message });
};

/**
 * 设置 loading 进度
 * @param progress 进度百分比 (0-100)
 */
export const setLoadingProgress = (progress: number): void => {
  useUIStore.setState({ loadingProgress: progress });
};

/**
 * 重置 loading 状态
 */
export const resetLoading = (): void => {
  useUIStore.setState({ 
    globalLoading: false, 
    loadingMessage: '', 
    loadingProgress: 0 
  });
};

/**
 * 获取当前 loading 状态
 */
export const getLoadingState = () => {
  const store = useUIStore.getState();
  return {
    globalLoading: store.globalLoading,
    loadingMessage: store.loadingMessage,
    loadingProgress: store.loadingProgress,
  };
};
