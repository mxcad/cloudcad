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
import type { ConfigGroup, ConfigItem, DependencyStatus } from './types';
import type { DraftValue } from './validate';
import { t } from '@/languages';

/** 传给行组件的每组回调集合 */
export interface RowActions {
  drafts: Record<string, DraftValue>;
  saving: Set<string>;
  canManageConfig: boolean;
  secretVisible: Set<string>;
  fieldErrors: Record<string, string>;
  /** 开关依赖状态：key → 依赖项满足情况（检查手段②） */
  dependencyStatus: Map<string, DependencyStatus[]>;
  /** 待高亮的配置项 key（通道缺失键点击定位的落点） */
  highlightKey: string | null;
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
  /** 分类底部的附加内容（如协同配置分类的「协同详细日志」特殊卡片） */
  extraContent?: React.ReactNode;
  onToggleCollapsed: () => void;
  onRequestResetCategory: () => void;
}

export const ConfigCard: React.FC<ConfigCardProps> = ({
  group,
  collapsed,
  savingCategory,
  actions,
  extraContent,
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
          {(() => {
            const renderRow = (item: ConfigItem) => (
              <ConfigItemRow
                key={item.key}
                item={item}
                draft={actions.draftOf(item)}
                dirty={actions.isDirty(item)}
                saving={actions.saving.has(item.key)}
                canManageConfig={actions.canManageConfig}
                secretVisible={actions.secretVisible.has(item.key)}
                fieldError={actions.fieldErrors[item.key] ?? ''}
                highlight={actions.highlightKey === item.key}
                dependencyStatus={actions.dependencyStatus.get(item.key) ?? []}
                onDraftChange={(value) => actions.onDraftChange(item.key, value)}
                onFormatJson={() => actions.onFormatJson(item.key)}
                onToggleSecret={() => actions.onToggleSecret(item.key)}
                onSave={() => actions.onSave(item.key)}
                onReset={() => actions.onReset(item.key)}
                onShowHistory={() => actions.onShowHistory(item.key)}
              />
            );
            // 有子分组的分类按小节渲染（空串小节 = 未声明子分组的项，无标题）；
            // 无子分组的分类直接平铺
            if (group.subgroups.length > 0) {
              return group.subgroups.map((sub) => (
                <div
                  key={sub.subgroup || '__unsorted__'}
                  className={styles.subgroupSection}
                >
                  {sub.subgroup && (
                    <h4
                      className={styles.subgroupTitle}
                      data-testid="rc-subgroup-title"
                    >
                      {sub.label}
                    </h4>
                  )}
                  {sub.items.map(renderRow)}
                </div>
              ));
            }
            return group.items.map(renderRow);
          })()}
          {extraContent}
        </div>
      )}
    </section>
  );
};
