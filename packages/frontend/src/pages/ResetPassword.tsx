import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useBrandConfig } from '../contexts/BrandContext';
import { useTheme } from '../contexts/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { InteractiveBackground } from '../components/InteractiveBackground';
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from './ResetPassword/resetPasswordSchema';
import { useResetPassword } from './ResetPassword/useResetPassword';

// Lucide 图标
import { Mail } from 'lucide-react';
import { Lock } from 'lucide-react';
import { KeyRound } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { CheckCircle } from 'lucide-react';
import { Eye } from 'lucide-react';
import { EyeOff } from 'lucide-react';
import { Phone } from 'lucide-react';
import { Cpu } from 'lucide-react';
import { Boxes } from 'lucide-react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface LocationState {
  email?: string;
  phone?: string;
}

/**
 * 重置密码页面 - CloudCAD
 *
 * 设计特色：
 * - 居中卡片布局
 * - 统一渐变网格背景
 * - 玻璃态效果
 * - 密码可见性切换
 * - 支持邮箱/手机号两种方式
 * - 完美主题适配
 */
export const ResetPassword: React.FC = () => {
  useDocumentTitle('重置密码');
  const navigate = useNavigate();
  const location = useLocation();
  const { config: brandConfig } = useBrandConfig();
  const { isDark } = useTheme();

  const appName = brandConfig?.title || 'CloudCAD';
  const appLogo = brandConfig?.logo || '/logo.png';

  const emailFromState = (location.state as LocationState)?.email || '';
  const phoneFromState = (location.state as LocationState)?.phone || '';
  const contactType = emailFromState ? 'email' : 'phone';

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const resetPassword = useResetPassword();
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit: rhfSubmit,
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      code: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: ResetPasswordValues) => {
    const ok = await resetPassword.submit({
      email: emailFromState || undefined,
      phone: phoneFromState || undefined,
      code: data.code,
      newPassword: data.newPassword,
      confirmPassword: data.confirmPassword,
    });

    if (ok) {
      setSuccess(true);
      setTimeout(() => {
        navigate('/login', {
          state: { message: '密码重置成功，请使用新密码登录' },
        });
      }, 2000);
    }
  };

  // 重置成功状态
  if (success) {
    return (
      <div className="auth-page" data-theme={isDark ? 'dark' : 'light'}>
        <InteractiveBackground />

        <div className="theme-toggle-wrapper" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* <LanguageSwitcher /> */}
          <ThemeToggle />
        </div>

        <div className="auth-container">
          <div className="auth-card">
            <div className="success-content">
              <div className="success-icon">
                <CheckCircle size={32} />
              </div>
              <h2 className="success-title">密码重置成功！</h2>
              <p className="success-subtitle">即将自动跳转到登录页...</p>
            </div>
          </div>
        </div>

        <style>{`
          .auth-page { min-height: 100vh; display: flex; position: relative; overflow: hidden; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: transparent; }
          .theme-toggle-wrapper { position: fixed; top: 1.5rem; right: 1.5rem; z-index: 100; }
          .auth-container { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; position: relative; z-index: 1; min-height: 100vh; }
          .auth-card { width: 100%; max-width: 420px; background: var(--bg-secondary); border: 1px solid var(--border-default); border-radius: 24px; padding: 2.5rem; box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.05) inset; animation: card-appear 0.6s ease-out; }
          @keyframes card-appear { from { opacity: 0; transform: translateY(30px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
          .success-content { text-align: center; padding: 2rem 0; }
          .success-icon { width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #22c55e, #16a34a); display: flex; align-items: center; justify-content: center; color: white; margin: 0 auto 1.5rem; box-shadow: 0 10px 30px rgba(34, 197, 94, 0.3); animation: scale-in 0.5s ease-out; }
          @keyframes scale-in { from { transform: scale(0); } to { transform: scale(1); } }
          .success-title { font-size: var(--text-3xl); font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; }
          .success-subtitle { font-size: var(--text-md); color: var(--text-tertiary); }
          [data-theme="dark"] .auth-card { background: rgba(26, 29, 33, 0.9); backdrop-filter: blur(20px); box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset; }
          @media (max-width: 480px) { .auth-container { padding: 1rem; } .auth-card { padding: 1.75rem; border-radius: 20px; } }
        `}</style>
      </div>
    );
  }

  return (
    <div className="auth-page" data-theme={isDark ? 'dark' : 'light'}>
      <InteractiveBackground />

      <div className="theme-toggle-wrapper">
        <ThemeToggle />
      </div>

      <div className="auth-container">
        <div className="auth-card">
          {/* Logo */}
          <div className="logo-section">
            <div className="logo-wrapper">
              <div className="logo-glow" />
              <img src={appLogo} alt={appName} className="logo-image" />
            </div>
            <h1 className="app-title">{appName}</h1>
            <p className="app-tagline">重置您的账户密码</p>
          </div>

          {/* 表单头部 */}
          <div className="form-header">
            <h2 className="form-title">设置新密码</h2>
            <p className="form-subtitle">请输入验证码和新密码</p>
          </div>

          {/* 错误提示 */}
          {resetPassword.error && (
            <div className="alert alert-error">
              <AlertCircle size={18} className="alert-icon" />
              <span>{resetPassword.error}</span>
            </div>
          )}

          {/* 表单 */}
          <form className="auth-form" onSubmit={rhfSubmit(onSubmit)}>
            {contactType === 'email' ? (
              <div className="input-group">
                <label htmlFor="email" className="input-label">
                  邮箱地址
                </label>
                <div className="input-wrapper">
                  <Mail size={18} className="input-icon" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className="input-field"
                    placeholder="请输入邮箱地址"
                    value={emailFromState}
                    readOnly
                  />
                  <div className="input-glow" />
                </div>
              </div>
            ) : (
              <div className="input-group">
                <label htmlFor="phone" className="input-label">
                  手机号码
                </label>
                <div className="input-wrapper">
                  <Phone size={18} className="input-icon" />
                  <input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    className="input-field"
                    placeholder="请输入手机号码"
                    value={phoneFromState}
                    readOnly
                  />
                  <div className="input-glow" />
                </div>
              </div>
            )}

            <div className="input-group">
              <label htmlFor="code" className="input-label">
                验证码
              </label>
              <div className="input-wrapper">
                <KeyRound size={18} className="input-icon" />
                <input
                  id="code"
                  type="text"
                  maxLength={6}
                  className="input-field"
                  placeholder="请输入6位验证码"
                  {...register('code')}
                />
                <div className="input-glow" />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="newPassword" className="input-label">
                新密码
              </label>
              <div className="input-wrapper">
                <Lock size={18} className="input-icon" />
                <input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="input-field"
                  placeholder="新密码（至少8个字符）"
                  {...register('newPassword')}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="absolute right-4"
                  icon={showPassword ? EyeOff : Eye}
                  onClick={() => setShowPassword(!showPassword)}
                />
                <div className="input-glow" />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="confirmPassword" className="input-label">
                确认新密码
              </label>
              <div className="input-wrapper">
                <Lock size={18} className="input-icon" />
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="input-field"
                  placeholder="请再次输入新密码"
                  {...register('confirmPassword')}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="absolute right-4"
                  icon={showConfirmPassword ? EyeOff : Eye}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                />
                <div className="input-glow" />
              </div>
            </div>

            <Button type="submit" variant="primary" size="lg" loading={resetPassword.loading} icon={ArrowRight}>
              重置密码
            </Button>
          </form>

          {/* 返回登录 */}
          <div className="form-footer">
            <Button variant="secondary" size="lg" icon={ArrowLeft} onClick={() => navigate('/login')}>
              返回登录
            </Button>
          </div>

          {/* 特性图标 */}
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
        </div>

        <p className="copyright">© 2026 {appName}. All rights reserved.</p>
      </div>

      <style>{`
        .auth-page { min-height: 100vh; display: flex; position: relative; overflow: hidden; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: transparent; }
        .theme-toggle-wrapper { position: fixed; top: 1.5rem; right: 1.5rem; z-index: 100; }
        .auth-container { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; position: relative; z-index: 1; min-height: 100vh; }
        .auth-card { width: 100%; max-width: 420px; background: var(--bg-secondary); border: 1px solid var(--border-default); border-radius: 24px; padding: 2.5rem; box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.05) inset; animation: card-appear 0.6s ease-out; }
        @keyframes card-appear { from { opacity: 0; transform: translateY(30px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .logo-section { text-align: center; margin-bottom: 1.5rem; }
        .logo-wrapper { position: relative; width: 72px; height: 72px; margin: 0 auto 1rem; }
        .logo-glow { position: absolute; inset: -8px; background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); border-radius: 50%; opacity: 0.3; filter: blur(20px); animation: logo-glow-pulse 3s ease-in-out infinite; }
        @keyframes logo-glow-pulse { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.1); } }
        .logo-image { position: relative; width: 100%; height: 100%; object-fit: contain; border-radius: 16px; z-index: 1; animation: logo-float 3s ease-in-out infinite; }
        @keyframes logo-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        .app-title { font-size: var(--text-3xl); font-weight: 700; background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: -0.02em; margin-bottom: 0.375rem; }
        .app-tagline { font-size: var(--text-md); color: var(--text-tertiary); font-weight: 400; }
        .form-header { text-align: center; margin-bottom: 1.5rem; }
        .form-title { font-size: var(--text-2xl); font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem; }
        .form-subtitle { font-size: var(--text-md); color: var(--text-tertiary); }
        .alert { display: flex; align-items: center; gap: 0.75rem; padding: 0.875rem 1rem; border-radius: 10px; margin-bottom: 1.25rem; font-size: var(--text-md); animation: slide-up 0.3s ease-out; }
        .alert-error { background: var(--error-dim); border: 1px solid var(--error); color: var(--error); }
        .alert-icon { flex-shrink: 0; }
        @keyframes slide-up { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .auth-form { display: flex; flex-direction: column; gap: 1.25rem; }
        .input-group { display: flex; flex-direction: column; gap: 0.5rem; }
        .input-label { font-size: var(--text-base); font-weight: 500; color: var(--text-secondary); }
        .input-wrapper { position: relative; display: flex; align-items: center; }
        .input-icon { position: absolute; left: 1rem; color: var(--text-muted); z-index: 2; }
        .input-field { width: 100%; padding: 0.875rem 2.75rem; background: var(--bg-primary); border: 1px solid var(--border-default); border-radius: 12px; color: var(--text-primary); font-size: var(--text-md); transition: all 0.2s; outline: none; }
        .input-field::placeholder { color: var(--text-muted); }
        .input-field:hover { border-color: var(--border-strong); }
        .input-field:focus { border-color: var(--primary-500); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); }
        .input-glow { position: absolute; inset: -2px; border-radius: 14px; background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); opacity: 0; z-index: -1; transition: opacity 0.3s; filter: blur(8px); }
        .input-wrapper:focus-within .input-glow { opacity: 0.3; }
        .button-arrow { transition: transform 0.2s; }
        .form-footer { margin-top: 1.5rem; text-align: center; padding-top: 1.5rem; border-top: 1px solid var(--border-subtle); }
        .back-link { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--text-tertiary); background: none; border: none; font-size: var(--text-md); cursor: pointer; transition: color 0.2s; }
        .back-link:hover { color: var(--primary-500); }
        .features-bar { display: flex; justify-content: center; gap: 1rem; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-subtle); }
        .feature-dot { position: relative; width: 32px; height: 32px; border-radius: 50%; background: var(--bg-tertiary); border: 1px solid var(--border-default); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary); transition: all 0.2s; cursor: pointer; }
        .feature-dot:hover { background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); border-color: transparent; color: white; transform: translateY(-2px); }
        .feature-dot::before { content: attr(data-tooltip); position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%) scale(0.9); padding: 0.375rem 0.625rem; background: var(--bg-elevated); border: 1px solid var(--border-default); border-radius: 6px; font-size: var(--text-xs); font-weight: 500; color: var(--text-secondary); white-space: nowrap; opacity: 0; visibility: hidden; transition: all 0.2s ease; box-shadow: var(--shadow-md); z-index: 10; }
        .feature-dot::after { content: ''; position: absolute; bottom: calc(100% + 3px); left: 50%; transform: translateX(-50%) scale(0.9); border: 4px solid transparent; border-top-color: var(--border-default); opacity: 0; visibility: hidden; transition: all 0.2s ease; z-index: 10; }
        .feature-dot:hover::before, .feature-dot:hover::after { opacity: 1; visibility: visible; transform: translateX(-50%) scale(1); }
        .copyright { margin-top: 2rem; font-size: var(--text-sm); color: var(--text-muted); }
        /* 隐藏浏览器自带的密码显示按钮 */
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear {
          display: none;
        }

        input[type="password"]::-webkit-credentials-auto-fill-button {
          visibility: hidden;
          display: none !important;
          pointer-events: none;
        }

        input[type="password"]::-webkit-textfield-decoration-container {
          display: none;
        }

        [data-theme="dark"] .auth-card { background: rgba(26, 29, 33, 0.9); backdrop-filter: blur(20px); box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset; }
        [data-theme="dark"] .input-field { background: var(--bg-primary); }
        @media (max-width: 480px) { .auth-container { padding: 1rem; } .auth-card { padding: 1.75rem; border-radius: 20px; } }
      `}</style>
    </div>
  );
};

export default ResetPassword;