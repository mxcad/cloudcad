///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { Phone, MessageSquare, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { t } from '@/languages';
import styles from '../Login.module.css';

interface PhoneLoginFormProps {
  phoneForm: { phone: string; code: string };
  loading: boolean;
  countdown: number;
  sendingCode: boolean;
  focusedField: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus: (field: string) => void;
  onBlur: () => void;
  onSendCode: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const PhoneLoginForm: React.FC<PhoneLoginFormProps> = ({
  phoneForm,
  loading,
  countdown,
  sendingCode,
  focusedField,
  onChange,
  onFocus,
  onBlur,
  onSendCode,
  onSubmit,
}) => {
  return (
    <form className={styles.loginForm} onSubmit={onSubmit}>
      <div
        className={`${styles.inputGroup} ${focusedField === 'phone' ? styles.focused : ''}`}
      >
        <label htmlFor="phone" className={styles.inputLabel}>
          {t('手机号')}
        </label>
        <div className={styles.inputWrapper}>
          <Phone
            size={18}
            className={`${styles.inputIcon} ${focusedField === 'phone' ? styles.active : ''}`}
          />
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            maxLength={11}
            className={styles.inputField}
            placeholder={t('请输入手机号')}
            value={phoneForm.phone}
            onChange={onChange}
            onFocus={() => onFocus('phone')}
            onBlur={onBlur}
          />
          <div className={styles.inputGlow} />
        </div>
      </div>

      <div
        className={`${styles.inputGroup} ${focusedField === 'code' ? styles.focused : ''}`}
      >
        <label htmlFor="code" className={styles.inputLabel}>
          {t('验证码')}
        </label>
        <div className={`${styles.inputWrapper} ${styles.hasButton}`}>
          <MessageSquare
            size={18}
            className={`${styles.inputIcon} ${focusedField === 'code' ? styles.active : ''}`}
          />
          <input
            id="code"
            name="code"
            type="text"
            autoComplete="one-time-code"
            required
            maxLength={6}
            className={`${styles.inputField} ${styles.hasButton}`}
            placeholder={t('请输入验证码')}
            value={phoneForm.code}
            onChange={onChange}
            onFocus={() => onFocus('code')}
            onBlur={onBlur}
          />
          <button
            type="button"
            className={styles.codeButton}
            onClick={onSendCode}
            disabled={
              countdown > 0 || sendingCode || phoneForm.phone.length !== 11
            }
          >
            {sendingCode ? (
              <Loader2 size={14} className="animate-spin" />
            ) : countdown > 0 ? (
              `${countdown}s`
            ) : (
              t('获取验证码')
            )}
          </button>
          <div className={styles.inputGlow} />
        </div>
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
