import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const EmailVerification: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyEmailAndLogin, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState<string>('');

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
    } catch (err: any) {
setError(
        err.response?.data?.message || '验证失败，请检查验证码是否正确或已过期'
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

  const handleResendEmail = async () => {
    // 这里可以添加重发邮件的逻辑
    // 暂时提示用户联系客服
    alert('如需重新发送验证邮件，请联系客服或重新注册');
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full text-center">
          <div className="mb-4">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            邮箱验证成功！
          </h2>
          <p className="text-gray-600">账号已激活，即将自动跳转到登录页...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full text-center">
          <div className="mb-4">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
              <svg
                className="animate-spin h-6 w-6 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            正在验证邮箱...
          </h2>
          <p className="text-gray-600">请稍候，我们正在验证您的邮箱</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="text-center">
          <div className="mb-4">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
              <svg
                className="h-6 w-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                ></path>
              </svg>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            验证您的邮箱
          </h2>

          {email && (
            <p className="text-gray-600 mb-6">
              我们已向 <span className="font-medium">{email}</span>{' '}
              发送了验证邮件
            </p>
          )}

          {email && (
            <p className="text-gray-600 mb-6">
              我们已向 <span className="font-medium">{email}</span> 发送了验证码
            </p>
          )}

          {!email && (
            <p className="text-gray-600 mb-6">请输入您收到的6位数字验证码</p>
          )}

          {error && (
            <div className="rounded-md bg-red-50 p-4 mb-6">
              <div className="text-sm text-red-800">{error}</div>
            </div>
          )}

          <div className="space-y-4 mb-6">
            <div>
              <label
                htmlFor="code"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                验证码
              </label>
              <input
                id="code"
                type="text"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => {
                  // 只允许数字
                  const value = e.target.value.replace(/\D/g, '');
                  setVerificationCode(value);
                  if (error) setError(null);
                }}
                placeholder="请输入6位数字验证码"
                className="w-full px-3 py-2 text-center text-xl tracking-widest border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                style={{ letterSpacing: '0.5em' }}
              />
              <p className="text-xs text-gray-500 mt-1">
                验证码为6位数字，请查看邮件
              </p>
            </div>

            <button
              onClick={handleVerifyCode}
              disabled={loading || verificationCode.length !== 6}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '验证中...' : '验证'}
            </button>
          </div>

          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              <p className="mb-2">没有收到邮件？</p>
              <ul className="text-left space-y-1">
                <li>• 检查垃圾邮件文件夹</li>
                <li>• 确认邮箱地址正确</li>
                <li>• 验证码15分钟内有效</li>
              </ul>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleResendEmail}
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                重新发送验证邮件
              </button>

              <button
                onClick={() => navigate('/login')}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
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
