import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useBrandConfig } from '../contexts/BrandContext';
import { useTheme } from '../contexts/ThemeContext';
import { useRuntimeConfig } from '../contexts/RuntimeConfigContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { InteractiveBackground } from '../components/InteractiveBackground';
import { authControllerSendSmsCode } from '@/api-sdk';
import type { LoginDto } from '@/api-sdk';

// 导入 lucide 图标
import { Mail } from 'lucide-react';
import { Lock } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { CheckCircle } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { Cpu } from 'lucide-react';
import { Boxes } from 'lucide-react';
import { ShieldCheck } from 'lucide-react';
import { Eye } from 'lucide-react';
import { EyeOff } from 'lucide-react';
import { Phone } from 'lucide-react';
import { MessageSquare } from 'lucide-react';
import { MessageCircle } from 'lucide-react';

type LoginTab = 'account' | 'phone';

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
 * - 支持账号登录和手机验证码登录
 */
export const Login: React.FC = () => {
  useDocumentTitle('登录');
  const navigate = useNavigate();
  const location = useLocation();
  const {
    login,
    loginByPhone,
    loginWithWechat,
    isAuthenticated,
    loading: authLoading,
    error: authError,
    setError: setAuthError,
  } = useAuth();
  const { isDark } = useTheme();
  const { config } = useBrandConfig();
  const { config: runtimeConfig } = useRuntimeConfig();
  const appName = config?.title || 'CloudCAD';
  const appLogo = config?.logo || '/logo.png';

  // 处理微信登录回调 Hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('wechat_result')) {
      try {
        const hashValue = hash.split('wechat_result=')[1];
        if (hashValue) {
          const result = JSON.parse(decodeURIComponent(hashValue));

          // 清除 Hash
          window.history.replaceState(null, '', window.location.pathname);

          // 使用后端返回的 isPopup 标志判断是否为弹窗模式
          const isPopup = result.isPopup === true;

          if (isPopup) {
            // === 弹窗模式 ===
            // 存入 localStorage，主窗口会检测
            localStorage.setItem('wechat_auth_result', JSON.stringify(result));
            // 关闭弹窗
            window.close();
          } else {
            // === 主窗口模式 (用户直接访问链接) ===
            if (result.error) {
              alert(`微信登录失败：${result.error}`);
            } else if (result.needRegister) {
              sessionStorage.setItem('wechatTempToken', result.tempToken);
              navigate('/register?wechat=1');
            } else if (result.accessToken) {
              localStorage.setItem('accessToken', result.accessToken);
              localStorage.setItem('refreshToken', result.refreshToken);
              localStorage.setItem('user', JSON.stringify(result.user));
              window.location.href = '/';
            }
          }
        }
      } catch (e) {
        console.error('解析微信登录结果失败', e);
      }
    }
  }, [navigate]);

  // 短信服务和邮件服务是否启用
  const smsEnabled = runtimeConfig?.smsEnabled ?? false;
  const mailEnabled = runtimeConfig?.mailEnabled ?? false;
  const wechatEnabled = runtimeConfig?.wechatEnabled ?? false;

  // 根据运行时配置动态生成登录方式描述
  const getAccountLoginLabel = () => {
    if (smsEnabled && mailEnabled) {
      return '手机号、邮箱或用户名';
    }
    if (smsEnabled) {
      return '手机号或用户名';
    }
    if (mailEnabled) {
      return '邮箱或用户名';
    }
    return '用户名';
  };

  const getAccountLoginPlaceholder = () => {
    if (smsEnabled && mailEnabled) {
      return '请输入手机号、邮箱或用户名';
    }
    if (smsEnabled) {
      return '请输入手机号或用户名';
    }
    if (mailEnabled) {
      return '请输入邮箱或用户名';
    }
    return '请输入用户名';
  };

  // Tab 状态
  const [activeTab, setActiveTab] = useState<LoginTab>('account');

  // 账号登录表单状态
  const [formData, setFormData] = useState<LoginDto>({
    account: '',
    password: '',
  });

  // 手机登录表单状态
  const [phoneForm, setPhoneForm] = useState({
    phone: '',
    code: '',
  });

  // 通用状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // 验证码倒计时
  const [countdown, setCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 清理倒计时
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  // 处理倒计时
  useEffect(() => {
    if (countdown > 0) {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) {
              clearInterval(countdownRef.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownRef.current && countdown <= 0) {
        clearInterval(countdownRef.current);
      }
    };
  }, [countdown > 0]);

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

  // 账号登录输入处理
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
      if (error) setError(null);
    },
    [error]
  );

  // 手机登录输入处理
  const handlePhoneChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      // 手机号只允许输入数字
      if (name === 'phone' && value && !/^\d*$/.test(value)) {
        return;
      }
      // 验证码只允许输入数字
      if (name === 'code' && value && !/^\d*$/.test(value)) {
        return;
      }
      setPhoneForm((prev) => ({ ...prev, [name]: value }));
      if (error) setError(null);
    },
    [error]
  );

  // 发送验证码
  const handleSendCode = useCallback(async () => {
    // 验证手机号格式
    if (!phoneForm.phone || !/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
      setError('请输入正确的手机号');
      return;
    }

    setSendingCode(true);
    setError(null);

    try {
      const response = await authControllerSendSmsCode();
      if (response?.success) {
        setSuccess('验证码已发送');
        setCountdown(60); // 60秒倒计时
      } else {
        setError((response as { message?: string })?.message || '发送验证码失败');
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '发送验证码失败'
      );
    } finally {
      setSendingCode(false);
    }
  }, [phoneForm.phone]);

  // 联系客服弹框状态
  const [showSupportModal, setShowSupportModal] = useState(false);

  // 账号登录提交
  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(formData.account, formData.password);
      navigate('/');
    } catch (err) {
      const errorData = (
        err as Error & {
          response?: { data?: { code?: string; message?: string; email?: string; phone?: string; tempToken?: string } };
        }
      ).response?.data;
      const errorMessage =
        errorData?.message || (err as Error).message || '登录失败，请检查账号和密码';

      // 账号已被禁用 -> 显示联系客服弹框
      if (errorMessage.includes('账号已被禁用')) {
        setShowSupportModal(true);
        return;
      }

      // 邮箱未验证 -> 跳转到邮箱验证页
      if (errorData?.code === 'EMAIL_NOT_VERIFIED') {
        navigate('/verify-email', { state: { email: errorData.email || '' } });
        return;
      }

      // 需要绑定邮箱 -> 跳转到绑定邮箱页
      if (errorData?.code === 'EMAIL_REQUIRED') {
        navigate('/verify-email', { state: { tempToken: errorData.tempToken, mode: 'bind' } });
        return;
      }

      // 手机号未验证 -> 跳转到手机验证页
      if (errorData?.code === 'PHONE_NOT_VERIFIED') {
        navigate('/verify-phone', { state: { phone: errorData.phone || '' } });
        return;
      }

      // 需要绑定手机号 -> 跳转到绑定手机号页
      if (errorData?.code === 'PHONE_REQUIRED') {
        navigate('/verify-phone', { state: { tempToken: errorData.tempToken, mode: 'bind' } });
        return;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // 手机登录提交
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // 验证手机号格式
    if (!phoneForm.phone || !/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
      setError('请输入正确的手机号');
      setLoading(false);
      return;
    }

    // 验证验证码格式
    if (!phoneForm.code || !/^\d{6}$/.test(phoneForm.code)) {
      setError('请输入6位数字验证码');
      setLoading(false);
      return;
    }

    try {
      await loginByPhone(phoneForm.phone, phoneForm.code);
      navigate('/');
    } catch (err) {
      const errorData = (
        err as Error & {
          response?: {
            data?: { code?: string; message?: string; phone?: string };
          };
        }
      ).response?.data;
      const errorCode = errorData?.code;
      const errorMessage =
        errorData?.message || (err as Error).message || '登录失败，请重试';

      // 账号已被禁用 -> 显示联系客服弹框
      if (errorMessage.includes('账号已被禁用')) {
        setShowSupportModal(true);
        return;
      }

      // 如果是需要注册的提示，跳转到注册页并预填手机号和验证码
      if (errorCode === 'PHONE_NOT_REGISTERED') {
        navigate('/register', {
          state: {
            prefillPhone: phoneForm.phone,
            prefillCode: phoneForm.code,
          },
        });
        return;
      }

      setError(errorMessage);
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
              <img src={appLogo} alt={appName} className="logo-image" />
            </div>
            <h1 className="app-title">{appName}</h1>
            <p className="app-tagline">专业云端 CAD 图纸管理平台</p>
          </div>

          {/* 表单头部 */}
          <div className="form-header">
            <h2 className="form-title">欢迎回来</h2>
            <p className="form-subtitle">登录您的账户以继续</p>
          </div>

          {/* 登录方式 Tab 切换 */}
          {smsEnabled && (
            <div className="login-tabs">
              <button
                type="button"
                className={`login-tab ${activeTab === 'account' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('account');
                  setError(null);
                  setSuccess(null);
                }}
              >
                <Mail size={16} />
                <span>账号登录</span>
              </button>
              <button
                type="button"
                className={`login-tab ${activeTab === 'phone' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('phone');
                  setError(null);
                  setSuccess(null);
                }}
              >
                <Phone size={16} />
                <span>手机登录</span>
              </button>
            </div>
          )}

          {/* 消息提示 */}
          {success && (
            <div className="alert alert-success">
              <CheckCircle size={18} className="alert-icon" />
              <span>{success}</span>
            </div>
          )}

          {(error || authError) && (
            <div className="alert alert-error">
              <AlertCircle size={18} className="alert-icon" />
              <span>{error || authError}</span>
            </div>
          )}

          {/* 账号登录表单 */}
          {activeTab === 'account' && (
            <form className="login-form" onSubmit={handleAccountSubmit}>
              <div
                className={`input-group ${focusedField === 'account' ? 'focused' : ''}`}
              >
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
                    onChange={handleChange}
                    onFocus={() => setFocusedField('account')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <div className="input-glow" />
                </div>
              </div>

              <div
                className={`input-group ${focusedField === 'password' ? 'focused' : ''}`}
              >
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
                    onChange={handleChange}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
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

              <button
                type="submit"
                disabled={loading}
                className="submit-button"
              >
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
          )}

          {/* 手机登录表单 */}
          {activeTab === 'phone' && (
            <form className="login-form" onSubmit={handlePhoneSubmit}>
              <div
                className={`input-group ${focusedField === 'phone' ? 'focused' : ''}`}
              >
                <label htmlFor="phone" className="input-label">
                  手机号
                </label>
                <div className="input-wrapper">
                  <Phone
                    size={18}
                    className={`input-icon ${focusedField === 'phone' ? 'active' : ''}`}
                  />
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    maxLength={11}
                    className="input-field"
                    placeholder="请输入手机号"
                    value={phoneForm.phone}
                    onChange={handlePhoneChange}
                    onFocus={() => setFocusedField('phone')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <div className="input-glow" />
                </div>
              </div>

              <div
                className={`input-group ${focusedField === 'code' ? 'focused' : ''}`}
              >
                <label htmlFor="code" className="input-label">
                  验证码
                </label>
                <div className="input-wrapper has-button">
                  <MessageSquare
                    size={18}
                    className={`input-icon ${focusedField === 'code' ? 'active' : ''}`}
                  />
                  <input
                    id="code"
                    name="code"
                    type="text"
                    autoComplete="one-time-code"
                    required
                    maxLength={6}
                    className="input-field has-button"
                    placeholder="请输入验证码"
                    value={phoneForm.code}
                    onChange={handlePhoneChange}
                    onFocus={() => setFocusedField('code')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <button
                    type="button"
                    className="code-button"
                    onClick={handleSendCode}
                    disabled={
                      countdown > 0 ||
                      sendingCode ||
                      phoneForm.phone.length !== 11
                    }
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

              <button
                type="submit"
                disabled={loading}
                className="submit-button"
              >
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
          )}

          {/* 注册链接 */}
          <div className="form-footer">
            <p className="register-text">
              还没有账户？
              <button
                onClick={() => navigate('/register')}
                className="register-link"
              >
                立即注册
              </button>
            </p>
          </div>

          {/* 微信登录按钮 */}
          {wechatEnabled && (
            <>
              <div className="divider">
                <span>其他登录方式</span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setAuthError(null);
                    await loginWithWechat();
                  } catch (err) {
                    const errorMessage = (
                      err as Error & {
                        response?: { data?: { message?: string } };
                      }
                    ).response?.data?.message ||
                      (err as Error).message ||
                      '微信登录失败';
                    setAuthError(errorMessage);
                  }
                }}
                className="wechat-login-button"
              >
                <MessageCircle size={20} />
                <span>微信登录</span>
              </button>
            </>
          )}

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

        {/* 版权信息 */}
        <p className="copyright">© 2026 {appName}. All rights reserved.</p>
      </div>

      {/* 联系客服弹框 */}
      {showSupportModal && (
        <div className="support-modal-overlay">
          <div className="support-modal">
            <div className="support-modal-header">
              <h3>账号已被禁用</h3>
              <button 
                className="support-modal-close" 
                onClick={() => setShowSupportModal(false)}
              >
                ×
              </button>
            </div>
            <div className="support-modal-content">
              <p className="support-modal-message">
                您的账号已被禁用，无法登录系统。
                <br />
                如有疑问，请联系客服人员获取帮助。
              </p>
              <div className="support-contact-info">
                <div className="support-contact-item">
                  <span className="support-contact-label">客服邮箱：</span>
                  <a href="mailto:support@cloudcad.com" className="support-contact-link">
                    support@cloudcad.com
                  </a>
                </div>
                <div className="support-contact-item">
                  <span className="support-contact-label">客服电话：</span>
                  <a href="tel:400-123-4567" className="support-contact-link">
                    400-123-4567
                  </a>
                </div>
                <div className="support-contact-item">
                  <span className="support-contact-label">工作时间：</span>
                  <span className="support-contact-value">
                    周一至周五 9:00-18:00
                  </span>
                </div>
              </div>
            </div>
            <div className="support-modal-footer">
              <button 
                className="support-modal-button" 
                onClick={() => setShowSupportModal(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

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

        /* ===== Tab 切换 ===== */
        .login-tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          padding: 0.25rem;
          background: var(--bg-tertiary);
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
        }

        .login-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: transparent;
          border: none;
          border-radius: 10px;
          color: var(--text-tertiary);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .login-tab:hover {
          color: var(--text-secondary);
          background: var(--bg-secondary);
        }

        .login-tab.active {
          background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
          color: white;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
        }

        .login-tab svg {
          flex-shrink: 0;
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

        .input-field.has-toggle {
          padding-right: 2.75rem;
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

        /* ===== 密码显示/隐藏按钮 ===== */
        .password-toggle {
          position: absolute;
          right: 1rem;
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
          z-index: 2;
        }

        .password-toggle:hover {
          color: var(--text-secondary);
        }

        /* ===== 验证码按钮 ===== */
        .input-wrapper.has-button {
          position: relative;
        }

        .input-field.has-button {
          padding-right: 7rem;
        }

        .code-button {
          position: absolute;
          right: 0.5rem;
          top: 50%;
          transform: translateY(-50%);
          padding: 0.5rem 0.75rem;
          background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 0.75rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          z-index: 2;
          min-width: 5.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .code-button:hover:not(:disabled) {
          transform: translateY(-50%) scale(1.02);
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
        }

        .code-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          background: var(--bg-tertiary);
          color: var(--text-muted);
        }

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

        /* ===== 微信登录按钮 ===== */
        .divider {
          display: flex;
          align-items: center;
          margin: 1.5rem 0;
          color: var(--text-muted);
          font-size: 0.75rem;
        }

        .divider::before,
        .divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border-subtle);
        }

        .divider span {
          padding: 0 0.75rem;
        }

        .wechat-login-button {
          width: 100%;
          height: 44px;
          border: 1px solid var(--border-default);
          border-radius: 12px;
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          font-size: 0.875rem;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .wechat-login-button:hover {
          background: #07c160;
          border-color: #07c160;
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(7, 193, 96, 0.3);
        }

        .wechat-login-button:active {
          transform: translateY(0);
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

        /* ===== 隐藏浏览器自带的密码显示按钮 ===== */
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear {
          display: none;
        }

        input[type="password"]::-webkit-credentials-auto-fill-button {
          visibility: hidden;
          display: none !important;
          pointer-events: none;
          position: absolute;
          right: 0;
        }

        /* 针对 Edge 浏览器的密码显示按钮 */
        input[type="password"]::-webkit-textfield-decoration-container {
          display: none;
        }

        /* ===== 联系客服弹框 ===== */
        .support-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fade-in 0.3s ease-out;
        }

        .support-modal {
          background: var(--bg-secondary);
          border: 1px solid var(--border-default);
          border-radius: 16px;
          width: 90%;
          max-width: 480px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          animation: slide-up 0.3s ease-out;
        }

        .support-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.5rem 1.5rem 1rem;
          border-bottom: 1px solid var(--border-subtle);
        }

        .support-modal-header h3 {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .support-modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .support-modal-close:hover {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }

        .support-modal-content {
          padding: 1.5rem;
        }

        .support-modal-message {
          font-size: 0.9375rem;
          color: var(--text-secondary);
          line-height: 1.5;
          margin-bottom: 1.5rem;
        }

        .support-contact-info {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .support-contact-item {
          display: flex;
          align-items: center;
          font-size: 0.875rem;
        }

        .support-contact-label {
          color: var(--text-tertiary);
          min-width: 80px;
        }

        .support-contact-link {
          color: var(--primary-500);
          text-decoration: none;
          transition: color 0.2s;
        }

        .support-contact-link:hover {
          color: var(--primary-600);
          text-decoration: underline;
        }

        .support-contact-value {
          color: var(--text-secondary);
        }

        .support-modal-footer {
          padding: 1rem 1.5rem 1.5rem;
          border-top: 1px solid var(--border-subtle);
          display: flex;
          justify-content: flex-end;
        }

        .support-modal-button {
          padding: 0.625rem 1.5rem;
          background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .support-modal-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
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

        [data-theme="dark"] .support-modal {
          background: rgba(26, 29, 33, 0.95);
          backdrop-filter: blur(20px);
        }
      `}</style>
    </div>
  );
};

export default Login;