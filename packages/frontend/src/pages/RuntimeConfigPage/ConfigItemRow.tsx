///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 单个配置项行：key + 徽标（危险/档位/来源/公开）+ 描述 +
 * 影响说明 + 系统预置提示 + 默认值对比 + 类型感知控件 + 就地错误 + 操作按钮。
 */

import React, { useMemo } from 'react';
import { resolveBrandFallbackValue } from '@/constants/appConfig';
import { useAppBrand } from '@/hooks/useAppBrand';
import {
  Save,
  RotateCcw,
  History,
  ShieldAlert,
  Eye,
  TerminalSquare,
  AlertCircle,
  Clock,
  GitBranch,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { formatDateTimeWithSeconds } from '@/utils/dateUtils';
import styles from './RuntimeConfigPage.module.css';
import { ConfigInput } from './ConfigInput';
import { SOURCE_LABEL, TIER_LABEL, configItemId, formatValue } from './meta';
import type { ConfigItem, ConfigTier, ConfigSource } from './types';
import { toSubmitValue } from './validate';
import type { DraftValue } from './validate';
import type { DependencyStatus } from './types';
import { t } from '@/languages';

interface ConfigItemRowProps {
  item: ConfigItem;
  draft: DraftValue;
  dirty: boolean;
  saving: boolean;
  canManageConfig: boolean;
  secretVisible: boolean;
  fieldError: string;
  /** 开关依赖状态（检查手段②）：依赖项 + 满足/不满足 */
  dependencyStatus: DependencyStatus[];
  onDraftChange: (value: DraftValue) => void;
  onFormatJson: () => void;
  onToggleSecret: () => void;
  onSave: () => Promise<boolean>;
  onReset: () => Promise<void>;
  onShowHistory: () => void;
  /** 是否为「点击定位」的落点（通道缺失键跳转过来后短暂闪烁） */
  highlight?: boolean;
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
  dependencyStatus,
  onDraftChange,
  onFormatJson,
  onToggleSecret,
  onSave,
  onReset,
  onShowHistory,
  highlight = false,
}) => {
  const source = item.source ?? 'default';
  const tier = item.tier ?? 'admin';
  const hasEnv = item.envValue !== null && item.envValue !== undefined;
  const outcome = toSubmitValue(item, draft);
  const invalid = dirty && !outcome.valid;

  // 品牌与客服项的后端 `defaultValue` 是空串哨兵（真实默认值只存在于前端品牌链），
  // 改用回落值展示。订阅品牌变更：管理端改完品牌后这些行的默认值要跟着变。
  const appBrand = useAppBrand();
  const brandFallback = useMemo(
    () => resolveBrandFallbackValue(item.key),
    [item.key, appBrand]
  );

  const badges = (
    <div className={styles.configBadges}>
      {item.dangerous && (
        <Tag variant="error" icon={ShieldAlert}>
          {t('危险')}
        </Tag>
      )}
      <Tag variant={TIER_VARIANT[tier]}>{TIER_LABEL[tier]}</Tag>
      <Tag variant={SOURCE_VARIANT[source]}>{SOURCE_LABEL[source]}</Tag>
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
      id={configItemId(item.key)}
      className={`${styles.configItem} ${item.isModified ? styles.modified : ''} ${
        highlight ? styles.focusFlash : ''
      }`}
      data-testid="rc-item"
      data-key={item.key}
      data-modified={item.isModified}
    >
      {/* 第一行：key + 徽标 + 控件（布尔开关）/ 操作按钮 */}
      <div className={styles.itemHeader}>
        <div className={styles.itemTitle}>
          <span className={styles.configName}>
            {item.description ?? item.key}
          </span>
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
            tooltip={t('保存')}
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
        {item.type !== 'boolean' && control}

        {/* 默认值 → 当前值。品牌与客服项的后端 defaultValue 是空串哨兵（真实默认值
            只在前端品牌链里），改用回落值展示；这些行即使未修改也显示，否则永远
            看不到「留空时生效的是什么」。 */}
        {(item.isModified || brandFallback !== null) && (
          <div className={styles.diffRow}>
            <span className={styles.diffLabel}>{t('默认值')}</span>
            <code className={styles.diffValue}>
              {brandFallback !== null
                ? brandFallback || t('（空）')
                : formatValue(item.defaultValue ?? null)}
            </code>
            {item.isModified && (
              <>
                <span className={styles.diffArrow}>→</span>
                <span className={styles.diffLabel}>{t('当前值')}</span>
                <code className={`${styles.diffValue} ${styles.diffCurrent}`}>
                  {dirty && outcome.valid && outcome.value !== undefined
                    ? formatValue(outcome.value)
                    : formatValue(item.value)}
                </code>
              </>
            )}
          </div>
        )}

        {/* 系统预置提示：恢复默认不会回到代码默认值，会退回预置值 */}
        {hasEnv && (
          <div className={styles.envNote}>
            <TerminalSquare size={13} />
            <span>
              {t('此项由系统预置为 {env}，你在这里保存后会覆盖它。', {
                env: formatValue(item.envValue as never),
              })}
              {item.isModified && (
                <span className={styles.envNoteHint}>
                  {t('恢复出厂后这一项会改由系统预置值接管。')}
                </span>
              )}
            </span>
          </div>
        )}

        {/* 开关依赖状态（检查手段②）：依赖项 + 满足/不满足，解释开关为什么开不了 */}
        {dependencyStatus.length > 0 && (
          <div className={styles.dependencyRow} data-testid="rc-dependency">
            <GitBranch size={13} />
            <span>{t('依赖')}</span>
            {dependencyStatus.map((dep) => (
              <Tag
                key={dep.key}
                variant={dep.satisfied ? 'success' : 'error'}
              >
                {dep.label}
                {dep.satisfied ? t('（已满足）') : t('（未满足）')}
              </Tag>
            ))}
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
