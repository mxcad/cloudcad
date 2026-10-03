///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 类型感知输入控件：按 `type` + `input` 元数据渲染，不做任何本地推断。
 *
 * 渲染优先级：boolean 开关 > 枚举下拉 > json 编辑器 > 多行文本 > 数字（带单位）
 * > 遮罩输入 > 普通文本。单位不再靠 key 白名单硬编码，一律读 `input.unit`。
 */

import React from 'react';
import { Eye, EyeOff, Braces } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import styles from './RuntimeConfigPage.module.css';
import type { ConfigItem } from './types';
import type { DraftValue } from './validate';
import { t } from '@/languages';

interface ConfigInputProps {
  item: ConfigItem;
  draft: DraftValue;
  disabled: boolean;
  /** 本地校验失败 → 控件标红 */
  invalid: boolean;
  secretVisible: boolean;
  onChange: (value: DraftValue) => void;
  onToggleSecret: () => void;
  onFormatJson: () => void;
}

/** 字符计数（超过上限时标红） */
const CharCount: React.FC<{ length: number; max: number }> = ({
  length,
  max,
}) => (
  <span
    className={styles.charCount}
    style={length > max ? { color: 'var(--error)' } : undefined}
  >
    {length} / {max}
  </span>
);

export const ConfigInput: React.FC<ConfigInputProps> = ({
  item,
  draft,
  disabled,
  invalid,
  secretVisible,
  onChange,
  onToggleSecret,
  onFormatJson,
}) => {
  const meta = item.input;
  const text = typeof draft === 'string' ? draft : '';

  // ── 布尔：开关 ──
  if (item.type === 'boolean') {
    const checked = draft === true;
    return (
      <div data-testid="rc-input" className={styles.switchRow}>
        <Checkbox
          size="sm"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className={styles.switchText}>
          {checked ? t('已开启') : t('已关闭')}
        </span>
      </div>
    );
  }

  // ── 枚举：下拉选择 ──
  if (meta?.options && meta.options.length > 0) {
    return (
      <div data-testid="rc-input" className={styles.controlRow}>
        <Select
          value={text}
          onChange={(value) => onChange(value)}
          options={meta.options.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          placeholder={meta.placeholder ?? t('请选择')}
          size="md"
          disabled={disabled}
        />
      </div>
    );
  }

  // ── JSON：多行编辑 + 合法性校验 + 格式化 ──
  if (item.type === 'json') {
    return (
      <div data-testid="rc-input" className={styles.jsonBlock}>
        <div className={styles.jsonActions}>
          <Button
            variant="ghost"
            size="xs"
            icon={Braces}
            onClick={onFormatJson}
            disabled={disabled}
            tooltip={t('格式化 JSON')}
          >
            {t('格式化')}
          </Button>
        </div>
        <Textarea
          variant={invalid ? 'error' : 'default'}
          size="sm"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={meta?.placeholder ?? '{}'}
          className={styles.jsonArea}
          spellCheck={false}
        />
      </div>
    );
  }

  // ── 多行文本：字符计数 + 上限拦截 ──
  if (meta?.multiline) {
    return (
      <div data-testid="rc-input" className={styles.controlBlock}>
        <Textarea
          variant={invalid ? 'error' : 'default'}
          size="sm"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={meta?.placeholder ?? t('请输入...')}
          maxLength={meta.maxLength}
        />
        {meta.maxLength !== undefined && (
          <div className={styles.metaRow}>
            <CharCount length={text.length} max={meta.maxLength} />
          </div>
        )}
      </div>
    );
  }

  // ── 数字：min / max / step + 单位后缀 ──
  if (item.type === 'number') {
    return (
      <div data-testid="rc-input" className={styles.numberRow}>
        <Input
          variant={invalid ? 'error' : 'default'}
          type="number"
          size="md"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          min={meta?.min}
          max={meta?.max}
          step={meta?.step}
          placeholder={meta?.placeholder ?? t('请输入数字')}
          className={styles.numberInput}
        />
        {meta?.unit && <span className={styles.unitSuffix}>{meta.unit}</span>}
      </div>
    );
  }

  // ── 遮罩输入（密钥类）：显示/隐藏切换 ──
  if (meta?.secret) {
    return (
      <div data-testid="rc-input" className={styles.controlRow}>
        <Input
          variant={invalid ? 'error' : 'default'}
          type={secretVisible ? 'text' : 'password'}
          size="md"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={meta?.placeholder ?? t('••••••••')}
          maxLength={meta.maxLength}
          rightNode={
            <button
              type="button"
              tabIndex={-1}
              onClick={onToggleSecret}
              className={styles.visibilityToggle}
              aria-label={secretVisible ? t('隐藏值') : t('显示值')}
              title={secretVisible ? t('隐藏值') : t('显示值')}
            >
              {secretVisible ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          }
          rightNodeClassName={styles.visibilityToggleNode}
        />
        {meta.maxLength !== undefined && (
          <span className={styles.charCount}>
            {text.length} / {meta.maxLength}
          </span>
        )}
      </div>
    );
  }

  // ── 普通文本 ──
  return (
    <div data-testid="rc-input" className={styles.controlRow}>
      <Input
        variant={invalid ? 'error' : 'default'}
        type="text"
        size="md"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={meta?.placeholder ?? t('请输入...')}
        maxLength={meta?.maxLength}
      />
      {meta?.maxLength !== undefined && (
        <span className={styles.charCount}>
          {text.length} / {meta.maxLength}
        </span>
      )}
    </div>
  );
};
