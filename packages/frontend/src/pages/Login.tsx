import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { APP_NAME } from '../constants/appConfig';
import { useTheme } from '../contexts/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { InteractiveBackground } from '../components/InteractiveBackground';
import type { LoginDto } from '../types/api-client';

// 导入 lucide 图标
import MailIcon from 'lucide-react/dist/esm/icons/mail';
import LockIcon from 'lucide-react/dist/esm/icons/lock';
import ArrowRightIcon from 'lucide-react/dist/esm/icons/arrow-right';
import Loader2Icon from 'lucide-react/dist/esm/icons/loader-2';
import CheckCircleIcon from 'lucide-react/dist/esm/icons/check-circle';
import AlertCircleIcon from 'lucide-react/dist/esm/icons/alert-circle';
import CpuIcon from 'lucide-react/dist/esm/icons/cpu';
import BoxesIcon from 'lucide-react/dist/esm/icons/boxes';
import ShieldCheckIcon from 'lucide-react/dist/esm/icons/shield-check';

interface LocationState {
  from?: string;
  message?: string;
}

/**
 * 登录页面 - CloudCAD
 * 
 * 设计特色：
 * - 居中卡片布局
 * - 统一渐变网格背景
 * - 玻璃态效果
 * - 流畅动画
 * - 完美主题适配
 */
