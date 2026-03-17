///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { create } from 'zustand';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface NotificationState {
  notifications: Notification[];
  unreadCount: number;

  // Actions
  addNotification: (
    type: Notification['type'],
    title: string,
    message: string,
    action?: Notification['action']
  ) => void;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (type, title, message, action) => {
    const id = Date.now().toString();
    const notification: Notification = {
      id,
      type,
      title,
      message,
      timestamp: new Date(),
      read: false,
      action,
    };

    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));

    // Auto-remove after 10 seconds if not an error
    if (type !== 'error') {
      setTimeout(() => {
        get().removeNotification(id);
      }, 10000);
    }
  },

  removeNotification: (id) =>
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id);
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount:
          notification && !notification.read
            ? state.unreadCount - 1
            : state.unreadCount,
      };
    }),

  markAsRead: (id) =>
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id);
      if (notification && !notification.read) {
        return {
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
          unreadCount: state.unreadCount - 1,
        };
      }
      return state;
    }),

  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  clearAll: () =>
    set({
      notifications: [],
      unreadCount: 0,
    }),
}));
