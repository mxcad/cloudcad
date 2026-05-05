///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
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
      <button
        type="button"
        onClick={() => onValueChange(item.key, !value)}
        className={`toggle-switch ${value ? 'active' : ''}`}
        disabled={!canManageConfig}
      >
        <span className="toggle-handle" />
      </button>
    );
  }

  if (item.type === 'number') {
    return (
      <div className="number-input-wrapper">
        <input
          type="number"
          value={value as number}
          onChange={(e) => onValueChange(item.key, Number(e.target.value))}
          className={`config-input number-input ${unit ? 'has-unit' : ''}`}
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
        <input
          type={isHidden ? 'password' : 'text'}
          value={value as string}
          onChange={(e) => onValueChange(item.key, e.target.value)}
          className="config-input sensitive-input"
          disabled={!canManageConfig}
          placeholder="••••••••"
        />
        <button
          type="button"
          onClick={() => onToggleVisibility(item.key)}
          className="visibility-toggle"
          tabIndex={-1}
        >
          {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    );
  }

  return (
    <input
      type="text"
      value={value as string}
      onChange={(e) => onValueChange(item.key, e.target.value)}
      className="config-input"
      disabled={!canManageConfig}
      placeholder="请输入..."
    />
  );
};
