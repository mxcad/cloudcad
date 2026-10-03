///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 单个配置项行：key + 徽标（危险/已修改/档位/来源/生效方式/公开）+ 描述 +
 * 影响说明 + 环境变量提示 + 默认值对比 + 类型感知控件 + 就地错误 + 操作按钮。
 */

import React from 'react';
import {
  Save,
  RotateCcw,
  History,
  ShieldAlert,
  Sparkles,
  Eye,
  Zap,
  Power,
  TerminalSquare,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { formatDateTimeWithSeconds } from '@/utils/dateUtils';
import styles from './RuntimeConfigPage.module.css';
import { ConfigInput } from './ConfigInput';
import { SOURCE_LABEL, TIER_LABEL, formatValue } from './meta';
import type { ConfigItem, ConfigTier, ConfigSource } from './types';
import { toSubmitValue } from './validate';
import type { DraftValue } from './validate';
import { t } from '@/languages';

interface ConfigItemRowProps {
  item: ConfigItem;
  draft: DraftValue;
  dirty: boolean;
  saving: boolean;
  canManageConfig: boolean;
  secretVisible: boolean;
  fieldError: string;
  onDraftChange: (value: DraftValue) => void;
  onFormatJson: () => void;
  onToggleSecret: () => void;
  onSave: () => Promise<boolean>;
  onReset: () => Promise<void>;
  onShowHistory: () => void;
}

const TIER_VARIANT: Record<ConfigTier, 'neutral' | 'primary' | 'warning'> = {
  user: 'neutral',
  admin: 'primary',
  advanced: 'warning',
};

const SOURCE_VARIANT: Record<ConfigSource, 'warning' | 'info' | 'neutral'> = {
  runtime: 'warning',
  env: 'info',
  default: 'neutral',
};

export const ConfigItemRow: React.FC<ConfigItemRowProps> = ({
  item,
  draft,
  dirty,
  saving,
  canManageConfig,
  secretVisible,
  fieldError,
  onDraftChange,
  onFormatJson,
  onToggleSecret,
  onSave,
  onReset,
  onShowHistory,
}) => {
  const source = item.source ?? 'default';
  const tier = item.tier ?? 'admin';
  const hot = item.hot !== false;
  const hasEnv = item.envValue !== null && item.envValue !== undefined;
  const outcome = toSubmitValue(item, draft);
  const invalid = dirty && !outcome.valid;

  const badges = (
    <div className={styles.configBadges}>
      {item.dangerous && (
        <Tag variant="error" icon={ShieldAlert}>
          {t('危险')}
        </Tag>
      )}
      {item.isModified && (
        <Tag variant="warning" icon={Sparkles}>
          {t('已修改')}
        </Tag>
      )}
      <Tag variant={TIER_VARIANT[tier]}>{TIER_LABEL[tier]}</Tag>
      <Tag variant={SOURCE_VARIANT[source]}>{SOURCE_LABEL[source]}</Tag>
      {hot ? (
        <Tag variant="success" icon={Zap}>
          {t('即时生效')}
        </Tag>
      ) : (
        <Tag variant="warning" icon={Power}>
          {t('需重启服务')}
        </Tag>
      )}
      {item.isPublic && (
        <Tag variant="neutral" icon={Eye}>
          {t('公开')}
        </Tag>
      )}
    </div>
  );

  const control = (
    <ConfigInput
      item={item}
      draft={draft}
      disabled={!canManageConfig || saving}
      invalid={invalid}
      secretVisible={secretVisible}
      onChange={onDraftChange}
      onToggleSecret={onToggleSecret}
      onFormatJson={onFormatJson}
    />
  );

  return (
    <div
      className={`${styles.configItem} ${item.isModified ? styles.modified : ''}`}
      data-testid="rc-item"
      data-key={item.key}
      data-modified={item.isModified}
    >
      {/* 第一行：key + 徽标 + 控件（布尔开关）/ 操作按钮 */}
      <div className={styles.itemHeader}>
        <div className={styles.itemTitle}>
          <span className={styles.configKey}>{item.key}</span>
          {badges}
        </div>
        <div className={styles.itemActions}>
          {item.type === 'boolean' && control}
          <Button
            variant={dirty ? 'primary' : 'secondary'}
            size="sm"
            icon={Save}
            onClick={() => {
              void onSave();
            }}
            disabled={!dirty || !canManageConfig}
            loading={saving}
            data-testid="rc-save"
            tooltip={hot ? t('保存') : t('保存（该项需重启服务后生效）')}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={RotateCcw}
            onClick={() => {
              void onReset();
            }}
            disabled={!canManageConfig || saving}
            data-testid="rc-reset"
            tooltip={t('恢复默认')}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={History}
            onClick={onShowHistory}
            data-testid="rc-history"
            tooltip={t('修改历史')}
          />
        </div>
      </div>

      {/* 第二行：说明与元信息 */}
      <div className={styles.itemBody}>
        {item.description && (
          <p className={styles.configDescription}>{item.description}</p>
        )}

        {item.type !== 'boolean' && control}

        {/* 差异对比：默认值 → 当前值 */}
        {item.isModified && (
          <div className={styles.diffRow}>
            <span className={styles.diffLabel}>{t('默认值')}</span>
            <code className={styles.diffValue}>
              {formatValue(item.defaultValue ?? null)}
            </code>
            <span className={styles.diffArrow}>→</span>
            <span className={styles.diffLabel}>{t('当前值')}</span>
            <code className={`${styles.diffValue} ${styles.diffCurrent}`}>
              {dirty && outcome.valid && outcome.value !== undefined
                ? formatValue(outcome.value)
                : formatValue(item.value)}
            </code>
          </div>
        )}

        {/* 环境变量提示：恢复默认不会回到代码默认值 */}
        {hasEnv && (
          <div className={styles.envNote}>
            <TerminalSquare size={13} />
            <span>
              {t('环境变量已设置该值（{env}），运行时配置优先级更高。', {
                env: formatValue(item.envValue as never),
              })}
              {item.isModified && (
                <span className={styles.envNoteHint}>
                  {t('恢复默认将改由环境变量生效。')}
                </span>
              )}
            </span>
          </div>
        )}

        {/* 影响说明：改了会怎样 */}
        {item.impact && (
          <div
            className={`${styles.impactRow} ${
              item.dangerous ? styles.impactDanger : ''
            }`}
          >
            <AlertCircle size={13} />
            <span>{item.impact}</span>
          </div>
        )}

        {fieldError && (
          <div className={styles.fieldError} data-testid="rc-field-error">
            <AlertCircle size={13} />
            <span>{fieldError}</span>
          </div>
        )}

        {!saving && !canManageConfig && (
          <span className={styles.readOnlyTag}>{t('只读')}</span>
        )}

        {item.updatedAt && (
          <div className={styles.updatedInfo}>
            <Clock size={11} />
            <span>{formatDateTimeWithSeconds(item.updatedAt)}</span>
            {item.updatedBy ? <span> · {item.updatedBy}</span> : null}
          </div>
        )}
      </div>
    </div>
  );
};
