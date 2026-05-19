///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { Phone, MessageSquare, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';

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
    <form className="login-form" onSubmit={onSubmit}>
      <div className={`input-group ${focusedField === 'phone' ? 'focused' : ''}`}>
        <label htmlFor="phone" className="input-label">
          手机号
        </label>
        <div className="input-wrapper">
          <Phone
            size={18}
            className={`input-icon ${focusedField === 'phone' ? 'active' : ''}`}
          />
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            maxLength={11}
            className="input-field"
            placeholder="请输入手机号"
            value={phoneForm.phone}
            onChange={onChange}
            onFocus={() => onFocus('phone')}
            onBlur={onBlur}
          />
          <div className="input-glow" />
        </div>
      </div>

      <div className={`input-group ${focusedField === 'code' ? 'focused' : ''}`}>
        <label htmlFor="code" className="input-label">
          验证码
        </label>
        <div className="input-wrapper has-button">
          <MessageSquare
            size={18}
            className={`input-icon ${focusedField === 'code' ? 'active' : ''}`}
          />
          <input
            id="code"
            name="code"
            type="text"
            autoComplete="one-time-code"
            required
            maxLength={6}
            className="input-field has-button"
            placeholder="请输入验证码"
            value={phoneForm.code}
            onChange={onChange}
            onFocus={() => onFocus('code')}
            onBlur={onBlur}
          />
          <Button type="button" variant="secondary" size="sm" onClick={onSendCode} disabled={countdown > 0 || sendingCode || phoneForm.phone.length !== 11} loading={sendingCode}>
            {countdown > 0 ? `${countdown}s` : '获取验证码'}
          </Button>
          <div className="input-glow" />
        </div>
      </div>

      <Button type="submit" variant="primary" size="md" loading={loading} className="w-full submit-button">
        <span>立即登录</span>
        <ArrowRight size={18} className="button-arrow" />
      </Button>
    </form>
  );
};
