///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 分类卡片：可折叠的分组容器 + 分类级批量恢复默认入口。
 */

import React from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import styles from './RuntimeConfigPage.module.css';
import { ConfigItemRow } from './ConfigItemRow';
import type { ConfigGroup, ConfigItem } from './types';
import type { DraftValue } from './validate';
import { t } from '@/languages';

/** 传给行组件的每组回调集合 */
export interface RowActions {
  drafts: Record<string, DraftValue>;
  saving: Set<string>;
  canManageConfig: boolean;
  secretVisible: Set<string>;
  fieldErrors: Record<string, string>;
  draftOf: (item: ConfigItem) => DraftValue;
  isDirty: (item: ConfigItem) => boolean;
  onDraftChange: (key: string, value: DraftValue) => void;
  onFormatJson: (key: string) => void;
  onToggleSecret: (key: string) => void;
  onSave: (key: string) => Promise<boolean>;
  onReset: (key: string) => Promise<void>;
  onShowHistory: (key: string) => void;
}

interface ConfigCardProps {
  group: ConfigGroup;
  collapsed: boolean;
  savingCategory: boolean;
  actions: RowActions;
  onToggleCollapsed: () => void;
  onRequestResetCategory: () => void;
}

export const ConfigCard: React.FC<ConfigCardProps> = ({
  group,
  collapsed,
  savingCategory,
  actions,
  onToggleCollapsed,
  onRequestResetCategory,
}) => {
  const { icon: Icon } = group;

  return (
    <section
      className={styles.configCard}
      data-testid="rc-card"
      data-category={group.category}
    >
      <div className={styles.cardHeader}>
        <button
          type="button"
          className={styles.cardHeaderToggle}
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          data-testid="rc-card-toggle"
        >
          <span className={styles.cardIcon}>
            <Icon size={18} />
          </span>
          <span className={styles.cardTitle}>{group.label}</span>
          <span className={styles.cardCount}>
            {group.items.length}
            {t(' 项配置')}
          </span>
          {group.modifiedCount > 0 && (
            <Tag variant="warning">
              {group.modifiedCount}
              {t(' 项修改')}
            </Tag>
          )}
          <ChevronDown
            size={16}
            className={`${styles.chevron} ${collapsed ? styles.chevronCollapsed : ''}`}
          />
        </button>
        <Button
          variant="ghost"
          size="sm"
          icon={RotateCcw}
          onClick={onRequestResetCategory}
          disabled={savingCategory || !actions.canManageConfig}
          loading={savingCategory}
          data-testid="rc-reset-category"
          tooltip={
            actions.canManageConfig
              ? t('恢复本分类全部配置为默认值')
              : t('只读权限：无修改配置')
          }
        />
      </div>

      {!collapsed && (
        <div className={styles.cardContent}>
          {group.items.map((item) => (
            <ConfigItemRow
              key={item.key}
              item={item}
              draft={actions.draftOf(item)}
              dirty={actions.isDirty(item)}
              saving={actions.saving.has(item.key)}
              canManageConfig={actions.canManageConfig}
              secretVisible={actions.secretVisible.has(item.key)}
              fieldError={actions.fieldErrors[item.key] ?? ''}
              onDraftChange={(value) => actions.onDraftChange(item.key, value)}
              onFormatJson={() => actions.onFormatJson(item.key)}
              onToggleSecret={() => actions.onToggleSecret(item.key)}
              onSave={() => actions.onSave(item.key)}
              onReset={() => actions.onReset(item.key)}
              onShowHistory={() => actions.onShowHistory(item.key)}
            />
          ))}
        </div>
      )}
    </section>
  );
};
