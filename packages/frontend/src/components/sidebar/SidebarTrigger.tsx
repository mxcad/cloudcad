import React from 'react';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import Image from 'lucide-react/dist/esm/icons/image';
import Users from 'lucide-react/dist/esm/icons/users';
import { SidebarTab } from '../../types/sidebar';
import styles from './sidebar.module.css';

interface SidebarTriggerProps {
  activeTab: SidebarTab | null;
  onTabClick: (tab: SidebarTab) => void;
}

const TAB_ICONS: { id: SidebarTab; icon: React.ReactNode; title: string }[] = [
  { id: 'drawings', icon: <FileText size={18} />, title: '图纸' },
  { id: 'gallery', icon: <Image size={18} />, title: '图库' },
  { id: 'collaborate', icon: <Users size={18} />, title: '协同' },
];

export const SidebarTrigger: React.FC<SidebarTriggerProps> = ({
  activeTab,
  onTabClick,
}) => {
  return (
    <div className={styles.trigger}>
      {TAB_ICONS.map((tab) => (
        <button
          key={tab.id}
          className={`${styles.triggerIcon} ${activeTab === tab.id ? styles.active : ''}`}
          onClick={() => onTabClick(tab.id)}
          title={tab.title}
        >
          {tab.icon}
        </button>
      ))}
    </div>
  );
};
