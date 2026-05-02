import React from 'react';
import { Phone, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface ProfilePhoneTabProps {
  user?: { phone?: string | null; phoneVerified?: boolean } | null;
  phoneForm: { phone: string; code: string };
  phoneStep: 'verifyOld' | 'inputNew' | 'verifyNew';
  isEditingPhone: boolean;
  verifyToken: string;
  countdown: number;
  sendingCode: boolean;
  loading: boolean;


  focusedField: string | null;
  onPhoneChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSendPhoneCode: () => void;
  onSendUnbindCode: () => void;
  onVerifyOldPhone: (e: React.FormEvent) => void;
  onSendNewPhoneCode: () => void;
  onRebindPhone: (e: React.FormEvent) => void;
  onBindPhone: (e: React.FormEvent) => void;
  onFocusField: (field: string | null) => void;
  onSetEditingPhone: (editing: boolean) => void;
}

export const ProfilePhoneTab: React.FC<ProfilePhoneTabProps> = ({
  user,
  phoneForm,
  phoneStep,
  isEditingPhone,
  verifyToken,
  countdown,
  sendingCode,
  loading,


  focusedField,
  onPhoneChange,
  onSendPhoneCode,
  onSendUnbindCode,
  onVerifyOldPhone,
  onSendNewPhoneCode,
  onRebindPhone,
  onBindPhone,
  onFocusField,
  onSetEditingPhone,
}) => {
  if (user?.phone && !isEditingPhone) {
    return (
      <div className="tab-content animate-fade-in">
        <div className="phone-bound">
          <div className="success-icon">
            <CheckCircle size={48} />
          </div>
          <h3>手机已绑定</h3>
          <p className="bound-phone">{user.phone}</p>
          <div className="benefits">
            <div className="benefit-item">
              <CheckCircle size={14} />
              <span>快捷登录</span>
            </div>
            <div className="benefit-item">
              <CheckCircle size={14} />
              <span>安全验证</span>
            </div>
            <div className="benefit-item">
              <CheckCircle size={14} />
              <span>找回密码</span>
            </div>
          </div>
          <button
            type="button"
            className="submit-button"
            onClick={() => onSetEditingPhone(true)}
          >
            <Phone size={18} />
            <span>换绑手机号</span>
          </button>
        </div>
      </div>
    );
  }

  const isRebind = !!user?.phone;

  return (
    <div className="tab-content animate-fade-in">
      {/* 错误提示由父组件统一显示 */}
      {isRebind && phoneStep === 'verifyOld' ? (
        <form
          onSubmit={onVerifyOldPhone}
          className="phone-form"
        >
          <div className="verify-notice">
            <AlertCircle size={16} />
            <span>请先验证原手机号</span>
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
                value={phoneForm.code}
                onChange={onPhoneChange}
                onFocus={() => onFocusField('code')}
                onBlur={() => onFocusField(null)}
                placeholder="请输入 6 位验证码"
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
              onClick={() => {
                onSetEditingPhone(false);
              }}
            >
              取消
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
                  <span>确认验证</span>
                </>
              )}
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={
            phoneStep === 'verifyNew'
              ? isRebind
                ? onRebindPhone
                : onBindPhone
              : ((() => {}) as any)
          }
          className="phone-form"
        >
          {!isRebind && (
            <div className="info-text">
              绑定手机号后，可以使用手机号快捷登录
            </div>
          )}

          {isRebind && phoneStep === 'inputNew' && (
            <div className="verify-success">
              <CheckCircle size={16} />
              <span>原手机号验证成功，请输入新手机号</span>
            </div>
          )}

          <div
            className={`input-group ${focusedField === 'phone' ? 'focused' : ''}`}
          >
            <label className="input-label">
              <Phone size={14} />
              {isRebind && phoneStep === 'verifyNew' ? '新手机号' : '手机号'}
            </label>
            <div className="input-wrapper has-button">
              <input
                type="text"
                name="phone"
                value={phoneForm.phone}
                onChange={onPhoneChange}
                onFocus={() => onFocusField('phone')}
                onBlur={() => onFocusField(null)}
                placeholder="请输入手机号"
                maxLength={11}
                pattern="^1[3-9]\d{9}$"
                title="请输入正确的手机号"
                required
              />
              <button
                type="button"
                className="send-code-button"
                disabled={countdown > 0 || sendingCode}
                onClick={isRebind ? onSendNewPhoneCode : onSendPhoneCode}
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

          {phoneStep === 'verifyNew' && (
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
                  value={phoneForm.code}
                  onChange={onPhoneChange}
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
              onClick={() => {
                if (isRebind) {
                  onSetEditingPhone(false);
                }
              }}
            >
              {isRebind ? '取消' : '返回'}
            </button>
            {phoneStep === 'verifyNew' && (
              <button
                type="submit"
                disabled={loading}
                className="submit-button"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>{isRebind ? '换绑中...' : '绑定中...'}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    <span>{isRebind ? '确认换绑' : '确认绑定'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
};
