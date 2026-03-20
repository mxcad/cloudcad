import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useRuntimeConfig } from '../contexts/RuntimeConfigContext';
import { validateField, validateRegisterForm } from '../utils/validation';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { APP_NAME } from '../constants/appConfig';
import { useTheme } from '../contexts/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { AuthBackground } from '../components/AuthBackground';
import type { RegisterDto } from '../types/api-client';

// 导入 lucide 图标
import UserIcon from 'lucide-react/dist/esm/icons/user';
import MailIcon from 'lucide-react/dist/esm/icons/mail';
import LockIcon from 'lucide-react/dist/esm/icons/lock';
import SparklesIcon from 'lucide-react/dist/esm/icons/sparkles';
import ArrowRightIcon from 'lucide-react/dist/esm/icons/arrow-right';
import ArrowLeftIcon from 'lucide-react/dist/esm/icons/arrow-left';
import Loader2Icon from 'lucide-react/dist/esm/icons/loader-2';
import AlertCircleIcon from 'lucide-react/dist/esm/icons/alert-circle';
import CheckCircleIcon from 'lucide-react/dist/esm/icons/check-circle';
import ShieldCheckIcon from 'lucide-react/dist/esm/icons/shield-check';
import CpuIcon from 'lucide-react/dist/esm/icons/cpu';
import BoxesIcon from 'lucide-react/dist/esm/icons/boxes';

/**
 * 注册页面 - CloudCAD
 * 
 * 设计特色：
 * - 居中单卡片布局
 * - 分步表单设计：步骤指示器 + 动态表单
 * - 实时验证：即时反馈用户输入
 * - 玻璃态效果：毛玻璃质感卡片
 * - 动态背景：渐变光晕 + 网格纹理
 * - 完美主题：深浅色主题无缝切换
 */
