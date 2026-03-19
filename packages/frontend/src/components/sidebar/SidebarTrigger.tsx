import React from 'react';
import { FolderOpen, Image, Users, Settings } from 'lucide-react';
import { SidebarTab } from '../../types/sidebar';
import styles from './sidebar.module.css';

interface SidebarTriggerProps {
  activeTab: SidebarTab | null;
  onTabClick: (tab: SidebarTab) => void;
  onSettingsClick: () => void;
}

const TAB_ICONS: { id: SidebarTab; icon: React.ReactNode }[] = [
  { id: 'project', icon: <FolderOpen size={18} /> },
  { id: 'gallery', icon: <Image size={18} /> },
  { id: 'collaborate', icon: <Users size={18} /> },
];

export const SidebarTrigger: React.FC<SidebarTriggerProps> = ({
  activeTab,
  onTabClick,
  onSettingsClick,
}) => {
  return (
    <div className={styles.trigger}>
      {TAB_ICONS.map((tab) => (
        <button
          key={tab.id}
          className={`${styles.triggerIcon} ${activeTab === tab.id ? styles.active : ''}`}
          onClick={() => onTabClick(tab.id)}
          title={tab.id === 'project' ? '项目图纸' : tab.id === 'gallery' ? '图库' : '协同'}
        >
          {tab.icon}
        </button>
      ))}
      <div className={styles.triggerDivider} />
      <button
        className={styles.triggerIcon}
        onClick={onSettingsClick}
        title="设置"
      >
        <Settings size={18} />
      </button>
    </div>
  );
};
