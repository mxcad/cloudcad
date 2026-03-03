import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { usersApi } from '../services/usersApi';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export const Profile: React.FC = () => {
  useDocumentTitle('个人资料');
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { isAdmin } = usePermission();
  const [activeTab, setActiveTab] = useState<'info' | 'password'>('info');
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordForm((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (error) setError(null);
    if (success) setSuccess(null);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('两次输入的新密码不一致');
      setLoading(false);
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setError('新密码至少需要6个字符');
      setLoading(false);
      return;
    }

    try {
      await usersApi.changePassword({
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
      });

      try {
        await logout();
      } catch (logoutErr) {
        console.error('Logout error during password change:', logoutErr);
      }

      navigate('/login', {
        state: { message: '密码已修改，请使用新密码登录' },
      });
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '密码修改失败'
      );
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex">
            <button
              onClick={() => setActiveTab('info')}
              className={`${
                activeTab === 'info'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
            >
              个人信息
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`${
                activeTab === 'password'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
            >
              修改密码
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'info' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900">
                  个人信息
                </h3>
                <p className="mt-1 text-sm text-gray-500">查看您的账户信息</p>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    用户名
                  </label>
                  <div className="mt-1 text-sm text-gray-900">
                    {user?.username}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    邮箱
                  </label>
                  <div className="mt-1 text-sm text-gray-900">
                    {user?.email}
                  </div>
                </div>

                {user?.nickname && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      昵称
                    </label>
                    <div className="mt-1 text-sm text-gray-900">
                      {user.nickname}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    角色
                  </label>
                  <div className="mt-1">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                      {isAdmin() ? '管理员' : '普通用户'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    账户状态
                  </label>
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user?.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-800'
                          : user?.status === 'INACTIVE'
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {user?.status === 'ACTIVE'
                        ? '正常'
                        : user?.status === 'INACTIVE'
                          ? '未激活'
                          : '已禁用'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'password' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900">
                  修改密码
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  请输入旧密码和新密码
                </p>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-6">
                {error && (
                  <div className="rounded-md bg-red-50 p-4">
                    <div className="text-sm text-red-800">{error}</div>
                  </div>
                )}

                {success && (
                  <div className="rounded-md bg-green-50 p-4">
                    <div className="text-sm text-green-800">{success}</div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="oldPassword"
                    className="block text-sm font-medium text-gray-700"
                  >
                    旧密码
                  </label>
                  <input
                    type="password"
                    name="oldPassword"
                    id="oldPassword"
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={passwordForm.oldPassword}
                    onChange={handlePasswordChange}
                  />
                </div>

                <div>
                  <label
                    htmlFor="newPassword"
                    className="block text-sm font-medium text-gray-700"
                  >
                    新密码
                  </label>
                  <input
                    type="password"
                    name="newPassword"
                    id="newPassword"
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="至少6个字符"
                    value={passwordForm.newPassword}
                    onChange={handlePasswordChange}
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-gray-700"
                  >
                    确认新密码
                  </label>
                  <input
                    type="password"
                    name="confirmPassword"
                    id="confirmPassword"
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={passwordForm.confirmPassword}
                    onChange={handlePasswordChange}
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? '修改中...' : '修改密码'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
