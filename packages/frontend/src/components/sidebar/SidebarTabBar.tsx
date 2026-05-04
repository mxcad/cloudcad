///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { X } from 'lucide-react';
import { FileText } from 'lucide-react';
import { Users } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { MxFun } from 'mxdraw';
import { SidebarTab } from '../../types/sidebar';
import { Tooltip } from '../ui/Tooltip';
import styles from './sidebar.module.css';

interface SidebarTabBarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onCloseClick: () => void;
}

const TABS: { id: SidebarTab; label: string; icon: React.ReactNode }[] = [
  { id: 'drawings', label: '图纸', icon: <FileText size={14} /> },
  { id: 'collaborate', label: '实时协同', icon: <Users size={14} /> },
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
  const handleReturnToCloudMap = () => {
    MxFun.sendStringToExecute('return-to-cloud-map-management');
  };

  return (
    <div className={styles.tabBar}>
      <Tooltip content="返回" position="bottom" delay={100}>
        <button
          className={styles.tabBarButton}
          onClick={handleReturnToCloudMap}
          aria-label="返回"
        >
          <ArrowLeft size={18} />
        </button>
      </Tooltip>
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
      <Tooltip content="关闭侧边栏" position="bottom" delay={100}>
        <button
          className={styles.tabBarButton}
          onClick={onCloseClick}
          aria-label="关闭侧边栏"
        >
          <X size={18} />
        </button>
      </Tooltip>
    </div>
  );
};
