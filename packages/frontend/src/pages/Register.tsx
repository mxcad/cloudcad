import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { validateField, validateRegisterForm } from '../utils/validation';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { APP_NAME, APP_LOGO } from '../constants/appConfig';
import type { RegisterDto } from '../types/api-client';

export const Register: React.FC = () => {
  useDocumentTitle('注册');
  const navigate = useNavigate();
  const {
    register: registerUser,
    isAuthenticated,
    loading: authLoading,
  } = useAuth();
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

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === 'confirmPassword') {
      setConfirmPassword(value);
      // 实时验证确认密码
      if (touched.confirmPassword) {
        if (value && formData.password !== value) {
          setFieldErrors((prev) => ({
            ...prev,
            confirmPassword: '两次输入的密码不一致',
          }));
        } else {
          setFieldErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors.confirmPassword;
            return newErrors;
          });
        }
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));

      // 实时验证字段（仅在该字段已触碰后）
      if (touched[name]) {
        const fieldError = validateField(
          name as keyof typeof import('../utils/validation').ValidationRules,
          value
        );

        if (fieldError) {
          setFieldErrors((prev) => ({
            ...prev,
            [name]: fieldError,
          }));
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
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));

    // 失焦时验证
    if (name === 'confirmPassword') {
      if (value && formData.password !== value) {
        setFieldErrors((prev) => ({
          ...prev,
          confirmPassword: '两次输入的密码不一致',
        }));
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
        setFieldErrors((prev) => ({
          ...prev,
          [name]: fieldError,
        }));
      } else {
        setFieldErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
      }
    }
  };

  const validateForm = () => {
    const error = validateRegisterForm({
      ...formData,
      confirmPassword,
    });

    if (error) {
      setError(error);
      return false;
    }

    if (Object.keys(fieldErrors).length > 0) {
      setError('请修正表单错误');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[Register] 开始注册:', formData.email);
      await registerUser(formData);
      console.log('[Register] 注册成功，跳转到验证页面');
      // 跳转到邮箱验证页面
      navigate('/verify-email', {
        state: { email: formData.email },
        replace: true,
      });
    } catch (err) {
      console.error('[Register] 注册失败:', err);
      const axiosError = err as Error & {
        response?: {
          data?: {
            message?: string;
            error?: string;
            statusCode?: number;
          };
          status?: number;
          statusText?: string;
        };
      };

      console.error('[Register] 错误响应:', axiosError.response);

      // 优先使用后端返回的错误信息（apiClient 已将错误消息设置到 error.message）
      const errorMessage =
        axiosError.message ||
        (axiosError.response?.status === 409
          ? '用户名或邮箱已被使用'
          : axiosError.response?.statusText) ||
        '注册失败，请稍后重试';

      console.error('[Register] 错误消息:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center gradient-hero py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-400/20 rounded-full blur-3xl animate-float" />
        <div
          className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent-400/20 rounded-full blur-3xl animate-float"
          style={{ animationDelay: '1s' }}
        />
      </div>

      <div className="max-w-md w-full relative z-10 animate-scale-in">
        {/* Logo 和标题 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl gradient-primary shadow-primary-custom mb-6 animate-float overflow-hidden">
            <img
              src={APP_LOGO}
              alt={APP_NAME}
              className="w-full h-full object-contain p-2"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget
                  .nextElementSibling as SVGElement;
                if (fallback) fallback.style.display = 'block';
              }}
            />
            <svg
              className="w-10 h-10 text-white hidden"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <h2 className="text-4xl font-bold text-slate-900 mb-2">
            <span className="text-gradient-primary">{APP_NAME}</span>
          </h2>
          <p className="text-slate-600">创建您的账户，开启云端 CAD 之旅</p>
        </div>

        {/* 注册卡片 */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-xl bg-error-50 border border-error-200 p-4 animate-slide-up">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-error-600 mt-0.5 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <div className="text-sm text-error-800">{error}</div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-semibold text-slate-700 mb-2"
                >
                  用户名 <span className="text-error-500">*</span>
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    className={`w-full pl-12 pr-4 py-3 bg-slate-50 border ${
                      fieldErrors.username
                        ? 'border-error-500'
                        : 'border-slate-200'
                    } rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all`}
                    placeholder="请输入用户名"
                    value={formData.username}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                </div>
                {fieldErrors.username && (
                  <p className="mt-1.5 text-sm text-error-600 flex items-center gap-1">
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {fieldErrors.username}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="nickname"
                  className="block text-sm font-semibold text-slate-700 mb-2"
                >
                  昵称
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <input
                    id="nickname"
                    name="nickname"
                    type="text"
                    className={`w-full pl-12 pr-4 py-3 bg-slate-50 border ${
                      fieldErrors.nickname
                        ? 'border-error-500'
                        : 'border-slate-200'
                    } rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all`}
                    placeholder="请输入昵称（可选）"
                    value={formData.nickname || ''}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                </div>
                {fieldErrors.nickname && (
                  <p className="mt-1.5 text-sm text-error-600">
                    {fieldErrors.nickname}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-semibold text-slate-700 mb-2"
                >
                  邮箱地址 <span className="text-error-500">*</span>
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className={`w-full pl-12 pr-4 py-3 bg-slate-50 border ${
                      fieldErrors.email
                        ? 'border-error-500'
                        : 'border-slate-200'
                    } rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all`}
                    placeholder="请输入邮箱地址"
                    value={formData.email}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                </div>
                {fieldErrors.email && (
                  <p className="mt-1.5 text-sm text-error-600">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-semibold text-slate-700 mb-2"
                >
                  密码 <span className="text-error-500">*</span>
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    className={`w-full pl-12 pr-4 py-3 bg-slate-50 border ${
                      fieldErrors.password
                        ? 'border-error-500'
                        : 'border-slate-200'
                    } rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all`}
                    placeholder="至少8位，包含大小写字母、数字和特殊字符"
                    value={formData.password}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                </div>
                {fieldErrors.password && (
                  <p className="mt-1.5 text-sm text-error-600">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-semibold text-slate-700 mb-2"
                >
                  确认密码 <span className="text-error-500">*</span>
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    className={`w-full pl-12 pr-4 py-3 bg-slate-50 border ${
                      fieldErrors.confirmPassword
                        ? 'border-error-500'
                        : 'border-slate-200'
                    } rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all`}
                    placeholder="请再次输入密码"
                    value={confirmPassword}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="mt-1.5 text-sm text-error-600">
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-xl text-white gradient-primary shadow-primary-custom hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  注册中...
                </span>
              ) : (
                '注册'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600">
              已有账户？{' '}
              <button
                onClick={() => navigate('/login')}
                className="font-semibold text-primary-600 hover:text-primary-700 transition-colors"
              >
                立即登录
              </button>
            </p>
          </div>
        </div>

        {/* 底部信息 */}
        <p className="mt-8 text-center text-xs text-slate-400">
          © 2026 {APP_NAME}. 专业云端 CAD 图纸管理平台
        </p>
      </div>
    </div>
  );
};