export const Register: React.FC = () => {
  useDocumentTitle('注册');
  const navigate = useNavigate();
  const { register: registerUser, isAuthenticated, loading: authLoading } = useAuth();
  const { config: runtimeConfig, loading: configLoading } = useRuntimeConfig();
  const { isDark } = useTheme();

  const mailEnabled = runtimeConfig.mailEnabled;

  const [formData, setFormData] = useState<RegisterDto>({
    email: '',
    password: '',
    username: '',
    nickname: '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

  // 检查注册开关
  if (!configLoading && !runtimeConfig.allowRegister) {
    return (
      <div className="register-page" data-theme={isDark ? 'dark' : 'light'}>
        <AuthBackground />

        <div className="theme-toggle-wrapper">
          <ThemeToggle />
        </div>

        <div className="register-container">
          <div className="closed-card">
            <div className="closed-icon">
              <ShieldCheckIcon size={32} />
            </div>
            <h2 className="closed-title">注册已关闭</h2>
            <p className="closed-message">
              系统管理员已关闭新用户注册功能。<br />
              如有疑问，请联系管理员。
            </p>
            <button
              onClick={() => navigate('/login')}
              className="back-button"
            >
              <ArrowLeftIcon size={18} />
              <span>返回登录</span>
            </button>
          </div>
        </div>

        <style>{`
          .register-page { min-height: 100vh; display: flex; position: relative; overflow: hidden; background: var(--bg-primary); }
          .theme-toggle-wrapper { position: fixed; top: 1.5rem; right: 1.5rem; z-index: 100; }
          .register-container { flex: 1; display: flex; align-items: center; justify-content: center; padding: 2rem; position: relative; z-index: 1; }
          .closed-card { background: var(--bg-secondary); border: 1px solid var(--border-default); border-radius: 24px; padding: 3rem; text-align: center; max-width: 400px; box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.2); }
          .closed-icon { width: 64px; height: 64px; background: linear-gradient(135deg, #f59e0b, #fbbf24); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; color: white; }
          .closed-title { font-size: 1.5rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.75rem; }
          .closed-message { color: var(--text-tertiary); margin-bottom: 1.5rem; line-height: 1.6; }
          .back-button { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.5rem; background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 10px; color: var(--text-secondary); font-weight: 500; cursor: pointer; transition: all 0.2s; }
          .back-button:hover { background: var(--bg-elevated); border-color: var(--border-strong); }
          [data-theme="dark"] .closed-card { background: rgba(26, 29, 33, 0.85); backdrop-filter: blur(20px); }
        `}</style>
      </div>
    );
  }

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === 'confirmPassword') {
      setConfirmPassword(value);
      if (touched.confirmPassword) {
        if (value && formData.password !== value) {
          setFieldErrors((prev) => ({ ...prev, confirmPassword: '两次输入的密码不一致' }));
        } else {
          setFieldErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors.confirmPassword;
            return newErrors;
          });
        }
      }
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));

      if (touched[name]) {
        const fieldError = validateField(
          name as keyof typeof import('../utils/validation').ValidationRules,
          value
        );
        if (fieldError) {
          setFieldErrors((prev) => ({ ...prev, [name]: fieldError }));
        } else {
          setFieldErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors[name];
            return newErrors;
          });
        }
      }
    }

    if (error) setError(null);
  }, [touched, formData.password, error]);

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setFocusedField(null);

    if (name === 'confirmPassword') {
      if (value && formData.password !== value) {
        setFieldErrors((prev) => ({ ...prev, confirmPassword: '两次输入的密码不一致' }));
      } else {
        setFieldErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors.confirmPassword;
          return newErrors;
        });
      }
    } else {
      const fieldError = validateField(
        name as keyof typeof import('../utils/validation').ValidationRules,
        value
      );
      if (fieldError) {
        setFieldErrors((prev) => ({ ...prev, [name]: fieldError }));
      } else {
        setFieldErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
      }
    }
  };

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      const errors: Record<string, string> = {};
      if (!formData.username) errors.username = '请输入用户名';
      if (mailEnabled && !formData.email) errors.email = '请输入邮箱';
      
      setFieldErrors((prev) => ({ ...prev, ...errors }));
      return Object.keys(errors).length === 0;
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => prev - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const dataToValidate = {
      email: formData.email ?? '',
      username: formData.username,
      password: formData.password,
      confirmPassword,
      nickname: formData.nickname,
    };
    const validationError = validateRegisterForm(dataToValidate, {
      validateEmail: mailEnabled,
    });

    if (validationError) {
      setError(validationError);
      return;
    }

    if (Object.keys(fieldErrors).length > 0) {
      setError('请修正表单错误');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const registerData = mailEnabled ? formData : { ...formData, email: undefined };
      const result = await registerUser(registerData as RegisterDto);

      if (mailEnabled && formData.email) {
        navigate('/verify-email', {
          state: { email: formData.email },
          replace: true,
        });
      } else {
        navigate('/login', {
          state: { message: result?.message || '注册成功，请登录' },
          replace: true,
        });
      }
    } catch (err) {
      const axiosError = err as Error & {
        response?: { data?: { message?: string }; status?: number; statusText?: string };
      };
      setError(
        axiosError.message ||
          (axiosError.response?.status === 409 ? '用户名或邮箱已被使用' : axiosError.response?.statusText) ||
          '注册失败，请稍后重试'
      );
    } finally {
      setLoading(false);
    }
  };

  const getPasswordStrength = (password: string): { strength: number; label: string; color: string } => {
    if (!password) return { strength: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    const levels = [
      { label: '太弱', color: '#ef4444' },
      { label: '较弱', color: '#f97316' },
      { label: '一般', color: '#eab308' },
      { label: '较强', color: '#22c55e' },
      { label: '很强', color: '#10b981' },
    ];
    const level = levels[score] ?? levels[0]!;
    return { strength: score, label: level.label, color: level.color };
  };

  const passwordStrength = getPasswordStrength(formData.password);

  return (
    <div className="register-page" data-theme={isDark ? 'dark' : 'light'}>
      {/* 动态背景 */}
      <AuthBackground />

      {/* 主题切换按钮 */}
      <div className="theme-toggle-wrapper">
        <ThemeToggle />
      </div>

      {/* 居中注册卡片 */}
      <div className="register-container">
        <div className="register-card">
          {/* Logo 区域 */}
          <div className="logo-section">
            <div className="logo-wrapper">
              <div className="logo-glow" />
              <img src="/logo.png" alt={APP_NAME} className="logo-image" />
            </div>
            <h1 className="app-title">{APP_NAME}</h1>
            <p className="app-tagline">创建账户，开启云端 CAD 之旅</p>
          </div>

          {/* 步骤指示器 */}
          <div className="step-indicator">
            <div className={`step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
              <div className="step-number">
                {currentStep > 1 ? <CheckCircleIcon size={16} /> : 1}
              </div>
              <span className="step-label">基本信息</span>
            </div>
            <div className="step-line" />
            <div className={`step ${currentStep >= 2 ? 'active' : ''}`}>
              <div className="step-number">2</div>
              <span className="step-label">安全设置</span>
            </div>
          </div>

          {/* 表单标题 */}
          <div className="form-header">
            <h2 className="form-title">
              {currentStep === 1 ? '创建账户' : '设置密码'}
            </h2>
            <p className="form-subtitle">
              {currentStep === 1 ? '填写您的基本信息' : '设置安全密码以保护账户'}
            </p>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="alert alert-error">
              <AlertCircleIcon size={18} className="alert-icon" />
              <span>{error}</span>
            </div>
          )}

          {/* 表单内容 */}
          <form className="register-form" onSubmit={handleSubmit}>
            {/* 步骤 1：基本信息 */}
            {currentStep === 1 && (
              <div className="form-step animate-fade-in">
                <div className={`input-group ${focusedField === 'username' ? 'focused' : ''} ${fieldErrors.username ? 'error' : ''}`}>
                  <label htmlFor="username" className="input-label">
                    用户名 <span className="required">*</span>
                  </label>
                  <div className="input-wrapper">
                    <UserIcon size={18} className={`input-icon ${focusedField === 'username' ? 'active' : ''}`} />
                    <input
                      id="username"
                      name="username"
                      type="text"
                      required
                      className="input-field"
                      placeholder="请输入用户名"
                      value={formData.username}
                      onChange={handleChange}
                      onFocus={() => setFocusedField('username')}
                      onBlur={handleBlur}
                    />
                    <div className="input-glow" />
                  </div>
                  {fieldErrors.username && (
                    <p className="error-message">{fieldErrors.username}</p>
                  )}
                </div>

                <div className={`input-group ${focusedField === 'nickname' ? 'focused' : ''} ${fieldErrors.nickname ? 'error' : ''}`}>
                  <label htmlFor="nickname" className="input-label">
                    昵称
                  </label>
                  <div className="input-wrapper">
                    <SparklesIcon size={18} className={`input-icon ${focusedField === 'nickname' ? 'active' : ''}`} />
                    <input
                      id="nickname"
                      name="nickname"
                      type="text"
                      className="input-field"
                      placeholder="请输入昵称（可选）"
                      value={formData.nickname || ''}
                      onChange={handleChange}
                      onFocus={() => setFocusedField('nickname')}
                      onBlur={handleBlur}
                    />
                    <div className="input-glow" />
                  </div>
                  {fieldErrors.nickname && (
                    <p className="error-message">{fieldErrors.nickname}</p>
                  )}
                </div>

                {mailEnabled && (
                  <div className={`input-group ${focusedField === 'email' ? 'focused' : ''} ${fieldErrors.email ? 'error' : ''}`}>
                    <label htmlFor="email" className="input-label">
                      邮箱地址 <span className="required">*</span>
                    </label>
                    <div className="input-wrapper">
                      <MailIcon size={18} className={`input-icon ${focusedField === 'email' ? 'active' : ''}`} />
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        className="input-field"
                        placeholder="请输入邮箱地址"
                        value={formData.email}
                        onChange={handleChange}
                        onFocus={() => setFocusedField('email')}
                        onBlur={handleBlur}
                      />
                      <div className="input-glow" />
                    </div>
                    {fieldErrors.email && (
                      <p className="error-message">{fieldErrors.email}</p>
                    )}
                  </div>
                )}

                <button type="button" onClick={handleNext} className="submit-button">
                  <span>下一步</span>
                  <ArrowRightIcon size={18} className="button-arrow" />
                </button>
              </div>
            )}

            {/* 步骤 2：密码设置 */}
            {currentStep === 2 && (
              <div className="form-step animate-fade-in">
                <div className={`input-group ${focusedField === 'password' ? 'focused' : ''} ${fieldErrors.password ? 'error' : ''}`}>
                  <label htmlFor="password" className="input-label">
                    密码 <span className="required">*</span>
                  </label>
                  <div className="input-wrapper">
                    <LockIcon size={18} className={`input-icon ${focusedField === 'password' ? 'active' : ''}`} />
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      className="input-field"
                      placeholder="至少8位，包含大小写字母、数字和特殊字符"
                      value={formData.password}
                      onChange={handleChange}
                      onFocus={() => setFocusedField('password')}
                      onBlur={handleBlur}
                    />
                    <div className="input-glow" />
                  </div>
                  {formData.password && (
                    <div className="password-strength">
                      <div className="strength-bar">
                        <div 
                          className="strength-fill" 
                          style={{ 
                            width: `${(passwordStrength.strength / 4) * 100}%`,
                            background: passwordStrength.color 
                          }} 
                        />
                      </div>
                      <span className="strength-label" style={{ color: passwordStrength.color }}>
                        {passwordStrength.label}
                      </span>
                    </div>
                  )}
                  {fieldErrors.password && (
                    <p className="error-message">{fieldErrors.password}</p>
                  )}
                </div>

                <div className={`input-group ${focusedField === 'confirmPassword' ? 'focused' : ''} ${fieldErrors.confirmPassword ? 'error' : ''}`}>
                  <label htmlFor="confirmPassword" className="input-label">
                    确认密码 <span className="required">*</span>
                  </label>
                  <div className="input-wrapper">
                    <CheckCircleIcon size={18} className={`input-icon ${focusedField === 'confirmPassword' ? 'active' : ''}`} />
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      className="input-field"
                      placeholder="请再次输入密码"
                      value={confirmPassword}
                      onChange={handleChange}
                      onFocus={() => setFocusedField('confirmPassword')}
                      onBlur={handleBlur}
                    />
                    <div className="input-glow" />
                  </div>
                  {fieldErrors.confirmPassword && (
                    <p className="error-message">{fieldErrors.confirmPassword}</p>
                  )}
                </div>

                <div className="button-group">
                  <button type="button" onClick={handleBack} className="back-button-step">
                    <ArrowLeftIcon size={18} />
                    <span>返回</span>
                  </button>
                  <button type="submit" disabled={loading} className="submit-button">
                    {loading ? (
                      <>
                        <Loader2Icon size={18} className="animate-spin" />
                        <span>注册中...</span>
                      </>
                    ) : (
                      <>
                        <span>立即注册</span>
                        <ArrowRightIcon size={18} className="button-arrow" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* 登录链接 */}
          <div className="form-footer">
            <p className="login-text">
              已有账户？
              <button onClick={() => navigate('/login')} className="login-link">
                立即登录
              </button>
            </p>
          </div>

          {/* 底部特性图标 */}
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
        /* ===== 基础布局 ===== */
        .register-page {
          min-height: 100vh;
          display: flex;
          position: relative;
          overflow: hidden;
          font-family: var(--font-family-base);
          background: var(--bg-primary);
        }

        /* ===== 主题切换按钮 ===== */
        .theme-toggle-wrapper {
          position: fixed;
          top: 1.5rem;
          right: 1.5rem;
          z-index: 100;
        }

        /* ===== 主容器 - 居中布局 ===== */
        .register-container {
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

        /* ===== 注册卡片 ===== */
        .register-card {
          width: 100%;
          max-width: 440px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-default);
          border-radius: 24px;
          padding: 2rem 2.5rem;
          box-shadow: 
            0 25px 60px -15px rgba(0, 0, 0, 0.2),
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
          margin: 0 auto 0.75rem;
        }

        .logo-glow {
          position: absolute;
          inset: -8px;
          background: linear-gradient(135deg, var(--accent-500), var(--primary-500));
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
          font-size: 1.75rem;
          font-weight: 700;
          background: linear-gradient(135deg, var(--accent-500), var(--primary-500));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 0.25rem;
          letter-spacing: -0.02em;
        }

        .app-tagline {
          font-size: 0.875rem;
          color: var(--text-tertiary);
          font-weight: 400;
        }

        /* ===== 步骤指示器 ===== */
        .step-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1.25rem;
          padding: 0 0.5rem;
        }

        .step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.375rem;
          opacity: 0.4;
          transition: opacity 0.3s;
        }

        .step.active { opacity: 1; }
        .step.completed { opacity: 0.7; }

        .step-number {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--bg-tertiary);
          border: 2px solid var(--border-strong);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-tertiary);
          transition: all 0.3s;
        }

        .step.active .step-number {
          background: linear-gradient(135deg, var(--primary-600), var(--accent-600));
          border-color: transparent;
          color: white;
          box-shadow: 0 0 12px rgba(99, 102, 241, 0.3);
        }

        .step.completed .step-number {
          background: var(--success);
          border-color: transparent;
          color: white;
        }

        .step-label {
          font-size: 0.6875rem;
          font-weight: 500;
          color: var(--text-tertiary);
        }

        .step.active .step-label {
          color: var(--text-secondary);
        }

        .step-line {
          flex: 1;
          height: 2px;
          background: var(--border-default);
          margin: 0 0.75rem;
          margin-bottom: 1.25rem;
          max-width: 60px;
        }

        /* ===== 表单头部 ===== */
        .form-header {
          text-align: center;
          margin-bottom: 1.25rem;
        }

        .form-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 0.25rem;
        }

        .form-subtitle {
          font-size: 0.8125rem;
          color: var(--text-tertiary);
        }

        /* ===== 错误提示 ===== */
        .alert {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          border-radius: 10px;
          margin-bottom: 1rem;
          font-size: 0.875rem;
          animation: slide-up 0.3s ease-out;
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
        .register-form { display: flex; flex-direction: column; gap: 1rem; }
        .form-step { display: flex; flex-direction: column; gap: 1rem; }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }

        @keyframes fade-in {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }

        .input-group.error .input-field {
          border-color: var(--error);
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
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

        .required { color: var(--error); margin-left: 0.25rem; }

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
          padding: 0.75rem 1rem 0.75rem 2.75rem;
          background: var(--bg-primary);
          border: 1px solid var(--border-default);
          border-radius: 10px;
          color: var(--text-primary);
          font-size: 0.875rem;
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
          border-radius: 12px;
          background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
          opacity: 0;
          z-index: -1;
          transition: opacity 0.3s;
          filter: blur(8px);
        }

        .input-group.focused .input-glow { opacity: 0.3; }

        .error-message {
          font-size: 0.75rem;
          color: var(--error);
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        /* 密码强度 */
        .password-strength {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.375rem;
        }

        .strength-bar {
          flex: 1;
          height: 3px;
          background: var(--border-default);
          border-radius: 2px;
          overflow: hidden;
        }

        .strength-fill {
          height: 100%;
          border-radius: 2px;
          transition: all 0.3s;
        }

        .strength-label {
          font-size: 0.6875rem;
          font-weight: 500;
        }

        /* 按钮组 */
        .button-group {
          display: flex;
          gap: 0.75rem;
          margin-top: 0.25rem;
        }

        .submit-button {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 1.25rem;
          background: linear-gradient(135deg, var(--primary-600), var(--accent-600));
          border: none;
          border-radius: 10px;
          color: white;
          font-size: 0.875rem;
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

        .back-button-step {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 1.25rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-default);
          border-radius: 10px;
          color: var(--text-secondary);
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .back-button-step:hover {
          background: var(--bg-elevated);
          border-color: var(--border-strong);
        }

        /* 表单底部 */
        .form-footer {
          margin-top: 1.25rem;
          text-align: center;
          padding-top: 1.25rem;
          border-top: 1px solid var(--border-subtle);
        }

        .login-text {
          font-size: 0.875rem;
          color: var(--text-tertiary);
        }

        .login-link {
          color: var(--primary-500);
          background: none;
          border: none;
          cursor: pointer;
          font-weight: 600;
          margin-left: 0.25rem;
          transition: all 0.2s;
        }

        .login-link:hover {
          color: var(--primary-600);
          text-decoration: underline;
        }

        /* 特性图标栏 */
        .features-bar {
          display: flex;
          justify-content: center;
          gap: 1rem;
          margin-top: 1.25rem;
          padding-top: 1.25rem;
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
          background: linear-gradient(135deg, var(--accent-500), var(--primary-500));
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

        /* 版权信息 */
        .copyright {
          margin-top: 2rem;
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        /* 响应式设计 */
        @media (max-width: 480px) {
          .register-container { padding: 1rem; }
          .register-card { padding: 1.5rem; border-radius: 20px; }
          .logo-wrapper { width: 64px; height: 64px; }
          .app-title { font-size: 1.5rem; }
          .step-label { display: none; }
          .theme-toggle-wrapper { top: 1rem; right: 1rem; }
          .button-group { flex-direction: column; }
          .back-button-step { order: 2; }
        }

        /* 深色主题特殊处理 */
        [data-theme="dark"] .register-card {
          background: rgba(26, 29, 33, 0.85);
          backdrop-filter: blur(20px);
          box-shadow: 
            0 25px 60px -15px rgba(0, 0, 0, 0.5),
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

export default Register;
