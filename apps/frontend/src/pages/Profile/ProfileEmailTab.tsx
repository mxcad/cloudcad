import React from 'react';
import { Mail } from 'lucide-react';
import { Shield } from 'lucide-react';
import { CheckCircle } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { Send } from 'lucide-react';

interface EmailForm {
  email: string;
  code: string;
}

interface ProfileEmailTabProps {
  email?: string | null | undefined;
  emailForm: EmailForm;
  emailStep: 'input' | 'verify';
  loading: boolean;
  focusedField: string | null;
  setFocusedField: (field: string | null) => void;
  onEmailChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSendBindCode: (e: React.FormEvent) => void;
  onVerifyBindEmail: (e: React.FormEvent) => void;
  onSetEmailStep: (step: 'input' | 'verify') => void;
}

export const ProfileEmailTab: React.FC<ProfileEmailTabProps> = ({
  email,
  emailForm,
  emailStep,
  loading,
  focusedField,
  setFocusedField,
  onEmailChange,
  onSendBindCode,
  onVerifyBindEmail,
  onSetEmailStep,
}) => {
  return (
    <div className="tab-content animate-fade-in">
      {email ? (
        <div className="email-bound">
          <div className="success-icon">
            <CheckCircle size={48} />
          </div>
          <h3>邮箱已绑定</h3>
          <p className="bound-email">{email}</p>
          <div className="benefits">
            <div className="benefit-item">
              <CheckCircle size={14} />
              <span>可用于找回密码</span>
            </div>
            <div className="benefit-item">
              <CheckCircle size={14} />
              <span>接收系统通知</span>
            </div>
            <div className="benefit-item">
              <CheckCircle size={14} />
              <span>账户安全验证</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="email-form">
          {emailStep === 'input' ? (
            <form onSubmit={onSendBindCode}>
              <div
                className={`input-group ${focusedField === 'email' ? 'focused' : ''}`}
              >
                <label className="input-label">
                  <Mail size={14} />
                  邮箱地址
                </label>
                <div className="input-wrapper">
                  <input
                    type="email"
                    name="email"
                    value={emailForm.email}
                    onChange={onEmailChange}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="请输入您的邮箱地址"
                    required
                  />
                  <div className="input-glow" />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="submit-button"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>发送中...</span>
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    <span>发送验证码</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={onVerifyBindEmail}>
              <div className="email-preview">
                <Mail size={20} />
                <span>{emailForm.email}</span>
              </div>
              <div
                className={`input-group ${focusedField === 'code' ? 'focused' : ''}`}
              >
                <label className="input-label">
                  <Shield size={14} />
                  验证码
                </label>
                <div className="input-wrapper">
                  <input
                    type="text"
                    name="code"
                    value={emailForm.code}
                    onChange={onEmailChange}
                    onFocus={() => setFocusedField('code')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="请输入6位验证码"
                    maxLength={6}
                    required
                  />
                  <div className="input-glow" />
                </div>
              </div>
              <div className="button-group">
                <button
                  type="button"
                  className="back-button-form"
                  onClick={() => onSetEmailStep('input')}
                >
                  返回修改
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="submit-button"
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>验证中...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={18} />
                      <span>确认绑定</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
