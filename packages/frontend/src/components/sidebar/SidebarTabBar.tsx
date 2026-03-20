import React from 'react';
import X from 'lucide-react/dist/esm/icons/x';
import { SidebarTab } from '../../types/sidebar';
import styles from './sidebar.module.css';

interface SidebarTabBarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onCloseClick: () => void;
}

const TABS: { id: SidebarTab; label: string }[] = [
  { id: 'drawings', label: '图纸' },
  { id: 'collaborate', label: '协同' },
];

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
          >
            {tab.label}
          </button>
        ))}
      </div>
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
