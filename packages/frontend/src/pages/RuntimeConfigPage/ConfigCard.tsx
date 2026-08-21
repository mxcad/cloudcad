///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { Save, RotateCcw, Eye, Sparkles } from 'lucide-react';
import type { ConfigGroup } from './hooks/useRuntimeConfig';
import { ConfigInput } from './ConfigInput';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import styles from './RuntimeConfigPage.module.css';
import { t } from '@/languages';

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
  const modifiedItems = group.items.filter(
    (item) => editedValues[item.key] !== undefined
  );

  return (
    <div
      className={styles.configCard}
      style={{ animationDelay: `${groupIndex * 0.05}s` }}
    >
      {/* 卡片头部 */}
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrapper}>
          <div className={styles.cardIcon}>
            <Icon size={20} />
          </div>
          <div className={styles.cardTitleContent}>
            <h2 className={styles.cardTitle}>{group.label}</h2>
            <span className={styles.cardCount}>
              {group.items.length}
              {t(' 项配置')}
            </span>
          </div>
        </div>
        <div className={styles.cardActions}>
          {modifiedItems.length > 0 && (
            <Tag variant="warning">
              {modifiedItems.length}
              {t(' 项修改')}
            </Tag>
          )}
        </div>
      </div>

      {/* 配置项列表 */}
      <div className={styles.cardContent}>
        <div className={styles.configList}>
          {group.items.map((item, itemIndex) => {
            const hasChanges = editedValues[item.key] !== undefined;
            const isSavingItem = saving.has(item.key);

            return (
              <div
                key={item.key}
                className={`${styles.configItem} ${hasChanges ? styles.modified : ''}`}
                style={{ animationDelay: `${itemIndex * 0.03}s` }}
              >
                <div className={styles.configInfo}>
                  <div className={styles.configKeyWrapper}>
                    <span className={styles.configKey}>{item.key}</span>
                    <div className={styles.configBadges}>
                      {item.isPublic && (
                        <Tag variant="success" icon={Eye}>
                          {t('公开')}
                        </Tag>
                      )}
                      {hasChanges && (
                        <Tag variant="warning" icon={Sparkles}>
                          {t('已修改')}
                        </Tag>
                      )}
                    </div>
                  </div>
                  {item.description && (
                    <p className={styles.configDescription}>
                      {item.description}
                    </p>
                  )}
                </div>

                <div className={styles.configControls}>
                  {item.type !== 'boolean' && (
                    <div className={styles.inputWrapper}>
                      <ConfigInput
                        item={item}
                        editedValues={editedValues}
                        canManageConfig={canManageConfig}
                        hiddenValues={hiddenValues}
                        onValueChange={onValueChange}
                        onToggleVisibility={onToggleVisibility}
                      />
                    </div>
                  )}

                  <div className={styles.actionButtons}>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={Save}
                      onClick={() => {
                        void onSave(item.key);
                      }}
                      disabled={!hasChanges || !canManageConfig}
                      loading={isSavingItem}
                      className={`${styles.actionBtn} ${styles.saveBtn} ${hasChanges && !isSavingItem ? styles.active : ''}`}
                      tooltip={t('保存')}
                    />

                    {item.type === 'boolean' && (
                      <ConfigInput
                        item={item}
                        editedValues={editedValues}
                        canManageConfig={canManageConfig}
                        hiddenValues={hiddenValues}
                        onValueChange={onValueChange}
                        onToggleVisibility={onToggleVisibility}
                      />
                    )}

                    <Button
                      variant="secondary"
                      size="sm"
                      icon={RotateCcw}
                      onClick={() => {
                        void onReset(item.key);
                      }}
                      disabled={isSavingItem || !canManageConfig}
                      className={`${styles.actionBtn} ${styles.resetBtn}`}
                      tooltip={t('重置为默认值')}
                    />
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
