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
 * Logo URL 输入控件：文本输入 + 上传按钮 + 预览。
 *
 * `brandLogo` 从品牌档案拆为独立配置项后（#499），原品牌档案表单里的
 * Logo 上传入口保留在此：上传图片即覆盖输入框里的 URL（仍需点保存才生效）。
 */

import React, { useRef, useState } from 'react';
import { ImageUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { runtimeConfigControllerUploadBrandLogo } from '@/api-sdk';
import styles from './RuntimeConfigPage.module.css';
import { t } from '@/languages';

interface BrandLogoInputProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

export const BrandLogoInput: React.FC<BrandLogoInputProps> = ({
  value,
  disabled,
  onChange,
}) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 上传图片即覆盖旧 Logo，返回的 URL 写进输入框（仍需点保存才生效） */
  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
      if (url) onChange(String(url));
    } catch {
      // 上传失败由 SDK 统一提示，此处保持当前值不动
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.brandLogoRow}>
      {value ? (
        <span className={styles.brandLogoPreview}>
          <img src={value} alt={t('当前 Logo')} />
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
        onClick={() => fileInputRef.current?.click()}
        data-testid="rc-brand-upload-logo"
      >
        {t('上传 Logo')}
      </Button>
      <Input
        type="text"
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="/logo.png"
        maxLength={200}
        spellCheck={false}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/x-icon"
        style={{ display: 'none' }}
        disabled={disabled}
        onChange={(e) => void handleFile(e)}
        data-testid="rc-brand-logo-input"
      />
    </div>
  );
};
