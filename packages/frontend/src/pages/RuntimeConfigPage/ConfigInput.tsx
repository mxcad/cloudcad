///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { RuntimeConfigResponseDto } from '@/api-sdk';
import { isSensitiveKey, getConfigUnit, parseValue } from './hooks/useRuntimeConfig';

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
        variant="ghost"
        onClick={() => onValueChange(item.key, !value)}
        className={`toggle-switch ${value ? 'active' : ''}`}
        disabled={!canManageConfig}
      >
        <span className="toggle-handle" />
      </Button>
    );
  }

  if (item.type === 'number') {
    return (
      <div className="number-input-wrapper">
        <Input
          type="number"
          value={value as number}
          onChange={(e) => onValueChange(item.key, Number(e.target.value))}
          disabled={!canManageConfig}
          min={0}
        />
        {unit && <span className="input-unit">{unit}</span>}
      </div>
    );
  }

  if (isSensitive) {
    return (
      <div className="sensitive-input-wrapper">
        <Input
          type={isHidden ? 'password' : 'text'}
          value={value as string}
          onChange={(e) => onValueChange(item.key, e.target.value)}
          disabled={!canManageConfig}
          placeholder="••••••••"
        />
        <Button
          variant="ghost"
          size="sm"
          icon={isHidden ? EyeOff : Eye}
          onClick={() => onToggleVisibility(item.key)}
          className="visibility-toggle"
          tabIndex={-1}
          tooltip={isHidden ? '显示值' : '隐藏值'}
        />
      </div>
    );
  }

  return (
    <Input
      type="text"
      value={value as string}
      onChange={(e) => onValueChange(item.key, e.target.value)}
      disabled={!canManageConfig}
      placeholder="请输入..."
    />
  );
};
