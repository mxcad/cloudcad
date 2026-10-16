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
 * 客服邮箱/电话不在这里：它们各有 `supportEmail` / `supportPhone` 配置项，
 * 以那两项为准，本表单只保留服务时间，避免双写。
 */

import React, { useMemo, useRef, useState } from 'react';
import { ImageUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { runtimeConfigControllerUploadBrandLogo } from '@/api-sdk';
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
  const [uploading, setUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const support = isJsonObject(value.support) ? value.support : {};
  const legal = isJsonObject(value.legal) ? value.legal : {};
  const identities = isJsonObject(legal.identities) ? legal.identities : {};
  const apps = isJsonObject(value.apps) ? value.apps : {};
  const logo = readString(value.logo);

  const setField = (path: string[], next: string) => {
    onChange(commit(draft, (obj) => setByPath(obj, path, next)));
  };

  /** 上传图片即覆盖旧 Logo，返回的 URL 写进 `logo` 字段（仍需点保存才生效） */
  const handleLogoFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || disabled) return;

    setUploading(true);
    try {
      const result = await runtimeConfigControllerUploadBrandLogo({
        throwOnError: true,
        body: { file } as never,
      });
      const url = result.data?.logoUrl;
      if (url) setField(['logo'], String(url));
    } catch {
      // 上传失败由 SDK 统一提示，此处保持当前草稿不动
    } finally {
      setUploading(false);
    }
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
        <h4 className={styles.brandSectionTitle}>品牌与文档</h4>
        <div className={styles.brandFields}>
          <Field
            label="应用标题"
            value={readString(value.title)}
            disabled={disabled}
            placeholder="梦想网页CAD实时协同平台"
            onChange={(v) => setField(['title'], v)}
          />
          <Field
            label="标语（tagline）"
            value={readString(value.tagline)}
            disabled={disabled}
            placeholder="留空不显示"
            onChange={(v) => setField(['tagline'], v)}
          />
          <Field
            label="侧边栏副标题"
            value={readString(value.subtitle)}
            disabled={disabled}
            placeholder="留空用内置默认值"
            onChange={(v) => setField(['subtitle'], v)}
          />
          <Field
            label="帮助文档地址"
            value={readString(value.docsUrl)}
            disabled={disabled}
            placeholder="https://help.mxdraw.com/"
            onChange={(v) => setField(['docsUrl'], v)}
          />
          <div
            className={`${styles.brandField} ${styles.brandFieldFull}`.trim()}
          >
            <span className={styles.brandFieldLabel}>Logo</span>
            <div className={styles.brandLogoRow}>
              {logo ? (
                <span className={styles.brandLogoPreview}>
                  <img src={logo} alt={t('当前 Logo')} />
                </span>
              ) : (
                <span className={styles.brandLogoPreview}>
                  {t('未设置 Logo，使用内置默认值')}
                </span>
              )}
              <Button
                variant="secondary"
                size="sm"
                icon={ImageUp}
                disabled={disabled}
                loading={uploading}
                onClick={() => logoInputRef.current?.click()}
                data-testid="rc-brand-upload-logo"
              >
                {t('上传 Logo')}
              </Button>
              <Input
                type="text"
                size="sm"
                value={logo}
                onChange={(e) => setField(['logo'], e.target.value)}
                disabled={disabled}
                placeholder="/logo.png"
                maxLength={MAX_LEN}
                spellCheck={false}
              />
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                style={{ display: 'none' }}
                disabled={disabled}
                onChange={(e) => void handleLogoFile(e)}
                data-testid="rc-brand-logo-input"
              />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.brandSection}>
        <h4 className={styles.brandSectionTitle}>版权与法务</h4>
        <div className={styles.brandFields}>
          <Field
            label="版权年份"
            value={readString(value.copyrightYear)}
            disabled={disabled}
            placeholder="2026"
            onChange={(v) => setField(['copyrightYear'], v)}
          />
          <Field
            label="版权持有者"
            value={readString(value.copyrightHolder)}
            disabled={disabled}
            placeholder="留空用内置默认值"
            onChange={(v) => setField(['copyrightHolder'], v)}
          />
          <Field
            label="版权行模板"
            hint="支持 {year} {appName}"
            value={readString(value.copyrightLine)}
            disabled={disabled}
            placeholder="© {year} {appName}. All rights reserved."
            full
            onChange={(v) => setField(['copyrightLine'], v)}
          />
          <Field
            label="法务产品短名"
            value={readString(legal.productShortName)}
            disabled={disabled}
            placeholder="CloudCAD"
            onChange={(v) => setField(['legal', 'productShortName'], v)}
          />
          <Field
            label="法务产品全称"
            hint="留空用内置按语言值"
            value={readString(legal.productName)}
            disabled={disabled}
            placeholder="留空用内置按语言值"
            onChange={(v) => setField(['legal', 'productName'], v)}
          />
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
        <h4 className={styles.brandSectionTitle}>客服</h4>
        <div className={styles.brandFields}>
          <Field
            label="服务时间"
            value={readString(support.hours)}
            disabled={disabled}
            placeholder="周一至周五 9:00-18:00"
            onChange={(v) => setField(['support', 'hours'], v)}
          />
          <div className={styles.brandField}>
            <span className={styles.brandSectionHint}>
              {t('客服邮箱/电话请改「客服邮箱」「客服电话」配置项，优先级高于此处。')}
            </span>
          </div>
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
