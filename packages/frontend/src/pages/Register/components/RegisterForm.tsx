import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRegisterForm } from '../hooks/useRegisterForm';
import type { UseRegisterFormReturn } from '../hooks/useRegisterForm';
import { usePhoneVerification } from '../hooks/usePhoneVerification';
import { getPasswordStrength } from '../utils/passwordStrength';
import { handleError } from '@/utils/errorHandler';

import {
  User, Mail, Lock, Sparkles, ArrowRight, ArrowLeft,
  Loader2, AlertCircle, CheckCircle, ShieldCheck,
  Cpu, Boxes, Eye, EyeOff, Phone, MessageSquare,
} from 'lucide-react';

interface RegisterFormProps {
  mailEnabled: boolean;
  requireEmailVerification: boolean;
  smsEnabled: boolean;
  requirePhoneVerification: boolean;
  isWechatRegister: boolean;
  wechatTempToken: string | null;
  prefillPhone: string;
  prefillCode: string;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({
  mailEnabled,
  requireEmailVerification,
  smsEnabled,
  requirePhoneVerification,
  isWechatRegister,
  wechatTempToken,
  prefillPhone,
  prefillCode,
}) => {
  const navigate = useNavigate();

  const form = useRegisterForm({
    mailEnabled,
    requireEmailVerification,
    smsEnabled,
    requirePhoneVerification,
    isWechatRegister,
  });

  const phone = usePhoneVerification({ setFieldErrors: form.setFieldErrors });

  // Pre-fill phone from login redirect
  useEffect(() => {
    if (prefillPhone) {
      phone.setPhoneForm({ phone: prefillPhone, code: prefillCode || '' });
    }
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const passwordStrength = getPasswordStrength(form.formData.password);

  const onNext = () => {
    form.handleNext(phone.phoneForm);
  };

  const onSubmit = (e: React.FormEvent) => {
    form.handleSubmit(e, phone.phoneForm, wechatTempToken);
  };

  return (
    <>
      {/* Step indicator */}
      <div className="step-indicator">
        <div className={`step ${form.currentStep >= 1 ? 'active' : ''} ${form.currentStep > 1 ? 'completed' : ''}`}>
          <div className="step-number">
            {form.currentStep > 1 ? <CheckCircle size={16} /> : 1}
          </div>
          <span className="step-label">基本信息</span>
        </div>
        <div className="step-line" />
        <div className={`step ${form.currentStep >= 2 ? 'active' : ''}`}>
          <div className="step-number">2</div>
          <span className="step-label">安全设置</span>
        </div>
      </div>

      {/* Form header */}
      <div className="form-header">
        <h2 className="form-title">
          {form.currentStep === 1 ? '创建账户' : '设置密码'}
        </h2>
        <p className="form-subtitle">
          {form.currentStep === 1 ? '填写您的基本信息' : '设置安全密码以保护账户'}
        </p>
      </div>

      {/* Error alert */}
      {form.error && (
        <div className="alert alert-error">
          <AlertCircle size={18} className="alert-icon" />
          <span>{form.error}</span>
        </div>
      )}

      {/* Form */}
      <form className="register-form" onSubmit={onSubmit}>
        {/* Step 1: Basic info */}
        {form.currentStep === 1 && (
          <div className="form-step animate-fade-in">
            {/* Username */}
            <div className={`input-group ${form.focusedField === 'username' ? 'focused' : ''} ${form.fieldErrors.username ? 'error' : ''}`}>
              <label htmlFor="username" className="input-label">
                用户名 <span className="required">*</span>
              </label>
              <div className="input-wrapper">
                <User size={18} className={`input-icon ${form.focusedField === 'username' ? 'active' : ''}`} />
                <input
                  id="username" name="username" type="text" required
                  className="input-field" placeholder="请输入用户名"
                  value={form.formData.username}
                  onChange={form.handleChange}
                  onFocus={() => form.setFocusedField('username')}
                  onBlur={form.handleBlur}
                />
                <div className="input-glow" />
              </div>
              {form.fieldErrors.username && <p className="error-message">{form.fieldErrors.username}</p>}
            </div>

            {/* Nickname */}
            <div className={`input-group ${form.focusedField === 'nickname' ? 'focused' : ''} ${form.fieldErrors.nickname ? 'error' : ''}`}>
              <label htmlFor="nickname" className="input-label">昵称</label>
              <div className="input-wrapper">
                <Sparkles size={18} className={`input-icon ${form.focusedField === 'nickname' ? 'active' : ''}`} />
                <input
                  id="nickname" name="nickname" type="text"
                  className="input-field" placeholder="请输入昵称（可选）"
                  value={form.formData.nickname || ''}
                  onChange={form.handleChange}
                  onFocus={() => form.setFocusedField('nickname')}
                  onBlur={form.handleBlur}
                />
                <div className="input-glow" />
              </div>
              {form.fieldErrors.nickname && <p className="error-message">{form.fieldErrors.nickname}</p>}
            </div>

            {/* Email */}
            {mailEnabled && requireEmailVerification && (
              <div className={`input-group ${form.focusedField === 'email' ? 'focused' : ''} ${form.fieldErrors.email ? 'error' : ''}`}>
                <label htmlFor="email" className="input-label">
                  邮箱地址 {requireEmailVerification && <span className="required">*</span>}
                </label>
                <div className="input-wrapper">
                  <Mail size={18} className={`input-icon ${form.focusedField === 'email' ? 'active' : ''}`} />
                  <input
                    id="email" name="email" type="email" autoComplete="email"
                    required={requireEmailVerification} className="input-field"
                    placeholder="请输入邮箱地址"
                    value={form.formData.email}
                    onChange={form.handleChange}
                    onFocus={() => form.setFocusedField('email')}
                    onBlur={form.handleBlur}
                  />
                  <div className="input-glow" />
                </div>
                {form.fieldErrors.email && <p className="error-message">{form.fieldErrors.email}</p>}
              </div>
            )}

            {/* Phone + SMS code */}
            {smsEnabled && requirePhoneVerification && (
              <>
                <div className={`input-group ${form.focusedField === 'phone' ? 'focused' : ''} ${form.fieldErrors.phone ? 'error' : ''}`}>
                  <label htmlFor="phone" className="input-label">
                    手机号 {requirePhoneVerification && <span className="required">*</span>}
                  </label>
                  <div className="input-wrapper">
                    <Phone size={18} className={`input-icon ${form.focusedField === 'phone' ? 'active' : ''}`} />
                    <input
                      id="phone" name="phone" type="tel" autoComplete="tel"
                      required={requirePhoneVerification} maxLength={11}
                      className="input-field" placeholder="请输入手机号"
                      value={phone.phoneForm.phone}
                      onChange={phone.handlePhoneChange}
                      onFocus={() => form.setFocusedField('phone')}
                      onBlur={() => form.setFocusedField(null)}
                    />
                    <div className="input-glow" />
                  </div>
                  {form.fieldErrors.phone && <p className="error-message">{form.fieldErrors.phone}</p>}
                </div>

                <div className={`input-group ${form.focusedField === 'code' ? 'focused' : ''} ${form.fieldErrors.code ? 'error' : ''}`}>
                  <label htmlFor="code" className="input-label">
                    验证码 {requirePhoneVerification && <span className="required">*</span>}
                  </label>
                  <div className="input-wrapper has-button">
                    <MessageSquare size={18} className={`input-icon ${form.focusedField === 'code' ? 'active' : ''}`} />
                    <input
                      id="code" name="code" type="text" autoComplete="one-time-code"
                      required={requirePhoneVerification} maxLength={6}
                      className="input-field has-button" placeholder="请输入验证码"
                      value={phone.phoneForm.code}
                      onChange={phone.handlePhoneChange}
                      onFocus={() => form.setFocusedField('code')}
                      onBlur={() => form.setFocusedField(null)}
                    />
                    <button
                      type="button" className="code-button"
                      onClick={phone.handleSendCode}
                      disabled={phone.countdown > 0 || phone.sendingCode || phone.phoneForm.phone.length !== 11}
                    >
                      {phone.sendingCode ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : phone.countdown > 0 ? (
                        `${phone.countdown}s`
                      ) : (
                        '获取验证码'
                      )}
                    </button>
                    <div className="input-glow" />
                  </div>
                  {form.fieldErrors.code && <p className="error-message">{form.fieldErrors.code}</p>}
                </div>
              </>
            )}

            <button type="button" onClick={onNext} className="submit-button">
              <span>下一步</span>
              <ArrowRight size={18} className="button-arrow" />
            </button>
          </div>
        )}

        {/* Step 2: Password */}
        {form.currentStep === 2 && (
          <div className="form-step animate-fade-in">
            {/* Password */}
            <div className={`input-group ${form.focusedField === 'password' ? 'focused' : ''} ${form.fieldErrors.password ? 'error' : ''}`}>
              <label htmlFor="password" className="input-label">
                密码 <span className="required">*</span>
              </label>
              <div className="input-wrapper">
                <Lock size={18} className={`input-icon ${form.focusedField === 'password' ? 'active' : ''}`} />
                <input
                  id="password" name="password"
                  type={form.showPassword ? 'text' : 'password'}
                  autoComplete="new-password" required
                  className="input-field has-toggle"
                  placeholder="至少8位，包含大小写字母、数字和特殊字符"
                  value={form.formData.password}
                  onChange={form.handleChange}
                  onFocus={() => form.setFocusedField('password')}
                  onBlur={form.handleBlur}
                />
                <button
                  type="button" className="password-toggle"
                  onClick={() => form.setShowPassword(!form.showPassword)}
                  tabIndex={-1}
                >
                  {form.showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
                <div className="input-glow" />
              </div>
              {form.formData.password && (
                <div className="password-strength">
                  <div className="strength-bar">
                    <div
                      className="strength-fill"
                      style={{
                        width: `${(passwordStrength.strength / 4) * 100}%`,
                        background: passwordStrength.color,
                      }}
                    />
                  </div>
                  <span className="strength-label" style={{ color: passwordStrength.color }}>
                    {passwordStrength.label}
                  </span>
                </div>
              )}
              {form.fieldErrors.password && <p className="error-message">{form.fieldErrors.password}</p>}
            </div>

            {/* Confirm password */}
            <div className={`input-group ${form.focusedField === 'confirmPassword' ? 'focused' : ''} ${form.fieldErrors.confirmPassword ? 'error' : ''}`}>
              <label htmlFor="confirmPassword" className="input-label">
                确认密码 <span className="required">*</span>
              </label>
              <div className="input-wrapper">
                <CheckCircle size={18} className={`input-icon ${form.focusedField === 'confirmPassword' ? 'active' : ''}`} />
                <input
                  id="confirmPassword" name="confirmPassword"
                  type={form.showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password" required
                  className="input-field has-toggle"
                  placeholder="请再次输入密码"
                  value={form.confirmPassword}
                  onChange={form.handleChange}
                  onFocus={() => form.setFocusedField('confirmPassword')}
                  onBlur={form.handleBlur}
                />
                <button
                  type="button" className="password-toggle"
                  onClick={() => form.setShowConfirmPassword(!form.showConfirmPassword)}
                  tabIndex={-1}
                >
                  {form.showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
                <div className="input-glow" />
              </div>
              {form.fieldErrors.confirmPassword && <p className="error-message">{form.fieldErrors.confirmPassword}</p>}
            </div>

            <div className="button-group">
              <button type="button" onClick={form.handleBack} className="back-button-step">
                <ArrowLeft size={18} />
                <span>返回</span>
              </button>
              <button type="submit" disabled={form.loading} className="submit-button">
                {form.loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>注册中...</span>
                  </>
                ) : (
                  <>
                    <span>立即注册</span>
                    <ArrowRight size={18} className="button-arrow" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Login link */}
      <div className="form-footer">
        <p className="login-text">
          已有账户？
          <button onClick={() => navigate('/login')} className="login-link">
            立即登录
          </button>
        </p>
      </div>

      {/* Feature icons */}
      <div className="features-bar">
        <div className="feature-dot" data-tooltip="高性能 CAD 在线预览">
          <Cpu size={14} />
        </div>
        <div className="feature-dot" data-tooltip="多用户实时协同编辑">
          <Boxes size={14} />
        </div>
        <div className="feature-dot" data-tooltip="企业级数据安全保障">
          <ShieldCheck size={14} />
        </div>
      </div>
    </>
  );
};
