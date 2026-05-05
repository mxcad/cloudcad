///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { Phone, MessageSquare, ArrowRight, Loader2 } from 'lucide-react';

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
          <button
            type="button"
            className="code-button"
            onClick={onSendCode}
            disabled={countdown > 0 || sendingCode || phoneForm.phone.length !== 11}
          >
            {sendingCode ? (
              <Loader2 size={14} className="animate-spin" />
            ) : countdown > 0 ? (
              `${countdown}s`
            ) : (
              '获取验证码'
            )}
          </button>
          <div className="input-glow" />
        </div>
      </div>

      <button type="submit" disabled={loading} className="submit-button">
        {loading ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            <span>登录中...</span>
          </>
        ) : (
          <>
            <span>立即登录</span>
            <ArrowRight size={18} className="button-arrow" />
          </>
        )}
      </button>
    </form>
  );
};
