import React from 'react';
import { X } from 'lucide-react';
import {
  SidebarSettings,
  SidebarDisplayMode,
  DrawingOpenMode,
  SidebarTab,
} from '../../types/sidebar';
import styles from './sidebar.module.css';

interface SidebarSettingsModalProps {
  settings: SidebarSettings;
  onUpdateSettings: (updates: Partial<SidebarSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}

const DISPLAY_MODES: { id: SidebarDisplayMode; label: string }[] = [
  { id: 'manual', label: '手动控制' },
  { id: 'auto-hide', label: '自动隐藏' },
  { id: 'collapse', label: '可收起' },
];

const OPEN_MODES: { id: DrawingOpenMode; label: string }[] = [
  { id: 'direct', label: '直接切换' },
  { id: 'confirm', label: '确认后切换' },
  { id: 'new-tab', label: '新标签打开' },
];

const DEFAULT_TABS: { id: SidebarTab; label: string }[] = [
  { id: 'project', label: '项目图纸' },
  { id: 'gallery', label: '图库' },
  { id: 'collaborate', label: '协同' },
];

export const SidebarSettingsModal: React.FC<SidebarSettingsModalProps> = ({
  settings,
  onUpdateSettings,
  onReset,
  onClose,
}) => {
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.settingsOverlay} onClick={handleOverlayClick}>
      <div className={styles.settingsModal}>
        <div className={styles.settingsHeader}>
          <h2 className={styles.settingsTitle}>侧边栏设置</h2>
          <button className={styles.settingsClose} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* 显示模式 */}
        <div className={styles.settingsGroup}>
          <label className={styles.settingsLabel}>显示模式</label>
          <div className={styles.settingsOptions}>
            {DISPLAY_MODES.map((mode) => (
              <button
                key={mode.id}
                className={`${styles.settingsOption} ${settings.displayMode === mode.id ? styles.active : ''}`}
                onClick={() => onUpdateSettings({ displayMode: mode.id })}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* 图纸打开方式 */}
        <div className={styles.settingsGroup}>
          <label className={styles.settingsLabel}>图纸打开方式</label>
          <div className={styles.settingsOptions}>
            {OPEN_MODES.map((mode) => (
              <button
                key={mode.id}
                className={`${styles.settingsOption} ${settings.openMode === mode.id ? styles.active : ''}`}
                onClick={() => onUpdateSettings({ openMode: mode.id })}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* 默认 Tab */}
        <div className={styles.settingsGroup}>
          <label className={styles.settingsLabel}>默认 Tab</label>
          <select
            value={settings.defaultTab}
            onChange={(e) => onUpdateSettings({ defaultTab: e.target.value as SidebarTab })}
            className={styles.searchInput}
            style={{ paddingLeft: '12px' }}
          >
            {DEFAULT_TABS.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>

        {/* 侧边栏宽度 */}
        <div className={styles.settingsGroup}>
          <label className={styles.settingsLabel}>侧边栏宽度</label>
          <div className={styles.settingsSlider}>
            <input
              type="range"
              min={200}
              max={600}
              value={settings.width}
              onChange={(e) => onUpdateSettings({ width: Number(e.target.value) })}
            />
            <span className={styles.settingsSliderValue}>{settings.width}px</span>
          </div>
        </div>

        {/* 记住状态 */}
        <div className={styles.settingsGroup}>
          <label className={styles.settingsCheckbox}>
            <input
              type="checkbox"
              checked={settings.rememberState}
              onChange={(e) => onUpdateSettings({ rememberState: e.target.checked })}
            />
            记住上次状态
          </label>
        </div>

        {/* 底部按钮 */}
        <div className={styles.settingsFooter}>
          <button
            className={`${styles.settingsButton} ${styles.secondary}`}
            onClick={onReset}
          >
            恢复默认
          </button>
          <button
            className={`${styles.settingsButton} ${styles.primary}`}
            onClick={onClose}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
};
