///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { t } from '@/languages';
import styles from '../Login.module.css';

interface AccountLoginFormProps {
  formData: { account: string; password: string };
  loading: boolean;
  showPassword: boolean;
  focusedField: string | null;
  getAccountLoginLabel: () => string;
  getAccountLoginPlaceholder: () => string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus: (field: string) => void;
  onBlur: () => void;
  onTogglePassword: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onForgotPassword: () => void;
}

export const AccountLoginForm: React.FC<AccountLoginFormProps> = ({
  formData,
  loading,
  showPassword,
  focusedField,
  getAccountLoginLabel,
  getAccountLoginPlaceholder,
  onChange,
  onFocus,
  onBlur,
  onTogglePassword,
  onSubmit,
  onForgotPassword,
}) => {
  return (
    <form className={styles.loginForm} onSubmit={onSubmit}>
      <div
        className={`${styles.inputGroup} ${focusedField === 'account' ? styles.focused : ''}`}
      >
        <label htmlFor="account" className={styles.inputLabel}>
          {getAccountLoginLabel()}
        </label>
        <div className={styles.inputWrapper}>
          <Mail
            size={18}
            className={`${styles.inputIcon} ${focusedField === 'account' ? styles.active : ''}`}
          />
          <input
            id="account"
            name="account"
            type="text"
            autoComplete="email username tel"
            required
            className={styles.inputField}
            placeholder={getAccountLoginPlaceholder()}
            value={formData.account}
            onChange={onChange}
            onFocus={() => onFocus('account')}
            onBlur={onBlur}
          />
          <div className={styles.inputGlow} />
        </div>
      </div>

      <div
        className={`${styles.inputGroup} ${focusedField === 'password' ? styles.focused : ''}`}
      >
        <label htmlFor="password" className={styles.inputLabel}>
          {t('密码')}
        </label>
        <div className={styles.inputWrapper}>
          <Lock
            size={18}
            className={`${styles.inputIcon} ${focusedField === 'password' ? styles.active : ''}`}
          />
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            className={`${styles.inputField} ${styles.hasToggle}`}
            placeholder={t('请输入密码')}
            value={formData.password}
            onChange={onChange}
            onFocus={() => onFocus('password')}
            onBlur={onBlur}
          />
          <Button
            type="button"
            variant="icon"
            size="xs"
            onClick={onTogglePassword}
            tabIndex={-1}
            className="absolute right-4 top-1/2 -translate-y-1/2"
            icon={showPassword ? EyeOff : Eye}
            tooltip={showPassword ? t('隐藏密码') : t('显示密码')}
          />
          <div className={styles.inputGlow} />
        </div>
      </div>

      <div className={styles.formOptions}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onForgotPassword}
        >
          {t('忘记密码？')}
        </Button>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={loading}
        className="w-full"
      >
        {loading ? (
          <span>{t('登录中...')}</span>
        ) : (
          <>
            <span>{t('立即登录')}</span>
            <ArrowRight size={18} className={styles.buttonArrow} />
          </>
        )}
      </Button>
    </form>
  );
};
