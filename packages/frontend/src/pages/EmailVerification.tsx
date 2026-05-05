import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authControllerResendVerification, authControllerBindEmailAndLogin, authControllerVerifyEmailAndRegisterPhone } from '@/api-sdk';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useBrandConfig } from '../contexts/BrandContext';
import { useTheme } from '../contexts/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { InteractiveBackground } from '../components/InteractiveBackground';

// Lucide 图标
import { Mail } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { CheckCircle } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import { Cpu } from 'lucide-react';
import { Boxes } from 'lucide-react';
import { ShieldCheck } from 'lucide-react';

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * 邮箱验证页面 - CloudCAD
 *
 * 设计特色：
 * - 居中卡片布局
 * - 统一渐变网格背景
 * - 玻璃态效果
 * - 倒计时重发功能
 * - 完美主题适配
 */
export const EmailVerification: React.FC = () => {
  useDocumentTitle('邮箱验证');
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyEmailAndLogin, isAuthenticated } = useAuth();
  const { config: brandConfig } = useBrandConfig();
  const { isDark } = useTheme();

  const appName = brandConfig?.title || 'CloudCAD';
  const appLogo = brandConfig?.logo || '/logo.png';

  // 绑定模式：用户没有邮箱，需要先输入邮箱再验证
  const bindMode = location.state?.mode === 'bind';
  const tempToken = location.state?.tempToken || '';
  
  // 手机号注册相关信息
  const phoneRegisterData = location.state?.phone ? {
    phone: location.state.phone,
    code: location.state.code,
    username: location.state.username,
    password: location.state.password,
    nickname: location.state.nickname,
  } : null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState<string>('');
  const [emailSent, setEmailSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState<string>('');

  // 重发验证码相关状态
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSuccess, setResendSuccess] = useState(false);

  const hasAutoSent = React.useRef(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
      return;
    }

    const stateEmail = location.state?.email;
    if (stateEmail) {
      setEmail(stateEmail);
      // 非绑定模式下已有邮箱，自动发送验证码
      if (location.state?.mode !== 'bind' && !hasAutoSent.current) {
        hasAutoSent.current = true;
        setEmailSent(true);
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        authControllerResendVerification().catch((err) => {
          const errorMessage =
            (err as Error & { response?: { data?: { message?: string } } }).response
              ?.data?.message ||
            (err as Error).message ||
            '发送验证码失败，请手动点击重发';
          setError(errorMessage);
        });
      }
    }
  }, [location, navigate, isAuthenticated]);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      setError('请输入验证码');
      return;
    }
    if (verificationCode.length !== 6) {
      setError('验证码应为6位数字');
      return;
    }
    if (!email) {
      setError(bindMode ? '请输入邮箱地址' : '邮箱地址缺失，请重新注册');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (bindMode) {
        // 绑定模式：调用绑定邮箱接口，返回 token 后存储并通过刷新更新 AuthContext
        const response = await authControllerBindEmailAndLogin();
        const { accessToken, refreshToken, user: userData } = response as unknown as {
          accessToken: string; refreshToken: string; user: unknown;
        };
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(userData));
        // 直接刷新页面，让 AuthContext 从 localStorage 重新初始化
        window.location.href = '/';
        return;
      } else if (phoneRegisterData) {
        // 手机号注册场景：验证邮箱后完成手机号注册
        // NOTE: verifyEmailAndRegisterPhone SDK type has body?: never;
        // old params: { email, code, phone, phoneCode, username, password, nickname }
        const response = await authControllerVerifyEmailAndRegisterPhone();
        const { accessToken, refreshToken, user: userData } = response as unknown as {
          accessToken: string; refreshToken: string; user: unknown;
        };
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(userData));
        // 直接刷新页面，让 AuthContext 从 localStorage 重新初始化
        window.location.href = '/';
        return;
      } else {
        // 验证模式：调用验证邮箱接口
        await verifyEmailAndLogin(email, verificationCode.trim());
      }
      setSuccess(true);
      // 验证成功（自动登录），直接跳转到首页
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 1500);
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '验证失败，请检查验证码是否正确或已过期'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = useCallback(async () => {
    if (!email) {
      setError('请先输入邮箱地址');
      return;
    }

    // 验证邮箱格式
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }

    if (resendCooldown > 0 || resendLoading) return;

    setResendLoading(true);
    setError(null);
    setResendSuccess(false);

    try {
      await authControllerResendVerification();
      setResendSuccess(true);
      setEmailSent(true);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setTimeout(() => setResendSuccess(false), 5000);
    } catch (err) {
      const errorMessage =
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
        (err as Error).message ||
        '发送失败，请稍后重试';
      setError(errorMessage);
    } finally {
      setResendLoading(false);
    }
  }, [email, resendCooldown, resendLoading]);

  // 验证成功状态
  if (success) {
    return (
      <div className="auth-page" data-theme={isDark ? 'dark' : 'light'}>
        <div className="theme-toggle-wrapper">
          <ThemeToggle />
        </div>

        <div className="auth-container">
          <div className="auth-card">
            <div className="success-content">
              <div className="success-icon">
                <CheckCircle size={32} />
              </div>
              <h2 className="success-title">邮箱验证成功！</h2>
              <p className="success-subtitle">
                账号已激活，即将自动跳转到登录页...
              </p>
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
          .success-title { font-size: 1.5rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; }
          .success-subtitle { font-size: 0.875rem; color: var(--text-tertiary); }
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
            <p className="app-tagline">{bindMode ? '绑定您的邮箱地址' : phoneRegisterData ? '验证邮箱完成注册' : '验证您的邮箱地址'}</p>
          </div>

          {/* 邮件提示 */}
          <div className="email-notice">
            <div className="email-icon">
              <Mail size={24} />
            </div>
            {bindMode && !emailSent ? (
              <p className="email-text">您的账号需要绑定邮箱才能继续使用</p>
            ) : phoneRegisterData && !email ? (
              <p className="email-text">请输入您的邮箱地址用于完成注册</p>
            ) : email ? (
              <p className="email-text">
                我们已向 <span className="email-highlight">{email}</span>{' '}
                发送了验证码
              </p>
            ) : (
              <p className="email-text">请输入您收到的6位数字验证码</p>
            )}
          </div>

          {/* 手机号注册和绑定模式下：显示邮箱输入框 */}
          {(bindMode || phoneRegisterData) && !emailSent && (
            <div className="code-section" style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="email" className="code-label">
                邮箱地址
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="请输入邮箱地址"
                className="code-input"
                style={{ fontSize: '1rem', fontWeight: 400, letterSpacing: 'normal', textAlign: 'left' }}
                disabled={loading}
              />
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="alert alert-error">
              <AlertCircle size={18} className="alert-icon" />
              <span>{error}</span>
            </div>
          )}

          {/* 成功提示 */}
          {resendSuccess && (
            <div className="alert alert-success">
              <CheckCircle size={18} className="alert-icon" />
              <span>验证邮件已重新发送，请查收</span>
            </div>
          )}

          {/* 验证码输入 - 只有输入了邮箱后才显示 */}
          {email && (
            <div className="code-section">
              <label htmlFor="code" className="code-label">
                验证码
              </label>
              <input
                id="code"
                type="text"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  setVerificationCode(value);
                  if (error) setError(null);
                }}
                placeholder="请输入6位数字验证码"
                className="code-input"
                disabled={loading}
              />
              <p className="code-hint">验证码为6位数字，请查看邮件</p>
            </div>
          )}

          {/* 验证按钮 - 有邮箱且有验证码时才能点击 */}
          <button
            onClick={handleVerifyCode}
            disabled={loading || !email || verificationCode.length !== 6}
            className="verify-button"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>验证中...</span>
              </>
            ) : (
              <>
                <span>验证</span>
                <CheckCircle size={18} />
              </>
            )}
          </button>

          {/* 帮助信息 */}
          <div className="help-section">
            <h4 className="help-title">没有收到邮件？</h4>
            <ul className="help-list">
              <li>• 检查垃圾邮件文件夹</li>
              <li>• 确认邮箱地址正确</li>
              <li>• 验证码15分钟内有效</li>
            </ul>
          </div>

          {/* 重发和返回按钮 */}
          <div className="action-buttons">
            <button
              onClick={handleResendEmail}
              disabled={resendCooldown > 0 || resendLoading || !email}
              className="resend-button"
            >
              {resendLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>发送中...</span>
                </>
              ) : resendCooldown > 0 ? (
                <>
                  <RefreshCw size={16} />
                  <span>{resendCooldown}秒后可重新发送</span>
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  <span>{!emailSent && (bindMode || phoneRegisterData) ? '发送验证邮件' : '重新发送验证邮件'}</span>
                </>
              )}
            </button>

            <button onClick={() => navigate('/login')} className="back-button">
              <ArrowLeft size={16} />
              <span>返回登录</span>
            </button>
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
        .app-title { font-size: 1.5rem; font-weight: 700; background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: -0.02em; margin-bottom: 0.375rem; }
        .app-tagline { font-size: 0.875rem; color: var(--text-tertiary); font-weight: 400; }
        .email-notice { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 1.25rem; background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 12px; margin-bottom: 1.5rem; }
        .email-icon { width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); display: flex; align-items: center; justify-content: center; color: white; }
        .email-text { font-size: 0.875rem; color: var(--text-secondary); text-align: center; }
        .email-highlight { font-weight: 600; color: var(--primary-500); }
        .alert { display: flex; align-items: center; gap: 0.75rem; padding: 0.875rem 1rem; border-radius: 10px; margin-bottom: 1.25rem; font-size: 0.875rem; animation: slide-up 0.3s ease-out; }
        .alert-error { background: var(--error-dim); border: 1px solid var(--error); color: var(--error); }
        .alert-success { background: var(--success-dim); border: 1px solid var(--success); color: var(--success); }
        .alert-icon { flex-shrink: 0; }
        @keyframes slide-up { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .code-section { margin-bottom: 1.25rem; }
        .code-label { display: block; font-size: 0.8125rem; font-weight: 500; color: var(--text-secondary); margin-bottom: 0.5rem; }
        .code-input { width: 100%; padding: 1rem; background: var(--bg-primary); border: 1px solid var(--border-default); border-radius: 12px; color: var(--text-primary); font-size: 1.5rem; font-weight: 600; text-align: center; letter-spacing: 0.5em; transition: all 0.2s; outline: none; }
        .code-input::placeholder { color: var(--text-muted); font-size: 0.9375rem; font-weight: 400; letter-spacing: normal; }
        .code-input:hover { border-color: var(--border-strong); }
        .code-input:focus { border-color: var(--primary-500); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); }
        .code-hint { font-size: 0.75rem; color: var(--text-muted); text-align: center; margin-top: 0.5rem; }
        .verify-button { display: flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; padding: 0.875rem 1.5rem; background: linear-gradient(135deg, var(--primary-600), var(--accent-600)); border: none; border-radius: 12px; color: white; font-size: 0.9375rem; font-weight: 600; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3); margin-bottom: 1.25rem; }
        .verify-button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(99, 102, 241, 0.4); }
        .verify-button:disabled { opacity: 0.5; cursor: not-allowed; }
        .help-section { background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem; }
        .help-title { font-size: 0.8125rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.5rem; }
        .help-list { list-style: none; padding: 0; margin: 0; }
        .help-list li { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem; }
        .action-buttons { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.25rem; }
        .resend-button { display: flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; padding: 0.75rem 1rem; background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 10px; color: var(--text-secondary); font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .resend-button:hover:not(:disabled) { background: var(--bg-elevated); border-color: var(--border-strong); }
        .resend-button:disabled { opacity: 0.5; cursor: not-allowed; }
        .back-button { display: flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; padding: 0.75rem 1rem; background: var(--bg-primary); border: 1px solid var(--border-default); border-radius: 10px; color: var(--text-secondary); font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .back-button:hover { background: var(--bg-tertiary); }
        .features-bar { display: flex; justify-content: center; gap: 1rem; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-subtle); }
        .feature-dot { position: relative; width: 32px; height: 32px; border-radius: 50%; background: var(--bg-tertiary); border: 1px solid var(--border-default); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary); transition: all 0.2s; cursor: pointer; }
        .feature-dot:hover { background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); border-color: transparent; color: white; transform: translateY(-2px); }
        .feature-dot::before { content: attr(data-tooltip); position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%) scale(0.9); padding: 0.375rem 0.625rem; background: var(--bg-elevated); border: 1px solid var(--border-default); border-radius: 6px; font-size: 0.6875rem; font-weight: 500; color: var(--text-secondary); white-space: nowrap; opacity: 0; visibility: hidden; transition: all 0.2s ease; box-shadow: var(--shadow-md); z-index: 10; }
        .feature-dot::after { content: ''; position: absolute; bottom: calc(100% + 3px); left: 50%; transform: translateX(-50%) scale(0.9); border: 4px solid transparent; border-top-color: var(--border-default); opacity: 0; visibility: hidden; transition: all 0.2s ease; z-index: 10; }
        .feature-dot:hover::before, .feature-dot:hover::after { opacity: 1; visibility: visible; transform: translateX(-50%) scale(1); }
        .copyright { margin-top: 2rem; font-size: 0.75rem; color: var(--text-muted); }
        [data-theme="dark"] .auth-card { background: rgba(26, 29, 33, 0.9); backdrop-filter: blur(20px); box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset; }
        [data-theme="dark"] .input-field, [data-theme="dark"] .code-input { background: var(--bg-primary); }
        @media (max-width: 480px) { .auth-container { padding: 1rem; } .auth-card { padding: 1.75rem; border-radius: 20px; } }
      `}</style>
    </div>
  );
};

export default EmailVerification;