export const Login: React.FC = () => {
  useDocumentTitle('登录');
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const { isDark } = useTheme();

  const [formData, setFormData] = useState<LoginDto>({
    account: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    const state = location.state as LocationState | null;
    if (state?.message) {
      setSuccess(state.message);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      const from = (location.state as LocationState)?.from || '/';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, location]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(formData.account, formData.password);
      navigate('/');
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '登录失败，请检查账号和密码'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page" data-theme={isDark ? 'dark' : 'light'}>
      {/* 交互式动态背景 - 带鼠标视差效果 */}
      <InteractiveBackground />

      {/* 主题切换按钮 */}
      <div className="theme-toggle-wrapper">
        <ThemeToggle />
      </div>

      {/* 居中内容 */}
      <div className="login-container">
        <div className="login-card">
          {/* Logo 区域 */}
          <div className="logo-section">
            <div className="logo-wrapper">
              <div className="logo-glow" />
              <img src="/logo.png" alt={APP_NAME} className="logo-image" />
            </div>
            <h1 className="app-title">{APP_NAME}</h1>
            <p className="app-tagline">专业云端 CAD 图纸管理平台</p>
          </div>

          {/* 表单头部 */}
          <div className="form-header">
            <h2 className="form-title">欢迎回来</h2>
            <p className="form-subtitle">登录您的账户以继续</p>
          </div>

          {/* 消息提示 */}
          {success && (
            <div className="alert alert-success">
              <CheckCircleIcon size={18} className="alert-icon" />
              <span>{success}</span>
            </div>
          )}

          {error && (
            <div className="alert alert-error">
              <AlertCircleIcon size={18} className="alert-icon" />
              <span>{error}</span>
            </div>
          )}

          {/* 登录表单 */}
          <form className="login-form" onSubmit={handleSubmit}>
            <div className={`input-group ${focusedField === 'account' ? 'focused' : ''}`}>
              <label htmlFor="account" className="input-label">邮箱或用户名</label>
              <div className="input-wrapper">
                <MailIcon 
                  size={18} 
                  className={`input-icon ${focusedField === 'account' ? 'active' : ''}`} 
                />
                <input
                  id="account"
                  name="account"
                  type="text"
                  autoComplete="email username"
                  required
                  className="input-field"
                  placeholder="请输入邮箱或用户名"
                  value={formData.account}
                  onChange={handleChange}
                  onFocus={() => setFocusedField('account')}
                  onBlur={() => setFocusedField(null)}
                />
                <div className="input-glow" />
              </div>
            </div>

            <div className={`input-group ${focusedField === 'password' ? 'focused' : ''}`}>
              <label htmlFor="password" className="input-label">密码</label>
              <div className="input-wrapper">
                <LockIcon 
                  size={18} 
                  className={`input-icon ${focusedField === 'password' ? 'active' : ''}`} 
                />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="input-field"
                  placeholder="请输入密码"
                  value={formData.password}
                  onChange={handleChange}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                />
                <div className="input-glow" />
              </div>
            </div>

            <div className="form-options">
              <button 
                type="button" 
                onClick={() => navigate('/forgot-password')} 
                className="forgot-password-link"
              >
                忘记密码？
              </button>
            </div>

            <button type="submit" disabled={loading} className="submit-button">
              {loading ? (
                <>
                  <Loader2Icon size={18} className="animate-spin" />
                  <span>登录中...</span>
                </>
              ) : (
                <>
                  <span>立即登录</span>
                  <ArrowRightIcon size={18} className="button-arrow" />
                </>
              )}
            </button>
          </form>

          {/* 注册链接 */}
          <div className="form-footer">
            <p className="register-text">
              还没有账户？
              <button onClick={() => navigate('/register')} className="register-link">
                立即注册
              </button>
            </p>
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

        {/* 版权信息 */}
        <p className="copyright">© 2026 {APP_NAME}. All rights reserved.</p>
      </div>

      <style>{`
        /* ===== 基础布局 ===== */
        .login-page {
          min-height: 100vh;
          display: flex;
          position: relative;
          overflow: hidden;
          font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: transparent;
        }

        /* ===== 主题切换按钮 ===== */
        .theme-toggle-wrapper {
          position: fixed;
          top: 1.5rem;
          right: 1.5rem;
          z-index: 100;
        }

        /* ===== 主容器 - 居中布局 ===== */
        .login-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          position: relative;
          z-index: 1;
          min-height: 100vh;
        }

        /* ===== 登录卡片 ===== */
        .login-card {
          width: 100%;
          max-width: 420px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-default);
          border-radius: 24px;
          padding: 2.5rem;
          box-shadow: 
            0 25px 60px -15px rgba(0, 0, 0, 0.15),
            0 0 0 1px rgba(255, 255, 255, 0.05) inset;
          animation: card-appear 0.6s ease-out;
        }

        @keyframes card-appear {
          from { opacity: 0; transform: translateY(30px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* ===== Logo 区域 ===== */
        .logo-section {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .logo-wrapper {
          position: relative;
          width: 72px;
          height: 72px;
          margin: 0 auto 1rem;
        }

        .logo-glow {
          position: absolute;
          inset: -8px;
          background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
          border-radius: 50%;
          opacity: 0.3;
          filter: blur(20px);
          animation: logo-glow-pulse 3s ease-in-out infinite;
        }

        @keyframes logo-glow-pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
        }

        .logo-image {
          position: relative;
          width: 100%;
          height: 100%;
          object-fit: contain;
          border-radius: 16px;
          z-index: 1;
          animation: logo-float 3s ease-in-out infinite;
        }

        @keyframes logo-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }

        .app-title {
          font-size: 1.5rem;
          font-weight: 700;
          background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 0.375rem;
          letter-spacing: -0.02em;
        }

        .app-tagline {
          font-size: 0.875rem;
          color: var(--text-tertiary);
          font-weight: 400;
        }

        /* ===== 表单头部 ===== */
        .form-header {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .form-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 0.25rem;
        }

        .form-subtitle {
          font-size: 0.875rem;
          color: var(--text-tertiary);
        }

        /* ===== 消息提示 ===== */
        .alert {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem 1rem;
          border-radius: 10px;
          margin-bottom: 1.25rem;
          font-size: 0.875rem;
          animation: slide-up 0.3s ease-out;
        }

        .alert-success {
          background: var(--success-dim);
          border: 1px solid var(--success);
          color: var(--success);
        }

        .alert-error {
          background: var(--error-dim);
          border: 1px solid var(--error);
          color: var(--error);
        }

        .alert-icon { flex-shrink: 0; }

        @keyframes slide-up {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ===== 表单样式 ===== */
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .input-label {
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-secondary);
          transition: color 0.2s;
        }

        .input-group.focused .input-label {
          color: var(--primary-500);
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 1rem;
          color: var(--text-muted);
          transition: all 0.2s;
          z-index: 2;
        }

        .input-icon.active {
          color: var(--primary-500);
          transform: scale(1.1);
        }

        .input-field {
          width: 100%;
          padding: 0.875rem 1rem 0.875rem 2.75rem;
          background: var(--bg-primary);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          color: var(--text-primary);
          font-size: 0.9375rem;
          transition: all 0.2s;
          outline: none;
        }

        .input-field::placeholder { color: var(--text-muted); }
        .input-field:hover { border-color: var(--border-strong); }
        .input-field:focus {
          border-color: var(--primary-500);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .input-glow {
          position: absolute;
          inset: -2px;
          border-radius: 14px;
          background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
          opacity: 0;
          z-index: -1;
          transition: opacity 0.3s;
          filter: blur(8px);
        }

        .input-group.focused .input-glow { opacity: 0.3; }

        /* ===== 表单选项 ===== */
        .form-options {
          display: flex;
          justify-content: flex-end;
          margin-top: -0.5rem;
        }

        .forgot-password-link {
          font-size: 0.8125rem;
          color: var(--primary-500);
          background: none;
          border: none;
          cursor: pointer;
          transition: color 0.2s;
          font-weight: 500;
        }

        .forgot-password-link:hover {
          color: var(--primary-600);
          text-decoration: underline;
        }

        /* ===== 提交按钮 ===== */
        .submit-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.875rem 1.5rem;
          background: linear-gradient(135deg, var(--primary-600), var(--accent-600));
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
        }

        .submit-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(99, 102, 241, 0.4);
        }

        .submit-button:active:not(:disabled) { transform: translateY(0); }
        .submit-button:disabled { opacity: 0.7; cursor: not-allowed; }

        .button-arrow { transition: transform 0.2s; }
        .submit-button:hover:not(:disabled) .button-arrow { transform: translateX(4px); }

        /* ===== 表单底部 ===== */
        .form-footer {
          margin-top: 1.5rem;
          text-align: center;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border-subtle);
        }

        .register-text {
          font-size: 0.875rem;
          color: var(--text-tertiary);
        }

        .register-link {
          color: var(--primary-500);
          background: none;
          border: none;
          cursor: pointer;
          font-weight: 600;
          margin-left: 0.25rem;
          transition: all 0.2s;
        }

        .register-link:hover {
          color: var(--primary-600);
          text-decoration: underline;
        }

        /* ===== 特性图标栏 ===== */
        .features-bar {
          display: flex;
          justify-content: center;
          gap: 1rem;
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border-subtle);
        }

        .feature-dot {
          position: relative;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-default);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-tertiary);
          transition: all 0.2s;
          cursor: pointer;
        }

        .feature-dot:hover {
          background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
          border-color: transparent;
          color: white;
          transform: translateY(-2px);
        }

        /* Tooltip 样式 */
        .feature-dot::before {
          content: attr(data-tooltip);
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%) scale(0.9);
          padding: 0.375rem 0.625rem;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: 6px;
          font-size: 0.6875rem;
          font-weight: 500;
          color: var(--text-secondary);
          white-space: nowrap;
          opacity: 0;
          visibility: hidden;
          transition: all 0.2s ease;
          box-shadow: var(--shadow-md);
          z-index: 10;
        }

        /* Tooltip 箭头 */
        .feature-dot::after {
          content: '';
          position: absolute;
          bottom: calc(100% + 3px);
          left: 50%;
          transform: translateX(-50%) scale(0.9);
          border: 4px solid transparent;
          border-top-color: var(--border-default);
          opacity: 0;
          visibility: hidden;
          transition: all 0.2s ease;
          z-index: 10;
        }

        .feature-dot:hover::before,
        .feature-dot:hover::after {
          opacity: 1;
          visibility: visible;
          transform: translateX(-50%) scale(1);
        }

        /* ===== 版权信息 ===== */
        .copyright {
          margin-top: 2rem;
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        /* ===== 响应式设计 ===== */
        @media (max-width: 480px) {
          .login-container { padding: 1rem; }
          .login-card { padding: 1.75rem; border-radius: 20px; }
          .logo-wrapper { width: 64px; height: 64px; }
          .app-title { font-size: 1.375rem; }
          .theme-toggle-wrapper { top: 1rem; right: 1rem; }
        }

        /* ===== 深色主题特殊处理 ===== */
        [data-theme="dark"] .login-card {
          background: rgba(26, 29, 33, 0.9);
          backdrop-filter: blur(20px);
          box-shadow: 
            0 25px 60px -15px rgba(0, 0, 0, 0.4),
            0 0 0 1px rgba(255, 255, 255, 0.05) inset;
        }

        [data-theme="dark"] .input-field {
          background: var(--bg-primary);
        }

        [data-theme="dark"] .logo-glow {
          opacity: 0.4;
        }
      `}</style>
    </div>
  );
};

export default Login;
