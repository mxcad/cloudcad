///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { Settings } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTheme } from '@/contexts/ThemeContext';
import { useRuntimeConfig } from './hooks/useRuntimeConfig';
import { PageHeader } from './PageHeader';
import { ConfigCard } from './ConfigCard';
import { runtimeConfigStyles } from './styles';

/**
 * 运行时配置页面 - CloudCAD
 *
 * 设计特色：
 * - 专业工程美学风格
 * - 卡片式分组布局
 * - 实时状态反馈
 * - 平滑的动画过渡效果
 * - 完美深浅主题适配
 */
export const RuntimeConfigPage: React.FC = () => {
  useDocumentTitle('运行时配置');
  const { isDark } = useTheme();

  const {
    groupedConfigs,
    loading,
    saving,
    editedValues,
    canManageConfig,
    configStats,
    modifiedCount,
    handleValueChange,
    handleSave,
    handleReset,
    toggleValueVisibility,
    hiddenValues,
  } = useRuntimeConfig();

  if (loading) {
    return (
      <div className="config-page" data-theme={isDark ? 'dark' : 'light'}>
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>正在加载配置...</p>
        </div>
        <style>{runtimeConfigStyles}</style>
      </div>
    );
  }

  return (
    <div className="config-page" data-theme={isDark ? 'dark' : 'light'}>
      {/* 页面头部 */}
      <PageHeader
        configStats={configStats}
        canManageConfig={canManageConfig}
        isDark={isDark}
      />

      {/* 配置分组卡片 */}
      <div className="config-grid">
        {groupedConfigs.map((group, groupIndex) => (
          <ConfigCard
            key={group.category}
            group={group}
            groupIndex={groupIndex}
            editedValues={editedValues}
            saving={saving}
            canManageConfig={canManageConfig}
            hiddenValues={hiddenValues}
            onValueChange={handleValueChange}
            onSave={handleSave}
            onReset={handleReset}
            onToggleVisibility={toggleValueVisibility}
          />
        ))}
      </div>

      {/* 空状态 */}
      {groupedConfigs.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <Settings size={48} />
          </div>
          <h3>暂无配置项</h3>
          <p>系统尚未配置任何运行时参数</p>
        </div>
      )}

      <style>{runtimeConfigStyles}</style>
    </div>
  );
};

export default RuntimeConfigPage;
