///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { MbFileSizeInput } from '@/components/ui/FileSize';
import type { RuntimeConfigResponseDto } from '@/api-sdk';
import {
  isSensitiveKey,
  getConfigUnit,
  parseValue,
} from './hooks/useRuntimeConfig';
import styles from './RuntimeConfigPage.module.css';
import { t } from '@/languages';

interface ConfigInputProps {
  item: RuntimeConfigResponseDto;
  editedValues: Record<string, string | number | boolean>;
  canManageConfig: boolean;
  hiddenValues: Set<string>;
  onValueChange: (key: string, value: string | number | boolean) => void;
  onToggleVisibility: (key: string) => void;
}

export const ConfigInput: React.FC<ConfigInputProps> = ({
  item,
  editedValues,
  canManageConfig,
  hiddenValues,
  onValueChange,
  onToggleVisibility,
}) => {
  const value = parseValue(item, editedValues);
  const isSensitive = isSensitiveKey(item.key);
  const isHidden = hiddenValues.has(item.key);
  const unit = getConfigUnit(item.key);

  if (item.type === 'boolean') {
    return (
      <Button
        variant="secondary"
        onClick={() => onValueChange(item.key, !value)}
        className={`${styles.toggleSwitch} ${value ? styles.active : ''}`}
        disabled={!canManageConfig}
      >
        <span className={styles.toggleHandle} />
      </Button>
    );
  }

  if (item.type === 'number') {
    if (unit === 'MB') {
      return (
        <div className={styles.numberInputWrapper}>
          <MbFileSizeInput
            mbValue={value as number}
            onChange={(mb) => onValueChange(item.key, mb ?? 0)}
            min={0}
            disabled={!canManageConfig}
          />
        </div>
      );
    }
    return (
      <div className={styles.numberInputWrapper}>
        <Input
          type="number"
          value={value as number}
          onChange={(e) => onValueChange(item.key, Number(e.target.value))}
          disabled={!canManageConfig}
          min={0}
        />
      </div>
    );
  }

  if (isSensitive) {
    return (
      <Input
        type={isHidden ? 'password' : 'text'}
        value={value as string}
        onChange={(e) => onValueChange(item.key, e.target.value)}
        disabled={!canManageConfig}
        placeholder={t('••••••••')}
        rightNode={
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onToggleVisibility(item.key)}
            className={styles.visibilityToggle}
            aria-label={isHidden ? t('显示值') : t('隐藏值')}
            title={isHidden ? t('显示值') : t('隐藏值')}
          >
            {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        }
        rightNodeClassName={styles.visibilityToggleNode}
      />
    );
  }

  return (
    <Input
      type="text"
      value={value as string}
      onChange={(e) => onValueChange(item.key, e.target.value)}
      disabled={!canManageConfig}
      placeholder={t('请输入...')}
    />
  );
};
