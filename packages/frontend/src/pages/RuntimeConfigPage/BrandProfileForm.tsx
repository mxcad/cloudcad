///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 品牌档案（brandProfile）表单：把 JSON 草稿渲染成字段级控件。
 *
 * 草稿仍是同一个 JSON 字符串（`DraftValue`），保存/校验/历史/恢复默认全部沿用
 * 配置项的通用链路；这里只负责「读写」——改动后重新序列化回写，清空字段即删除
 * 该键（前端语义是「缺省走内置默认值」，空串不是清空）。
 *
 * 表单不覆盖的键（如历史遗留字段）原样保留，不做整块重建。
 * 所有固定路径字段都不在这里：它们已拆为独立配置项（#499 外观四键 + 客服邮箱/
 * 电话/文档地址，#501 版权三项 + 法务产品名两项 + 服务时间），以单项为准，
 * 避免双写。表单只剩必须嵌套的动态结构：legal.identities（多主体/多语言）与
 * apps（多端品牌）——这两类平铺会污染键空间，且其「恢复默认」是删除整个条目，
 * 与固定路径字段语义不同。
 */

import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import styles from './RuntimeConfigPage.module.css';
import {
  commit,
  isJsonObject,
  parseDraft,
  setByPath,
  type JsonObject,
} from './brandProfileDraft';
import type { DraftValue } from './validate';
import { t } from '@/languages';

/** 与后端 `BrandConfig` 各字符串字段一致的长度上限 */
const MAX_LEN = 200;

/** 法务签约主体按语言配置（法务侧唯一必须本地化的字段） */
const LEGAL_LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en-US', label: 'English' },
  { code: 'ko-KR', label: '한국어' },
] as const;

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

interface FieldProps {
  label: string;
  hint?: string;
  value: string;
  disabled: boolean;
  placeholder?: string;
  full?: boolean;
  onChange: (value: string) => void;
}

/** 单个字段：标签 + 全宽输入框 */
const Field: React.FC<FieldProps> = ({
  label,
  hint,
  value,
  disabled,
  placeholder,
  full = false,
  onChange,
}) => (
  <div
    className={`${styles.brandField} ${full ? styles.brandFieldFull : ''}`.trim()}
  >
    <span className={styles.brandFieldLabel}>
      {label}
      {hint ? <span className={styles.brandFieldHint}>{hint}</span> : null}
    </span>
    <Input
      type="text"
      size="md"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      maxLength={MAX_LEN}
      spellCheck={false}
    />
  </div>
);

interface BrandProfileFormProps {
  /** JSON 草稿（当前值或用户未保存的编辑） */
  draft: DraftValue;
  disabled: boolean;
  onChange: (value: DraftValue) => void;
}

export const BrandProfileForm: React.FC<BrandProfileFormProps> = ({
  draft,
  disabled,
  onChange,
}) => {
  const value = useMemo(() => parseDraft(draft), [draft]);
  const [newAppId, setNewAppId] = useState('');

  const legal = isJsonObject(value.legal) ? value.legal : {};
  const identities = isJsonObject(legal.identities) ? legal.identities : {};
  const apps = isJsonObject(value.apps) ? value.apps : {};

  const setField = (path: string[], next: string) => {
    onChange(commit(draft, (obj) => setByPath(obj, path, next)));
  };

  const addApp = () => {
    const appId = newAppId.trim().toLowerCase();
    if (!appId || isJsonObject(apps[appId])) return;
    onChange(
      commit(draft, (obj) => {
        if (!isJsonObject(obj.apps)) obj.apps = {};
        (obj.apps as JsonObject)[appId] = {};
      })
    );
    setNewAppId('');
  };

  const removeApp = (appId: string) => {
    onChange(
      commit(draft, (obj) => {
        if (isJsonObject(obj.apps)) delete (obj.apps as JsonObject)[appId];
      })
    );
  };

  return (
    <div data-testid="rc-brand-profile-form" className={styles.brandForm}>
      <div className={styles.brandSection}>
        <div className={styles.brandSectionHead}>
          <h4 className={styles.brandSectionTitle}>签约主体（按语言）</h4>
          <span className={styles.brandSectionHint}>
            {t('法务侧唯一必须本地化的字段；留空用内置默认值')}
          </span>
        </div>
        <div className={styles.brandFields}>
          {LEGAL_LANGUAGES.map(({ code, label }) => (
            <Field
              key={code}
              label={`签约主体（${label}）`}
              value={readString(
                isJsonObject(identities[code]) ? (identities[code] as JsonObject).entityName : ''
              )}
              disabled={disabled}
              placeholder="留空用内置默认值"
              onChange={(v) => setField(['legal', 'identities', code, 'entityName'], v)}
            />
          ))}
        </div>
      </div>

      <div className={styles.brandSection}>
        <div className={styles.brandSectionHead}>
          <h4 className={styles.brandSectionTitle}>按应用覆盖（apps）</h4>
          <span className={styles.brandSectionHint}>
            {t('按应用 ID 覆盖标题/标语/Logo，登录页按 URL 参数匹配')}
          </span>
        </div>
        {Object.keys(apps).length === 0 && (
          <span className={styles.brandSectionHint}>{t('未配置按应用覆盖')}</span>
        )}
        {Object.entries(apps).map(([appId, app]) => (
          <div key={appId} className={styles.brandSection}>
            <div className={styles.brandSectionHead}>
              <code className={styles.brandAppId}>apps.{appId}</code>
              <Button
                variant="ghost"
                size="xs"
                icon={Trash2}
                disabled={disabled}
                onClick={() => removeApp(appId)}
                tooltip={t('移除该应用覆盖')}
                data-testid="rc-brand-remove-app"
              >
                {t('移除')}
              </Button>
            </div>
            <div className={styles.brandFields}>
              <Field
                label="标题"
                value={readString(isJsonObject(app) ? app.title : '')}
                disabled={disabled}
                onChange={(v) => setField(['apps', appId, 'title'], v)}
              />
              <Field
                label="标语"
                value={readString(isJsonObject(app) ? app.tagline : '')}
                disabled={disabled}
                onChange={(v) => setField(['apps', appId, 'tagline'], v)}
              />
              <Field
                label="Logo"
                value={readString(isJsonObject(app) ? app.logo : '')}
                disabled={disabled}
                placeholder="/logo.png"
                full
                onChange={(v) => setField(['apps', appId, 'logo'], v)}
              />
            </div>
          </div>
        ))}
        <div className={styles.brandAddRow}>
          <Input
            type="text"
            size="sm"
            value={newAppId}
            onChange={(e) => setNewAppId(e.target.value)}
            disabled={disabled}
            placeholder="应用 ID，如 mxcadweb"
            maxLength={50}
            spellCheck={false}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={Plus}
            disabled={disabled || !newAppId.trim()}
            onClick={addApp}
            data-testid="rc-brand-add-app"
          >
            {t('添加应用')}
          </Button>
        </div>
      </div>
    </div>
  );
};
