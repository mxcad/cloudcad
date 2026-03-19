import React from 'react';
import { Settings, X } from 'lucide-react';
import { SidebarTab } from '../../types/sidebar';
import styles from './sidebar.module.css';

interface SidebarTabBarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onSettingsClick: () => void;
  onCloseClick: () => void;
}

const TABS: { id: SidebarTab; label: string }[] = [
  { id: 'project', label: '项目图纸' },
  { id: 'gallery', label: '图库' },
  { id: 'collaborate', label: '协同' },
];

export const SidebarTabBar: React.FC<SidebarTabBarProps> = ({
  activeTab,
  onTabChange,
  onSettingsClick,
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
          >
            {tab.label}
          </button>
        ))}
      </div>
      <button
        className={styles.tabBarButton}
        onClick={onSettingsClick}
        title="设置"
      >
        <Settings size={18} />
      </button>
      <button
        className={styles.tabBarButton}
        onClick={onCloseClick}
        title="关闭"
      >
        <X size={18} />
      </button>
    </div>
  );
};
