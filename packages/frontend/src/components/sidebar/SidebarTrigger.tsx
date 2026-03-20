///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

/**
 * SidebarTrigger - 侧边栏窄条触发器
 * 
 * 设计理念：工业级精密工具条
 * - 垂直居中的dock风格
 * - 玻璃拟态悬浮效果
 * - 动态指示器显示激活状态
 * - 图标在hover时展开显示文字提示
 */

import React, { useState } from 'react';
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import Box from 'lucide-react/dist/esm/icons/box';
import LayoutGrid from 'lucide-react/dist/esm/icons/layout-grid';
import Users from 'lucide-react/dist/esm/icons/users';
import { SidebarTab, DrawingsSubTab } from '../../types/sidebar';
import styles from './sidebar.module.css';

interface SidebarTriggerProps {
  activeTab: SidebarTab | null;
  activeDrawingsSubTab?: DrawingsSubTab;
  onTabClick: (tab: SidebarTab, subTab?: DrawingsSubTab) => void;
}

interface ToolButtonConfig {
  id: string;
  tab: SidebarTab;
  subTab?: DrawingsSubTab;
  icon: React.ReactNode;
  label: string;
  color: string;
}

const TOOL_BUTTONS: ToolButtonConfig[] = [
  {
    id: 'my-project',
    tab: 'drawings',
    subTab: 'my-project',
    icon: <FolderOpen size={18} />,
    label: '我的项目',
    color: '#3b82f6',
  },
  {
    id: 'my-drawings',
    tab: 'drawings',
    subTab: 'my-drawings',
    icon: <FileText size={18} />,
    label: '我的图纸',
    color: '#06b6d4',
  },
  {
    id: 'drawings-gallery',
    tab: 'drawings',
    subTab: 'drawings-gallery',
    icon: <Box size={18} />,
    label: '图纸库',
    color: '#8b5cf6',
  },
  {
    id: 'blocks-gallery',
    tab: 'drawings',
    subTab: 'blocks-gallery',
    icon: <LayoutGrid size={18} />,
    label: '图块库',
    color: '#ec4899',
  },
  {
    id: 'collaborate',
    tab: 'collaborate',
    icon: <Users size={18} />,
    label: '协同',
    color: '#f59e0b',
  },
];

export const SidebarTrigger: React.FC<SidebarTriggerProps> = ({
  activeTab,
  activeDrawingsSubTab,
  onTabClick,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleButtonClick = (button: ToolButtonConfig) => {
    onTabClick(button.tab, button.subTab);
  };

  const isButtonActive = (button: ToolButtonConfig): boolean => {
    if (button.tab === 'collaborate') {
      return activeTab === 'collaborate';
    }
    return activeTab === 'drawings' && activeDrawingsSubTab === button.subTab;
  };

  return (
    <div className={styles.narrowSidebar} role="toolbar" aria-label="侧边栏工具条">
      {/* 顶部装饰线 */}
      <div className={styles.sidebarAccentLine} />
      
      {/* 主工具区 */}
      <div className={styles.toolsContainer}>
        {TOOL_BUTTONS.map((button) => {
          const isActive = isButtonActive(button);
          const isHovered = hoveredId === button.id;
          
          return (
            <div
              key={button.id}
              className={styles.toolWrapper}
              onMouseEnter={() => setHoveredId(button.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* 激活指示器 */}
              <div 
                className={`${styles.activeIndicator} ${isActive ? styles.visible : ''}`}
                style={{ backgroundColor: button.color }}
              />
              
              {/* 按钮主体 */}
              <button
                className={`${styles.toolButton} ${isActive ? styles.active : ''}`}
                onClick={() => handleButtonClick(button)}
                title={button.label}
                aria-label={`打开${button.label}`}
                aria-pressed={isActive}
              >
                {/* 玻璃背景 */}
                <div className={styles.buttonGlass} />
                
                {/* 图标 */}
                <span className={styles.buttonIcon}>{button.icon}</span>
                
                {/* 悬停时的光晕 */}
                <div 
                  className={`${styles.buttonGlow} ${isHovered ? styles.visible : ''}`}
                  style={{ background: `radial-gradient(circle, ${button.color}30 0%, transparent 70%)` }}
                />
              </button>
              
              {/* 悬浮提示 */}
              <div className={`${styles.floatingLabel} ${isHovered ? styles.visible : ''}`}>
                <span style={{ color: button.color }}>{button.label}</span>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* 底部装饰 */}
      <div className={styles.sidebarBottom}>
        <div className={styles.dotPattern} />
      </div>
    </div>
  );
};