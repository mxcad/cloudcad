///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import Users from 'lucide-react/dist/esm/icons/users';
import { SidebarTab } from '../../types/sidebar';
import styles from './sidebar.module.css';

interface SidebarTriggerProps {
  activeTab: SidebarTab | null;
  onTabClick: (tab: SidebarTab) => void;
}

/**
 * Tab 配置 - 与 SidebarTabBar 保持一致
 * 注意：'gallery' 已合并到 'drawings' 的子 Tab 中
 */
const TAB_ICONS: { id: SidebarTab; icon: React.ReactNode; title: string }[] = [
  { id: 'drawings', icon: <FileText size={18} />, title: '图纸' },
  { id: 'collaborate', icon: <Users size={18} />, title: '协同' },
];

export const SidebarTrigger: React.FC<SidebarTriggerProps> = ({
  activeTab,
  onTabClick,
}) => {
  return (
    <div className={styles.trigger}>
      {TAB_ICONS.map((tab, index) => (
        <React.Fragment key={tab.id}>
          <button
            className={`${styles.triggerIcon} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => onTabClick(tab.id)}
            title={tab.title}
          >
            {tab.icon}
          </button>
          {index < TAB_ICONS.length - 1 && <div className={styles.triggerDivider} />}
        </React.Fragment>
      ))}
    </div>
  );
};
