///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { Settings, Shield } from 'lucide-react';
import type { ConfigStats } from './hooks/useRuntimeConfig';

interface PageHeaderProps {
  configStats: ConfigStats;
  canManageConfig: boolean;
  isDark: boolean;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ configStats, canManageConfig, isDark }) => {
  return (
    <>
      <header className="page-header">
        <div className="header-left">
          <div className="title-icon">
            <Settings size={28} />
          </div>
          <div className="title-content">
            <h1 className="page-title">运行时配置</h1>
            <p className="page-subtitle">管理系统运行参数，修改后立即生效</p>
          </div>
        </div>
        <div className="header-right">
          <div className="stats-bar">
            <div className="stat-item">
              <span className="stat-value">{configStats.total}</span>
              <span className="stat-label">配置项</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-value public">{configStats.public}</span>
              <span className="stat-label">公开</span>
            </div>
            {configStats.modified > 0 && (
              <>
                <div className="stat-divider" />
                <div className="stat-item">
                  <span className="stat-value modified">{configStats.modified}</span>
                  <span className="stat-label">待保存</span>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {!canManageConfig && (
        <div className="info-banner">
          <Shield size={18} />
          <span>您当前处于只读模式，需要系统管理权限才能修改配置</span>
        </div>
      )}
    </>
  );
};
