import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/authApi';
import { useRuntimeConfig } from '../contexts/RuntimeConfigContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { APP_NAME } from '../constants/appConfig';
import { useTheme } from '../contexts/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { AuthBackground } from '../components/AuthBackground';
import type { ForgotPasswordResponseDto } from '../types/api-client';

// Lucide 图标
import MailIcon from 'lucide-react/dist/esm/icons/mail';
import ArrowLeftIcon from 'lucide-react/dist/esm/icons/arrow-left';
import ArrowRightIcon from 'lucide-react/dist/esm/icons/arrow-right';
import Loader2Icon from 'lucide-react/dist/esm/icons/loader-2';
import AlertCircleIcon from 'lucide-react/dist/esm/icons/alert-circle';
import CheckCircleIcon from 'lucide-react/dist/esm/icons/check-circle';
import PhoneIcon from 'lucide-react/dist/esm/icons/phone';
import CpuIcon from 'lucide-react/dist/esm/icons/cpu';
import BoxesIcon from 'lucide-react/dist/esm/icons/boxes';
import ShieldCheckIcon from 'lucide-react/dist/esm/icons/shield-check';

/**
 * 忘记密码页面 - CloudCAD
 * 
 * 设计特色：
 * - 居中卡片布局
 * - 统一渐变网格背景
 * - 玻璃态效果
 * - 多种状态页面（表单/成功/客服联系）
 * - 完美主题适配
 */
