import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useNavigate, NavigateFunction } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useRuntimeConfig } from '../../contexts/RuntimeConfigContext';
import { useNotification } from '../../contexts/NotificationContext';
import { usePermission } from '../../hooks/usePermission';
import { User } from '../../types';

type TabType = 'info' | 'password' | 'email' | 'deactivate' | 'phone' | 'wechat';

interface ConfirmConfig {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  type: 'warning' | 'danger' | 'info';
}

interface ProfileContextValue {
  // 用户信息
  user: User | null;
  
  // 运行时配置
  mailEnabled: boolean;
  smsEnabled: boolean;
  wechatEnabled: boolean;
  
  // UI 状态
  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  success: string | null;
  setSuccess: (success: string | null) => void;
  focusedField: string | null;
  setFocusedField: (field: string | null) => void;
  
  // Tab 状态
  activeTab: TabType;
  switchTab: (tab: TabType) => void;
  
  // 通知
  showToast: (msg: string, type: 'success' | 'error') => void;
  showConfirm: (config: ConfirmConfig) => Promise<boolean>;
  
  // 导航
  navigate: NavigateFunction;
  
  // 用户操作
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  
  // 权限
  isAdmin: () => boolean;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

interface ProfileProviderProps {
  children: ReactNode;
}

export const ProfileProvider: React.FC<ProfileProviderProps> = ({ children }) => {
  const navigate = useNavigate();
  const { user, logout, login, refreshUser } = useAuth();
  const { config: runtimeConfig } = useRuntimeConfig();
  const { showToast, showConfirm } = useNotification();
  const { isAdmin } = usePermission();

  const mailEnabled = runtimeConfig.mailEnabled;
  const smsEnabled = runtimeConfig.smsEnabled ?? false;
  const wechatEnabled = runtimeConfig.wechatEnabled ?? false;

  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const switchTab = useCallback((tab: TabType) => {
    setActiveTab(tab);
    setError(null);
    setSuccess(null);
  }, []);

  const value: ProfileContextValue = {
    user,
    mailEnabled,
    smsEnabled,
    wechatEnabled,
    loading,
    setLoading,
    error,
    setError,
    success,
    setSuccess,
    focusedField,
    setFocusedField,
    activeTab,
    switchTab,
    showToast,
    showConfirm,
    navigate,
    refreshUser,
    logout,
    login,
    isAdmin,
  };

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within ProfileProvider');
  }
  return context;
};