///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { FileText } from 'lucide-react';
import { Users } from 'lucide-react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { SidebarTab } from '../../types/sidebar';
import { Button, Tab, Tabs } from '../ui';
import { Tooltip } from '../ui/Tooltip';
import { returnToCloudMapManagement } from '@/services/mxcadManager';
import styles from './sidebar.module.css';

interface SidebarTabBarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onCloseClick: () => void;
  isExpanded?: boolean;
}

const TABS: { id: SidebarTab; label: string; icon: React.ElementType }[] = [
  { id: 'drawings', label: '图纸', icon: FileText },
  { id: 'collaborate', label: '实时协同', icon: Users },
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
  isExpanded = true,
}) => {
  const handleReturnToCloudMap = () => {
    returnToCloudMapManagement();
  };

  return (
    <div className={styles.tabBar}>
      {/* <Tooltip content="返回" position="bottom" delay={100}>
        <button
          className={styles.tabBarButton}
          onClick={ handleReturnToCloudMap}
          aria-label="返回"
        >
          <ArrowLeft size={18} />
        </button>
      </Tooltip> */}
      <Tooltip content={isExpanded ? "关闭侧边栏" : "展开侧边栏"} position="bottom" delay={100}>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCloseClick}
          aria-label={isExpanded ? "关闭侧边栏" : "展开侧边栏"}
          className={styles.tabBarButton}
        >
          {isExpanded ? <ArrowLeft size={18} /> : <ArrowRight size={18} />}
        </Button>
      </Tooltip>
      <Tabs>
        {TABS.map((tab) => (
          <Tab
            key={tab.id}
            active={activeTab === tab.id}
            tabVariant="primary"
            icon={tab.icon}
            onClick={() => onTabChange(tab.id)}
            title={tab.label}
          >
            {tab.label}
          </Tab>
        ))}
      </Tabs>
     <div></div>
    </div>
  );
};
