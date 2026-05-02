import React from 'react';
import { Phone } from 'lucide-react';
import { Shield } from 'lucide-react';
import { CheckCircle } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { Send } from 'lucide-react';

interface PhoneForm {
  phone: string;
  code: string;
}

interface ProfilePhoneTabProps {
  phone?: string | null | undefined;
  phoneVerified?: boolean;
  phoneForm: PhoneForm;
  phoneStep: 'verifyOld' | 'inputNew' | 'verifyNew';
  isEditingPhone: boolean;
  loading: boolean;
  sendingCode: boolean;
  countdown: number;
  focusedField: string | null;
  setFocusedField: (field: string | null) => void;
  onPhoneChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSendPhoneCode: () => void;
  onSendUnbindCode: () => void;
  onVerifyOldPhone: (e: React.FormEvent) => void;
  onSendNewPhoneCode: () => void;
  onRebindPhone: (e: React.FormEvent) => void;
  onBindPhone: (e: React.FormEvent) => void;
  onSetIsEditingPhone: (value: boolean) => void;
  onSetPhoneStep: (step: 'verifyOld' | 'inputNew' | 'verifyNew') => void;
  onSetPhoneForm: (form: PhoneForm) => void;
}

export const ProfilePhoneTab: React.FC<ProfilePhoneTabProps> = ({
  phone,
  phoneForm,
  phoneStep,
  isEditingPhone,
  loading,
  sendingCode,
  countdown,
  focusedField,
  setFocusedField,
  onPhoneChange,
  onSendPhoneCode,
  onSendUnbindCode,
  onVerifyOldPhone,
  onSendNewPhoneCode,
  onRebindPhone,
  onBindPhone,
  onSetIsEditingPhone,
  onSetPhoneStep,
  onSetPhoneForm,
}) => {
  return (
    <div className="tab-content animate-fade-in">
      {phone && !isEditingPhone ? (
        <div className="phone-bound">
          <div className="success-icon">
            <CheckCircle size={48} />
          </div>
          <h3>手机号已绑定</h3>
          <p className="bound-phone">
            {phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}
          </p>
          <div className="benefits">
            <div className="benefit-item">
              <CheckCircle size={14} />
              <span>可用于验证码登录</span>
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
          <button
            type="button"
            className="submit-button"
            onClick={() => {
              onSetIsEditingPhone(true);
              onSetPhoneStep('verifyOld');
              onSetPhoneForm({ phone: '', code: '' });
            }}
          >
            <Phone size={18} />
            <span>换绑手机号</span>
          </button>
        </div>
      ) : (
        <div className="email-form">
          {phoneStep === 'verifyOld' && !phone && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSendPhoneCode();
              }}
            >
              <div
                className={`input-group ${focusedField === 'phone' ? 'focused' : ''}`}
              >
                <label className="input-label">
                  <Phone size={14} />
                  手机号
                </label>
                <div className="input-wrapper">
                  <input
                    type="tel"
                    name="phone"
                    value={phoneForm.phone}
                    onChange={onPhoneChange}
                    onFocus={() => setFocusedField('phone')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="请输入手机号"
                    maxLength={11}
                    required
                  />
                  <div className="input-glow" />
                </div>
              </div>
              <button
                type="submit"
                disabled={
                  loading || sendingCode || phoneForm.phone.length !== 11
                }
                className="submit-button"
              >
                {loading || sendingCode ? (
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
          )}

          {phoneStep === 'verifyOld' && phone && (
            <form onSubmit={onVerifyOldPhone}>
              <div className="email-preview">
                <Phone size={20} />
                <span>{phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}</span>
              </div>
              <div
                className={`input-group ${focusedField === 'code' ? 'focused' : ''}`}
              >
                <label className="input-label">
                  <Shield size={14} />
                  验证码
                </label>
                <div className="input-wrapper has-button">
                  <input
                    type="text"
                    name="code"
                    value={phoneForm.code}
                    onChange={onPhoneChange}
                    onFocus={() => setFocusedField('code')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="请输入 6 位验证码"
                    maxLength={6}
                    required
                    className="has-button"
                  />
                  <button
                    type="button"
                    className="code-button"
                    onClick={onSendUnbindCode}
                    disabled={countdown > 0 || sendingCode}
                  >
                    {sendingCode ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : countdown > 0 ? (
                      `${countdown}s`
                    ) : (
                      '重新获取'
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
                    onSetIsEditingPhone(false);
                    onSetPhoneForm({ phone: '', code: '' });
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
                      <span>验证原手机号</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {phoneStep === 'inputNew' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSendNewPhoneCode();
              }}
            >
              <div className="info-text">原手机号验证通过，请输入新手机号</div>
              <div
                className={`input-group ${focusedField === 'phone' ? 'focused' : ''}`}
              >
                <label className="input-label">
                  <Phone size={14} />
                  新手机号
                </label>
                <div className="input-wrapper">
                  <input
                    type="tel"
                    name="phone"
                    value={phoneForm.phone}
                    onChange={onPhoneChange}
                    onFocus={() => setFocusedField('phone')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="请输入新手机号"
                    maxLength={11}
                    required
                  />
                  <div className="input-glow" />
                </div>
              </div>
              <button
                type="submit"
                disabled={
                  loading || sendingCode || phoneForm.phone.length !== 11
                }
                className="submit-button"
              >
                {loading || sendingCode ? (
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
          )}

          {phoneStep === 'verifyNew' && (
            <form onSubmit={phone ? onRebindPhone : onBindPhone}>
              <div className="email-preview">
                <Phone size={20} />
                <span>
                  {phoneForm.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}
                </span>
              </div>
              <div
                className={`input-group ${focusedField === 'code' ? 'focused' : ''}`}
              >
                <label className="input-label">
                  <Shield size={14} />
                  验证码
                </label>
                <div className="input-wrapper has-button">
                  <input
                    type="text"
                    name="code"
                    value={phoneForm.code}
                    onChange={onPhoneChange}
                    onFocus={() => setFocusedField('code')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="请输入6位验证码"
                    maxLength={6}
                    required
                    className="has-button"
                  />
                  <button
                    type="button"
                    className="code-button"
                    onClick={phone ? onSendNewPhoneCode : onSendPhoneCode}
                    disabled={countdown > 0 || sendingCode}
                  >
                    {sendingCode ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : countdown > 0 ? (
                      `${countdown}s`
                    ) : (
                      '重新获取'
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
                    onSetPhoneStep(phone ? 'inputNew' : 'verifyOld');
                    onSetPhoneForm({ phone: '', code: '' });
                  }}
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
                      <span>{phone ? '换绑中...' : '绑定中...'}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={18} />
                      <span>{phone ? '确认换绑' : '确认绑定'}</span>
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