export const ForgotPassword: React.FC = () => {
  useDocumentTitle('忘记密码');
  const navigate = useNavigate();
  const { config: runtimeConfig } = useRuntimeConfig();
  const { isDark } = useTheme();
  
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [supportInfo, setSupportInfo] = useState<{
    supportEmail?: string;
    supportPhone?: string;
  } | null>(null);

  const mailEnabled = runtimeConfig.mailEnabled;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await authApi.forgotPassword(email);
      const data = response.data as unknown as ForgotPasswordResponseDto;
      
      if (data.mailEnabled === false) {
        setSupportInfo({
          supportEmail: data.supportEmail ?? undefined,
          supportPhone: data.supportPhone ?? undefined,
        });
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '发送验证码失败，请稍后重试'
      );
    } finally {
      setLoading(false);
    }
  };

  // 邮件服务未启用 - 客服联系页面
  if (supportInfo) {
    return (
      <div className="auth-page" data-theme={isDark ? 'dark' : 'light'}>
        <AuthBackground />

        <div className="theme-toggle-wrapper">
          <ThemeToggle />
        </div>

        <div className="auth-container">
          <div className="auth-card">
            {/* Logo */}
            <div className="logo-section">
              <div className="logo-wrapper">
                <div className="logo-glow" />
                <img src="/logo.png" alt={APP_NAME} className="logo-image" />
              </div>
              <h1 className="app-title">{APP_NAME}</h1>
            </div>

            {/* 客服联系内容 */}
            <div className="support-content">
              <div className="support-icon">
                <PhoneIcon size={28} />
              </div>
              <h2 className="support-title">邮件服务未启用</h2>
              <p className="support-subtitle">
                无法通过邮件重置密码，请联系客服
              </p>

              <div className="support-card">
                <h3 className="support-card-title">客服联系方式</h3>
                <div className="support-list">
                  {supportInfo.supportEmail && (
                    <a 
                      href={`mailto:${supportInfo.supportEmail}`}
                      className="support-item"
                    >
                      <MailIcon size={18} />
                      <span>{supportInfo.supportEmail}</span>
                    </a>
                  )}
                  {supportInfo.supportPhone && (
                    <a 
                      href={`tel:${supportInfo.supportPhone}`}
                      className="support-item"
                    >
                      <PhoneIcon size={18} />
                      <span>{supportInfo.supportPhone}</span>
                    </a>
                  )}
                  {!supportInfo.supportEmail && !supportInfo.supportPhone && (
                    <p className="support-empty">暂无客服联系方式，请联系系统管理员</p>
                  )}
                </div>
              </div>

              <button
                onClick={() => navigate('/login')}
                className="back-button"
              >
                <ArrowLeftIcon size={18} />
                <span>返回登录</span>
              </button>
            </div>
          </div>
          <p className="copyright">© 2026 {APP_NAME}. All rights reserved.</p>
        </div>

        <style>{`
          .auth-page { min-height: 100vh; display: flex; position: relative; overflow: hidden; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg-primary); }
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
          .app-title { font-size: 1.5rem; font-weight: 700; background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: -0.02em; }
          .support-content { text-align: center; }
          .support-icon { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b, #d97706); display: flex; align-items: center; justify-content: center; color: white; margin: 0 auto 1.5rem; box-shadow: 0 8px 20px rgba(245, 158, 11, 0.3); }
          .support-title { font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; }
          .support-subtitle { font-size: 0.875rem; color: var(--text-tertiary); margin-bottom: 1.5rem; }
          .support-card { background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 16px; padding: 1.5rem; margin-bottom: 1.5rem; }
          .support-card-title { font-size: 0.9375rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 1rem; text-align: left; }
          .support-list { display: flex; flex-direction: column; gap: 0.75rem; }
          .support-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: var(--bg-secondary); border: 1px solid var(--border-default); border-radius: 10px; color: var(--primary-500); text-decoration: none; transition: all 0.2s; }
          .support-item:hover { background: var(--bg-elevated); border-color: var(--border-strong); transform: translateX(4px); }
          .support-empty { color: var(--text-muted); font-size: 0.875rem; }
          .back-button { display: flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; padding: 0.875rem 1.5rem; background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 12px; color: var(--text-secondary); font-size: 0.9375rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
          .back-button:hover { background: var(--bg-elevated); border-color: var(--border-strong); }
          .copyright { margin-top: 2rem; font-size: 0.75rem; color: var(--text-muted); }
          [data-theme="dark"] .auth-card { background: rgba(26, 29, 33, 0.9); backdrop-filter: blur(20px); box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset; }
          @media (max-width: 480px) { .auth-container { padding: 1rem; } .auth-card { padding: 1.75rem; border-radius: 20px; } }
        `}</style>
      </div>
    );
  }

  // 发送成功状态
  if (success) {
    return (
      <div className="auth-page" data-theme={isDark ? 'dark' : 'light'}>
        <AuthBackground />

        <div className="theme-toggle-wrapper">
          <ThemeToggle />
        </div>

        <div className="auth-container">
          <div className="auth-card">
            {/* Logo */}
            <div className="logo-section">
              <div className="logo-wrapper">
                <div className="logo-glow" />
                <img src="/logo.png" alt={APP_NAME} className="logo-image" />
              </div>
              <h1 className="app-title">{APP_NAME}</h1>
            </div>

            {/* 成功内容 */}
            <div className="success-content">
              <div className="success-icon">
                <CheckCircleIcon size={32} />
              </div>
              <h2 className="success-title">验证码已发送</h2>
              <p className="success-subtitle">
                我们已向 <span className="success-email">{email}</span> 发送了验证码
              </p>

              <div className="success-card">
                <div className="success-tip">
                  <AlertCircleIcon size={16} />
                  <span>请查收邮件并使用验证码重置密码</span>
                </div>
              </div>

              <div className="button-group">
                <button
                  onClick={() => navigate('/reset-password', { state: { email } })}
                  className="primary-button"
                >
                  <span>前往重置密码</span>
                  <ArrowRightIcon size={18} />
                </button>

                <button
                  onClick={() => navigate('/login')}
                  className="secondary-button"
                >
                  <ArrowLeftIcon size={18} />
                  <span>返回登录</span>
                </button>
              </div>
            </div>

            {/* 特性图标 */}
            <div className="features-bar">
              <div className="feature-dot" data-tooltip="高性能 CAD 在线预览">
                <CpuIcon size={14} />
              </div>
              <div className="feature-dot" data-tooltip="多用户实时协同编辑">
                <BoxesIcon size={14} />
              </div>
              <div className="feature-dot" data-tooltip="企业级数据安全保障">
                <ShieldCheckIcon size={14} />
              </div>
            </div>
          </div>
          <p className="copyright">© 2026 {APP_NAME}. All rights reserved.</p>
        </div>

        <style>{`
          .auth-page { min-height: 100vh; display: flex; position: relative; overflow: hidden; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg-primary); }
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
          .app-title { font-size: 1.5rem; font-weight: 700; background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: -0.02em; }
          .success-content { text-align: center; }
          .success-icon { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #22c55e, #16a34a); display: flex; align-items: center; justify-content: center; color: white; margin: 0 auto 1.5rem; box-shadow: 0 8px 20px rgba(34, 197, 94, 0.3); }
          .success-title { font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; }
          .success-subtitle { font-size: 0.875rem; color: var(--text-tertiary); margin-bottom: 1.5rem; }
          .success-email { font-weight: 600; color: var(--primary-500); }
          .success-card { background: var(--success-dim); border: 1px solid var(--success); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; }
          .success-tip { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--success); }
          .button-group { display: flex; flex-direction: column; gap: 0.75rem; }
          .primary-button { display: flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; padding: 0.875rem 1.5rem; background: linear-gradient(135deg, var(--primary-600), var(--accent-600)); border: none; border-radius: 12px; color: white; font-size: 0.9375rem; font-weight: 600; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3); }
          .primary-button:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(99, 102, 241, 0.4); }
          .secondary-button { display: flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; padding: 0.875rem 1.5rem; background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 12px; color: var(--text-secondary); font-size: 0.9375rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
          .secondary-button:hover { background: var(--bg-elevated); border-color: var(--border-strong); }
          .features-bar { display: flex; justify-content: center; gap: 1rem; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-subtle); }
          .feature-dot { position: relative; width: 32px; height: 32px; border-radius: 50%; background: var(--bg-tertiary); border: 1px solid var(--border-default); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary); transition: all 0.2s; cursor: pointer; }
          .feature-dot:hover { background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); border-color: transparent; color: white; transform: translateY(-2px); }
          .feature-dot::before { content: attr(data-tooltip); position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%) scale(0.9); padding: 0.375rem 0.625rem; background: var(--bg-elevated); border: 1px solid var(--border-default); border-radius: 6px; font-size: 0.6875rem; font-weight: 500; color: var(--text-secondary); white-space: nowrap; opacity: 0; visibility: hidden; transition: all 0.2s ease; box-shadow: var(--shadow-md); z-index: 10; }
          .feature-dot::after { content: ''; position: absolute; bottom: calc(100% + 3px); left: 50%; transform: translateX(-50%) scale(0.9); border: 4px solid transparent; border-top-color: var(--border-default); opacity: 0; visibility: hidden; transition: all 0.2s ease; z-index: 10; }
          .feature-dot:hover::before, .feature-dot:hover::after { opacity: 1; visibility: visible; transform: translateX(-50%) scale(1); }
          .copyright { margin-top: 2rem; font-size: 0.75rem; color: var(--text-muted); }
          [data-theme="dark"] .auth-card { background: rgba(26, 29, 33, 0.9); backdrop-filter: blur(20px); box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset; }
          @media (max-width: 480px) { .auth-container { padding: 1rem; } .auth-card { padding: 1.75rem; border-radius: 20px; } }
        `}</style>
      </div>
    );
  }

  // 默认表单状态
  return (
    <div className="auth-page" data-theme={isDark ? 'dark' : 'light'}>
      <AuthBackground />

      <div className="theme-toggle-wrapper">
        <ThemeToggle />
      </div>

      <div className="auth-container">
        <div className="auth-card">
          {/* Logo */}
          <div className="logo-section">
            <div className="logo-wrapper">
              <div className="logo-glow" />
              <img src="/logo.png" alt={APP_NAME} className="logo-image" />
            </div>
            <h1 className="app-title">{APP_NAME}</h1>
            <p className="app-tagline">找回您的账户密码</p>
          </div>

          {/* 表单头部 */}
          <div className="form-header">
            <h2 className="form-title">忘记密码</h2>
            <p className="form-subtitle">输入邮箱接收验证码</p>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="alert alert-error">
              <AlertCircleIcon size={18} className="alert-icon" />
              <span>{error}</span>
            </div>
          )}

          {/* 表单 */}
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <label htmlFor="email" className="input-label">邮箱地址</label>
              <div className="input-wrapper">
                <MailIcon size={18} className="input-icon" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="input-field"
                  placeholder="请输入邮箱地址"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <div className="input-glow" />
              </div>
            </div>

            <button type="submit" disabled={loading} className="submit-button">
              {loading ? (
                <>
                  <Loader2Icon size={18} className="animate-spin" />
                  <span>发送中...</span>
                </>
              ) : (
                <>
                  <span>发送验证码</span>
                  <ArrowRightIcon size={18} className="button-arrow" />
                </>
              )}
            </button>
          </form>

          {/* 返回登录 */}
          <div className="form-footer">
            <button onClick={() => navigate('/login')} className="back-link">
              <ArrowLeftIcon size={16} />
              <span>返回登录</span>
            </button>
          </div>

          {/* 特性图标 */}
          <div className="features-bar">
            <div className="feature-dot" data-tooltip="高性能 CAD 在线预览">
              <CpuIcon size={14} />
            </div>
            <div className="feature-dot" data-tooltip="多用户实时协同编辑">
              <BoxesIcon size={14} />
            </div>
            <div className="feature-dot" data-tooltip="企业级数据安全保障">
              <ShieldCheckIcon size={14} />
            </div>
          </div>
        </div>

        <p className="copyright">© 2026 {APP_NAME}. All rights reserved.</p>
      </div>

      <style>{`
        .auth-page { min-height: 100vh; display: flex; position: relative; overflow: hidden; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg-primary); }
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
        .app-title { font-size: 1.5rem; font-weight: 700; background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: -0.02em; margin-bottom: 0.375rem; }
        .app-tagline { font-size: 0.875rem; color: var(--text-tertiary); font-weight: 400; }
        .form-header { text-align: center; margin-bottom: 1.5rem; }
        .form-title { font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem; }
        .form-subtitle { font-size: 0.875rem; color: var(--text-tertiary); }
        .alert { display: flex; align-items: center; gap: 0.75rem; padding: 0.875rem 1rem; border-radius: 10px; margin-bottom: 1.25rem; font-size: 0.875rem; animation: slide-up 0.3s ease-out; }
        .alert-error { background: var(--error-dim); border: 1px solid var(--error); color: var(--error); }
        .alert-icon { flex-shrink: 0; }
        @keyframes slide-up { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .auth-form { display: flex; flex-direction: column; gap: 1.25rem; }
        .input-group { display: flex; flex-direction: column; gap: 0.5rem; }
        .input-label { font-size: 0.8125rem; font-weight: 500; color: var(--text-secondary); }
        .input-wrapper { position: relative; display: flex; align-items: center; }
        .input-icon { position: absolute; left: 1rem; color: var(--text-muted); z-index: 2; }
        .input-field { width: 100%; padding: 0.875rem 1rem 0.875rem 2.75rem; background: var(--bg-primary); border: 1px solid var(--border-default); border-radius: 12px; color: var(--text-primary); font-size: 0.9375rem; transition: all 0.2s; outline: none; }
        .input-field::placeholder { color: var(--text-muted); }
        .input-field:hover { border-color: var(--border-strong); }
        .input-field:focus { border-color: var(--primary-500); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); }
        .input-glow { position: absolute; inset: -2px; border-radius: 14px; background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); opacity: 0; z-index: -1; transition: opacity 0.3s; filter: blur(8px); }
        .input-wrapper:focus-within .input-glow { opacity: 0.3; }
        .submit-button { display: flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; padding: 0.875rem 1.5rem; background: linear-gradient(135deg, var(--primary-600), var(--accent-600)); border: none; border-radius: 12px; color: white; font-size: 0.9375rem; font-weight: 600; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3); }
        .submit-button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(99, 102, 241, 0.4); }
        .submit-button:disabled { opacity: 0.7; cursor: not-allowed; }
        .button-arrow { transition: transform 0.2s; }
        .submit-button:hover:not(:disabled) .button-arrow { transform: translateX(4px); }
        .form-footer { margin-top: 1.5rem; text-align: center; padding-top: 1.5rem; border-top: 1px solid var(--border-subtle); }
        .back-link { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--text-tertiary); background: none; border: none; font-size: 0.875rem; cursor: pointer; transition: color 0.2s; }
        .back-link:hover { color: var(--primary-500); }
        .features-bar { display: flex; justify-content: center; gap: 1rem; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-subtle); }
        .feature-dot { position: relative; width: 32px; height: 32px; border-radius: 50%; background: var(--bg-tertiary); border: 1px solid var(--border-default); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary); transition: all 0.2s; cursor: pointer; }
        .feature-dot:hover { background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); border-color: transparent; color: white; transform: translateY(-2px); }
        .feature-dot::before { content: attr(data-tooltip); position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%) scale(0.9); padding: 0.375rem 0.625rem; background: var(--bg-elevated); border: 1px solid var(--border-default); border-radius: 6px; font-size: 0.6875rem; font-weight: 500; color: var(--text-secondary); white-space: nowrap; opacity: 0; visibility: hidden; transition: all 0.2s ease; box-shadow: var(--shadow-md); z-index: 10; }
        .feature-dot::after { content: ''; position: absolute; bottom: calc(100% + 3px); left: 50%; transform: translateX(-50%) scale(0.9); border: 4px solid transparent; border-top-color: var(--border-default); opacity: 0; visibility: hidden; transition: all 0.2s ease; z-index: 10; }
        .feature-dot:hover::before, .feature-dot:hover::after { opacity: 1; visibility: visible; transform: translateX(-50%) scale(1); }
        .copyright { margin-top: 2rem; font-size: 0.75rem; color: var(--text-muted); }
        [data-theme="dark"] .auth-card { background: rgba(26, 29, 33, 0.9); backdrop-filter: blur(20px); box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset; }
        [data-theme="dark"] .input-field { background: var(--bg-primary); }
        @media (max-width: 480px) { .auth-container { padding: 1rem; } .auth-card { padding: 1.75rem; border-radius: 20px; } }
      `}</style>
    </div>
  );
};

export default ForgotPassword;