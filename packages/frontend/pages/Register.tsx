import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { components } from '../types/api';
import { useAuth } from '../contexts/AuthContext';
import { validateField, validateRegisterForm } from '../utils/validation';

type RegisterDto = components['schemas']['RegisterDto'];

export const Register: React.FC = () => {
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
    console.log('[Register] 提交注册表单:', formData.email, formData.username);
    if (!validateForm()) {
      console.log('[Register] 表单验证失败');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[Register] 调用registerUser函数');
      await registerUser(formData);
      console.log('[Register] 注册成功，准备跳转到邮箱验证页面');
      // 跳转到邮箱验证页面
      navigate('/verify-email', {
        state: { email: formData.email },
        replace: true,
      });
    } catch (err: any) {
      console.error('[Register] 注册失败:', err);
      console.error('[Register] 错误详情:', err.response?.data);
      setError(err.response?.data?.message || '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            注册 CloudCAD 账户
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            已有账户？{' '}
            <button
              onClick={() => navigate('/login')}
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              立即登录
            </button>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-800">{error}</div>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700"
              >
                用户名 <span className="text-red-500">*</span>
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className={`mt-1 appearance-none relative block w-full px-3 py-2 border ${
                  fieldErrors.username ? 'border-red-500' : 'border-gray-300'
                } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                placeholder="请输入用户名"
                value={formData.username}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              {fieldErrors.username && (
                <p className="mt-1 text-sm text-red-600">
                  {fieldErrors.username}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="nickname"
                className="block text-sm font-medium text-gray-700"
              >
                昵称
              </label>
              <input
                id="nickname"
                name="nickname"
                type="text"
                className={`mt-1 appearance-none relative block w-full px-3 py-2 border ${
                  fieldErrors.nickname ? 'border-red-500' : 'border-gray-300'
                } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                placeholder="请输入昵称（可选）"
                value={formData.nickname || ''}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              {fieldErrors.nickname && (
                <p className="mt-1 text-sm text-red-600">
                  {fieldErrors.nickname}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                邮箱地址 <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className={`mt-1 appearance-none relative block w-full px-3 py-2 border ${
                  fieldErrors.email ? 'border-red-500' : 'border-gray-300'
                } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                placeholder="请输入邮箱地址"
                value={formData.email}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              {fieldErrors.email && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                密码 <span className="text-red-500">*</span>
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className={`mt-1 appearance-none relative block w-full px-3 py-2 border ${
                  fieldErrors.password ? 'border-red-500' : 'border-gray-300'
                } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                placeholder="至少8位，包含大小写字母、数字和特殊字符"
                value={formData.password}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              {fieldErrors.password && (
                <p className="mt-1 text-sm text-red-600">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700"
              >
                确认密码 <span className="text-red-500">*</span>
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                className={`mt-1 appearance-none relative block w-full px-3 py-2 border ${
                  fieldErrors.confirmPassword
                    ? 'border-red-500'
                    : 'border-gray-300'
                } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                placeholder="请再次输入密码"
                value={confirmPassword}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              {fieldErrors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">
                  {fieldErrors.confirmPassword}
                </p>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '注册中...' : '注册'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
