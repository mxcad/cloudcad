import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/authApi';
import { useRuntimeConfig } from '../contexts/RuntimeConfigContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { APP_NAME, APP_LOGO } from '../constants/appConfig';
import type { ForgotPasswordResponseDto } from '../types/api-client';

export const ForgotPassword: React.FC = () => {
  useDocumentTitle('忘记密码');
  const navigate = useNavigate();
  const { config: runtimeConfig } = useRuntimeConfig();
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
      
      // 检查邮件服务是否启用（响应拦截器已解包，response.data 是实际数据）
      // 由于拦截器在运行时修改了响应结构，需要双重断言
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

  // 显示客服联系信息（邮件服务未启用）
  if (supportInfo) {
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
          {/* 提示图标 */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-amber-100 mb-6 animate-scale-in">
              <svg
                className="w-12 h-12 text-amber-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              邮件服务未启用
            </h2>
            <p className="text-slate-600">
              无法通过邮件重置密码，请联系客服
            </p>
          </div>

          {/* 客服联系信息卡片 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-6 mb-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">客服联系方式</h3>
              <div className="space-y-3">
                {supportInfo.supportEmail && (
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <a href={`mailto:${supportInfo.supportEmail}`} className="text-primary-600 hover:text-primary-700 transition-colors">
                      {supportInfo.supportEmail}
                    </a>
                  </div>
                )}
                {supportInfo.supportPhone && (
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                    </svg>
                    <a href={`tel:${supportInfo.supportPhone}`} className="text-primary-600 hover:text-primary-700 transition-colors">
                      {supportInfo.supportPhone}
                    </a>
                  </div>
                )}
                {!supportInfo.supportEmail && !supportInfo.supportPhone && (
                  <p className="text-slate-500">暂无客服联系方式，请联系系统管理员</p>
                )}
              </div>
            </div>

            <button
              onClick={() => navigate('/login')}
              className="w-full flex justify-center py-3 px-4 border border-slate-200 text-sm font-semibold rounded-xl text-slate-700 hover:bg-slate-50 transition-all"
            >
              返回登录
            </button>
          </div>
        </div>
      </div>
    );
  }

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
              验证码已发送
            </h2>
            <p className="text-slate-600">
              我们已向{' '}
              <span className="font-semibold text-primary-600">{email}</span>{' '}
              发送了验证码
            </p>
          </div>

          {/* 成功卡片 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
            <div className="rounded-xl bg-success-50 border border-success-200 p-4 mb-6">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
                <div className="text-sm text-success-800">
                  请查收邮件并使用验证码重置密码
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate('/reset-password', { state: { email } })}
              className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-xl text-white gradient-primary shadow-primary-custom hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 mb-4"
            >
              前往重置密码
            </button>

            <button
              onClick={() => navigate('/login')}
              className="w-full flex justify-center py-3 px-4 border border-slate-200 text-sm font-semibold rounded-xl text-slate-700 hover:bg-slate-50 transition-all"
            >
              返回登录
            </button>
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
          <p className="text-slate-600">找回您的账户密码</p>
        </div>

        {/* 忘记密码卡片 */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
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

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-slate-700 mb-2"
              >
                邮箱地址
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
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  placeholder="请输入邮箱地址"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
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
                  发送中...
                </span>
              ) : (
                '发送验证码'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-sm text-slate-600 hover:text-primary-600 transition-colors"
            >
              返回登录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
