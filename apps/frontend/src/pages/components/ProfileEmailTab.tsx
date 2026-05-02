import React from 'react';
import { Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface ProfileEmailTabProps {
  user?: { email?: string | null } | null;
  emailForm: { email: string; code: string };
  emailStep: 'input' | 'verify' | 'verifyOld' | 'inputNew' | 'verifyNew';
  isEditingEmail: boolean;
  verifyToken: string;
  countdown: number;
  sendingCode: boolean;
  loading: boolean;

  
  focusedField: string | null;
  mailEnabled?: boolean; // 邮件服务是否启用
  onEmailChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSendBindCode: (e: React.FormEvent) => void;
  onVerifyBindEmail: (e: React.FormEvent) => void;
  onFocusField: (field: string | null) => void;
  // 换绑相关
  onSendUnbindCode: () => void;
  onVerifyOldEmail: (e: React.FormEvent) => void;
  onSendNewEmailCode: () => void;
  onRebindEmail: (e: React.FormEvent) => void;
  onSetEditingEmail: (editing: boolean) => void;
}

export const ProfileEmailTab: React.FC<ProfileEmailTabProps> = ({
  user,
  emailForm,
  emailStep,
  isEditingEmail,
  verifyToken,
  countdown,
  sendingCode,
  loading,


  focusedField,
  mailEnabled = false,
  onEmailChange,
  onSendBindCode,
  onVerifyBindEmail,
  onFocusField,
  onSendUnbindCode,
  onVerifyOldEmail,
  onSendNewEmailCode,
  onRebindEmail,
  onSetEditingEmail,
}) => {
  // 已绑定且不在编辑模式
  if (user?.email && !isEditingEmail) {
    return (
      <div className="tab-content animate-fade-in">
        <div className="email-bound">
          <div className="success-icon">
            <CheckCircle size={48} />
          </div>
          <h3>邮箱已绑定</h3>
          <p className="bound-email">{user.email}</p>
          <div className="benefits">
            <div className="benefit-item">
              <CheckCircle size={14} />
              <span>找回密码</span>
            </div>
            <div className="benefit-item">
              <CheckCircle size={14} />
              <span>安全验证</span>
            </div>
            <div className="benefit-item">
              <CheckCircle size={14} />
              <span>重要通知</span>
            </div>
          </div>
          {mailEnabled && (
            <button
              type="button"
              className="submit-button"
              onClick={() => onSetEditingEmail(true)}
            >
              <Mail size={18} />
              <span>换绑邮箱</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const isRebind = !!user?.email;

  // 换绑流程：验证原邮箱
  if (isRebind && emailStep === 'verifyOld') {
    return (
      <div className="tab-content animate-fade-in">


        <form onSubmit={onVerifyOldEmail} className="email-form">
          <div className="verify-notice">
            <CheckCircle size={16} />
            <span>需要先验证原邮箱才能换绑</span>
          </div>

          <div
            className={`input-group ${focusedField === 'code' ? 'focused' : ''}`}
          >
            <label className="input-label">
              <Mail size={14} />
              原邮箱验证码
            </label>
            <div className="input-wrapper has-button">
              <input
                type="text"
                name="code"
                value={emailForm.code}
                onChange={onEmailChange}
                onFocus={() => onFocusField('code')}
                onBlur={() => onFocusField(null)}
                placeholder="请输入原邮箱验证码"
                maxLength={6}
                required
              />
              <button
                type="button"
                className="send-code-button"
                disabled={countdown > 0 || sendingCode}
                onClick={onSendUnbindCode}
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

          <div className="button-group">
            <button
              type="button"
              className="back-button-form"
              onClick={() => onSetEditingEmail(false)}
            >
              取消
            </button>
            <button type="submit" disabled={loading} className="submit-button">
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>验证中...</span>
                </>
              ) : (
                <>
                  <CheckCircle size={18} />
                  <span>验证</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // 换绑流程：输入新邮箱 / 验证新邮箱
  if (isRebind && (emailStep === 'inputNew' || emailStep === 'verifyNew')) {
    return (
      <div className="tab-content animate-fade-in">


        <form onSubmit={onRebindEmail} className="email-form">
          {emailStep === 'inputNew' && (
            <div className="verify-success">
              <CheckCircle size={16} />
              <span>原邮箱验证成功，请输入新邮箱</span>
            </div>
          )}

          <div
            className={`input-group ${focusedField === 'email' ? 'focused' : ''}`}
          >
            <label className="input-label">
              <Mail size={14} />
              {emailStep === 'verifyNew' ? '新邮箱地址' : '邮箱地址'}
            </label>
            <div className="input-wrapper has-button">
              <input
                type="email"
                name="email"
                value={emailForm.email}
                onChange={onEmailChange}
                onFocus={() => onFocusField('email')}
                onBlur={() => onFocusField(null)}
                placeholder="请输入邮箱地址"
                required
              />
              <button
                type="button"
                className="send-code-button"
                disabled={countdown > 0 || sendingCode}
                onClick={onSendNewEmailCode}
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

          {emailStep === 'verifyNew' && (
            <div
              className={`input-group ${focusedField === 'code' ? 'focused' : ''}`}
            >
              <label className="input-label">
                <CheckCircle size={14} />
                验证码
              </label>
              <div className="input-wrapper has-button">
                <input
                  type="text"
                  name="code"
                  value={emailForm.code}
                  onChange={onEmailChange}
                  onFocus={() => onFocusField('code')}
                  onBlur={() => onFocusField(null)}
                  placeholder="请输入 6 位验证码"
                  maxLength={6}
                  required
                />
                <div className="input-glow" />
              </div>
            </div>
          )}

          <div className="button-group">
            <button
              type="button"
              className="back-button-form"
              onClick={() => onSetEditingEmail(false)}
            >
              取消
            </button>
            {emailStep === 'inputNew' && (
              <button
                type="button"
                disabled={!emailForm.email || sendingCode}
                className="submit-button"
                onClick={onSendNewEmailCode}
              >
                {sendingCode ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>发送中...</span>
                  </>
                ) : (
                  <>
                    <Mail size={18} />
                    <span>发送验证码</span>
                  </>
                )}
              </button>
            )}
            {emailStep === 'verifyNew' && (
              <button
                type="submit"
                disabled={loading}
                className="submit-button"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>换绑中...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    <span>确认换绑</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    );
  }

  // 首次绑定流程
  return (
    <div className="tab-content animate-fade-in">



      {emailStep === 'input' ? (
        <form onSubmit={onSendBindCode} className="email-form">
          <div className="info-text">
            绑定邮箱后，可以通过邮箱找回密码和接收重要通知
          </div>

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
                onFocus={() => onFocusField('email')}
                onBlur={() => onFocusField(null)}
                placeholder="请输入邮箱地址"
                required
              />
              <div className="input-glow" />
            </div>
          </div>

          <button type="submit" disabled={loading} className="submit-button">
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>发送中...</span>
              </>
            ) : (
              <>
                <Mail size={18} />
                <span>发送验证码</span>
              </>
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={onVerifyBindEmail} className="email-form">
          <div className="email-preview">
            <Mail size={18} />
            <span>{emailForm.email}</span>
          </div>

          <div
            className={`input-group ${focusedField === 'code' ? 'focused' : ''}`}
          >
            <label className="input-label">
              <CheckCircle size={14} />
              验证码
            </label>
            <div className="input-wrapper has-button">
              <input
                type="text"
                name="code"
                value={emailForm.code}
                onChange={onEmailChange}
                onFocus={() => onFocusField('code')}
                onBlur={() => onFocusField(null)}
                placeholder="请输入 6 位验证码"
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
              onClick={() => {
                onEmailChange({
                  target: { name: 'email', value: '' },
                } as React.ChangeEvent<HTMLInputElement>);
                onEmailChange({
                  target: { name: 'code', value: '' },
                } as React.ChangeEvent<HTMLInputElement>);
              }}
            >
              返回修改
            </button>
            <button type="submit" disabled={loading} className="submit-button">
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
  );
};
