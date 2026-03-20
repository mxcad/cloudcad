///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import X from 'lucide-react/dist/esm/icons/x';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import Users from 'lucide-react/dist/esm/icons/users';
import { SidebarTab } from '../../types/sidebar';
import styles from './sidebar.module.css';

interface SidebarTabBarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onCloseClick: () => void;
}

const TABS: { id: SidebarTab; label: string; icon: React.ReactNode }[] = [
  { id: 'drawings', label: '图纸', icon: <FileText size={14} /> },
  { id: 'collaborate', label: '协同', icon: <Users size={14} /> },
];

/**
 * 侧边栏 Tab 栏组件
 * 
 * 设计特点：
 * - Pill 风格的 Tab 按钮，带渐变激活态
 * - 图标+文字组合，视觉层次清晰
 * - 精致的悬停和点击反馈
 * - 支持深色/亮色主题
 */
export const SidebarTabBar: React.FC<SidebarTabBarProps> = ({
  activeTab,
  onTabChange,
  onCloseClick,
}) => {
  return (
    <div className={styles.tabBar}>
      <div className={styles.tabList}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => onTabChange(tab.id)}
            title={tab.label}
          >
            <span style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              position: 'relative',
              zIndex: 1 
            }}>
              {tab.icon}
              {tab.label}
            </span>
          </button>
        ))}
      </div>
      <button
        className={styles.tabBarButton}
        onClick={onCloseClick}
        title="关闭侧边栏"
        aria-label="关闭侧边栏"
      >
        <X size={18} />
      </button>
    </div>
  );
};
