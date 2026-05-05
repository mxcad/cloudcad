///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { Save, RotateCcw, Loader2, Eye, Sparkles } from 'lucide-react';
import type { ConfigGroup } from './hooks/useRuntimeConfig';
import { ConfigInput } from './ConfigInput';

interface ConfigCardProps {
  group: ConfigGroup;
  groupIndex: number;
  editedValues: Record<string, string | number | boolean>;
  saving: Set<string>;
  canManageConfig: boolean;
  hiddenValues: Set<string>;
  onValueChange: (key: string, value: string | number | boolean) => void;
  onSave: (key: string) => Promise<void>;
  onReset: (key: string) => Promise<void>;
  onToggleVisibility: (key: string) => void;
}

export const ConfigCard: React.FC<ConfigCardProps> = ({
  group,
  groupIndex,
  editedValues,
  saving,
  canManageConfig,
  hiddenValues,
  onValueChange,
  onSave,
  onReset,
  onToggleVisibility,
}) => {
  const Icon = group.icon;
  const modifiedItems = group.items.filter((item) => editedValues[item.key] !== undefined);

  return (
    <div
      className="config-card"
      style={{ animationDelay: `${groupIndex * 0.05}s` }}
    >
      {/* 卡片头部 */}
      <div className="card-header">
        <div className="card-title-wrapper">
          <div className="card-icon">
            <Icon size={20} />
          </div>
          <div className="card-title-content">
            <h2 className="card-title">{group.label}</h2>
            <span className="card-count">{group.items.length} 项配置</span>
          </div>
        </div>
        <div className="card-actions">
          {modifiedItems.length > 0 && (
            <span className="modified-badge">{modifiedItems.length} 项修改</span>
          )}
        </div>
      </div>

      {/* 配置项列表 */}
      <div className="card-content">
        <div className="config-list">
          {group.items.map((item, itemIndex) => {
            const hasChanges = editedValues[item.key] !== undefined;
            const isSavingItem = saving.has(item.key);

            return (
              <div
                key={item.key}
                className={`config-item ${hasChanges ? 'modified' : ''}`}
                style={{ animationDelay: `${itemIndex * 0.03}s` }}
              >
                <div className="config-info">
                  <div className="config-key-wrapper">
                    <span className="config-key">{item.key}</span>
                    <div className="config-badges">
                      {item.isPublic && (
                        <span className="badge public-badge" title="对外公开">
                          <Eye size={12} />
                          公开
                        </span>
                      )}
                      {hasChanges && (
                        <span className="badge modified-badge">
                          <Sparkles size={12} />
                          已修改
                        </span>
                      )}
                    </div>
                  </div>
                  {item.description && (
                    <p className="config-description">{item.description}</p>
                  )}
                </div>

                <div className="config-controls">
                  <div className="input-wrapper">
                    <ConfigInput
                      item={item}
                      editedValues={editedValues}
                      canManageConfig={canManageConfig}
                      hiddenValues={hiddenValues}
                      onValueChange={onValueChange}
                      onToggleVisibility={onToggleVisibility}
                    />
                  </div>

                  <div className="action-buttons">
                    <button
                      type="button"
                      onClick={() => { void onSave(item.key); }}
                      disabled={!hasChanges || isSavingItem || !canManageConfig}
                      className={`action-btn save-btn ${hasChanges && !isSavingItem ? 'active' : ''}`}
                      title="保存"
                    >
                      {isSavingItem ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Save size={16} />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => { void onReset(item.key); }}
                      disabled={isSavingItem || !canManageConfig}
                      className="action-btn reset-btn"
                      title="重置为默认值"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
