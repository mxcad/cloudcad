///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';

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
    <form className="login-form" onSubmit={onSubmit}>
      <div className={`input-group ${focusedField === 'account' ? 'focused' : ''}`}>
        <label htmlFor="account" className="input-label">
          {getAccountLoginLabel()}
        </label>
        <div className="input-wrapper">
          <Mail
            size={18}
            className={`input-icon ${focusedField === 'account' ? 'active' : ''}`}
          />
          <input
            id="account"
            name="account"
            type="text"
            autoComplete="email username tel"
            required
            className="input-field"
            placeholder={getAccountLoginPlaceholder()}
            value={formData.account}
            onChange={onChange}
            onFocus={() => onFocus('account')}
            onBlur={onBlur}
          />
          <div className="input-glow" />
        </div>
      </div>

      <div className={`input-group ${focusedField === 'password' ? 'focused' : ''}`}>
        <label htmlFor="password" className="input-label">
          密码
        </label>
        <div className="input-wrapper">
          <Lock
            size={18}
            className={`input-icon ${focusedField === 'password' ? 'active' : ''}`}
          />
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            className="input-field has-toggle"
            placeholder="请输入密码"
            value={formData.password}
            onChange={onChange}
            onFocus={() => onFocus('password')}
            onBlur={onBlur}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={onTogglePassword}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          <div className="input-glow" />
        </div>
      </div>

      <div className="form-options">
        <button
          type="button"
          onClick={onForgotPassword}
          className="forgot-password-link"
        >
          忘记密码？
        </button>
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
