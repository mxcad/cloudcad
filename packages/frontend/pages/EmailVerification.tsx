import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services/authApi';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { APP_NAME, APP_LOGO } from '../constants/appConfig';

const RESEND_COOLDOWN_SECONDS = 60;

export const EmailVerification: React.FC = () => {
  useDocumentTitle('邮箱验证');
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyEmailAndLogin, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState<string>('');
  
  // 重发验证码相关状态
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSuccess, setResendSuccess] = useState(false);

  useEffect(() => {
    // 如果已经登录，跳转到首页
    if (isAuthenticated) {
      navigate('/', { replace: true });
      return;
    }

    // 从state获取email（注册后传递的）
    const stateEmail = location.state?.email;
    if (stateEmail) {
      setEmail(stateEmail);
    }
  }, [location, navigate, isAuthenticated]);

  // 倒计时处理
  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleVerifyEmail = async (code: string) => {
    if (!email) {
      setError('邮箱地址缺失，请重新注册');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await verifyEmailAndLogin(email, code);
      setSuccess(true);
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
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

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      setError('请输入验证码');
      return;
    }
    if (verificationCode.length !== 6) {
      setError('验证码应为6位数字');
      return;
    }
    await handleVerifyEmail(verificationCode.trim());
  };

  const handleResendEmail = useCallback(async () => {
    if (!email) {
      setError('邮箱地址缺失，请重新注册');
      return;
    }

    if (resendCooldown > 0 || resendLoading) {
      return;
    }

    setResendLoading(true);
    setError(null);
    setResendSuccess(false);

    try {
      await authApi.resendVerification(email);
      setResendSuccess(true);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      // 5秒后隐藏成功提示
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

  if (success) {
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
          {/* 成功图标 */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-success-100 mb-6 animate-scale-in">
              <svg
                className="w-12 h-12 text-success-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              邮箱验证成功！
            </h2>
            <p className="text-slate-600">
              账号已激活，即将自动跳转到登录页...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
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
          {/* 加载图标 */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-primary-100 mb-6">
              <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              正在验证邮箱...
            </h2>
            <p className="text-slate-600">请稍候，我们正在验证您的邮箱</p>
          </div>
        </div>
      </div>
    );
  }

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
                const fallback = e.currentTarget.nextElementSibling as SVGElement;
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
          <p className="text-slate-600">验证您的邮箱地址</p>
        </div>

        {/* 验证卡片 */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
          {email && (
            <p className="text-center text-slate-600 mb-6">
              我们已向{' '}
              <span className="font-semibold text-primary-600">{email}</span>{' '}
              发送了验证码
            </p>
          )}

          {!email && (
            <p className="text-center text-slate-600 mb-6">
              请输入您收到的6位数字验证码
            </p>
          )}

          {error && (
            <div className="rounded-xl bg-error-50 border border-error-200 p-4 mb-6 animate-slide-up">
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

          <div className="space-y-6 mb-6">
            <div>
              <label
                htmlFor="code"
                className="block text-sm font-semibold text-slate-700 mb-2"
              >
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
                className="w-full px-4 py-3 text-center text-2xl tracking-[0.5em] bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all font-mono"
              />
              <p className="text-xs text-slate-500 mt-2 text-center">
                验证码为6位数字，请查看邮件
              </p>
            </div>

            <button
              onClick={handleVerifyCode}
              disabled={loading || verificationCode.length !== 6}
              className="group w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-xl text-white gradient-primary shadow-primary-custom hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  验证中...
                </span>
              ) : (
                '验证'
              )}
            </button>
          </div>

          <div className="space-y-4">
            <div className="text-sm text-slate-600 bg-slate-50 rounded-xl p-4">
              <p className="font-semibold mb-2">没有收到邮件？</p>
              <ul className="space-y-1 text-slate-500">
                <li className="flex items-start gap-2">
                  <svg
                    className="w-4 h-4 mt-0.5 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                  检查垃圾邮件文件夹
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    className="w-4 h-4 mt-0.5 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                  确认邮箱地址正确
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    className="w-4 h-4 mt-0.5 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                  验证码15分钟内有效
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              {/* 重发成功提示 */}
              {resendSuccess && (
                <div className="rounded-xl bg-success-50 border border-success-200 p-4 animate-slide-up">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-success-600 flex-shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span className="text-sm text-success-800">
                      验证邮件已重新发送，请查收
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={handleResendEmail}
                disabled={resendCooldown > 0 || resendLoading || !email}
                className="w-full flex justify-center py-3 px-4 border border-slate-200 text-sm font-semibold rounded-xl text-slate-700 bg-white hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resendLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    发送中...
                  </span>
                ) : resendCooldown > 0 ? (
                  `${resendCooldown}秒后可重新发送`
                ) : (
                  '重新发送验证邮件'
                )}
              </button>

              <button
                onClick={() => navigate('/login')}
                className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-slate-700 hover:bg-slate-800 transition-all"
              >
                返回登录
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
