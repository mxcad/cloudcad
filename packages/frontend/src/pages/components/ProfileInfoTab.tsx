import React, { useState } from 'react';
import {
  User,
  Mail,
  Phone,
  MessageCircle,
  Shield,
  Activity,
  Calendar,
  Sparkles,
  CheckCircle,
  XCircle,
  Edit,
  Save,
  X,
} from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { usersApi } from '../../services/usersApi';
import { useAuth } from '../../contexts/AuthContext';

interface ProfileInfoTabProps {
  user: {
    username?: string;
    email?: string | null;
    phone?: string | null;
    phoneVerified?: boolean;
    nickname?: string;
    status?: string;
    avatar?: string;
    wechatId?: string | null;
    createdAt?: string;
    lastLoginAt?: string;
  } | null;
}

export const ProfileInfoTab: React.FC<ProfileInfoTabProps> = ({ user }) => {
  const { isAdmin } = usePermission();
  const { refreshUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    username: user?.username || '',
    nickname: user?.nickname || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '-';
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await usersApi.updateProfile({
        username: formData.username,
        nickname: formData.nickname,
      });
      setSuccess('个人信息更新成功');
      await refreshUser();
      setIsEditing(false);
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '更新失败'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-content animate-fade-in">
      {success && (
        <div className="alert alert-success">
          <CheckCircle size={18} className="alert-icon" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="alert alert-error">
          <XCircle size={18} className="alert-icon" />
          <span>{error}</span>
        </div>
      )}

      {!isEditing ? (
        <>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-text-primary">个人信息</h2>
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
            >
              <Edit size={16} />
              <span>编辑</span>
            </button>
          </div>

          <div className="info-grid">
            <div className="info-card">
              <div className="info-icon-wrapper primary">
                <User size={20} />
              </div>
              <div className="info-content">
                <label>用户名</label>
                <span>{user?.username || '-'}</span>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon-wrapper accent">
                <User size={20} />
              </div>
              <div className="info-content">
                <label>昵称</label>
                <span>{user?.nickname || '-'}</span>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon-wrapper info">
                <Mail size={20} />
              </div>
              <div className="info-content">
                <label>邮箱地址</label>
                <span className="with-status">
                  {user?.email || '未绑定'}
                  {user?.email && (
                    <CheckCircle size={14} className="status-icon success" />
                  )}
                </span>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon-wrapper success">
                <Phone size={20} />
              </div>
              <div className="info-content">
                <label>手机号</label>
                <span className="with-status">
                  {user?.phone || '未绑定'}
                  {user?.phone && user?.phoneVerified && (
                    <CheckCircle size={14} className="status-icon success" />
                  )}
                </span>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon-wrapper purple">
                <MessageCircle size={20} />
              </div>
              <div className="info-content">
                <label>微信</label>
                <span className="with-status">
                  {user?.wechatId ? '已绑定' : '未绑定'}
                  {user?.wechatId ? (
                    <CheckCircle size={14} className="status-icon success" />
                  ) : (
                    <XCircle size={14} className="status-icon muted" />
                  )}
                </span>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon-wrapper success">
                <Shield size={20} />
              </div>
              <div className="info-content">
                <label>账户角色</label>
                <span className="role-badge">{isAdmin() ? '系统管理员' : '普通用户'}</span>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon-wrapper warning">
                <Activity size={20} />
              </div>
              <div className="info-content">
                <label>账户状态</label>
                <span className={`status-badge ${user?.status?.toLowerCase() || 'active'}`}>
                  {user?.status === 'ACTIVE'
                    ? '正常'
                    : user?.status === 'INACTIVE'
                      ? '未激活'
                      : '已禁用'}
                </span>
              </div>
            </div>

            {user?.createdAt && (
              <div className="info-card">
                <div className="info-icon-wrapper info">
                  <Calendar size={20} />
                </div>
                <div className="info-content">
                  <label>创建时间</label>
                  <span>{formatDate(user.createdAt)}</span>
                </div>
              </div>
            )}

            {user?.lastLoginAt && (
              <div className="info-card">
                <div className="info-icon-wrapper purple">
                  <Sparkles size={20} />
                </div>
                <div className="info-content">
                  <label>最后登录</label>
                  <span>{formatDate(user.lastLoginAt)}</span>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="edit-profile-form">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-text-primary">编辑个人信息</h2>
            <button
              onClick={() => {
                setIsEditing(false);
                setFormData({
                  username: user?.username || '',
                  nickname: user?.nickname || '',
                });
                setError(null);
                setSuccess(null);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
            >
              <X size={16} />
              <span>取消</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="input-group">
              <label className="input-label">用户名</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder="请输入用户名"
                  minLength={3}
                  maxLength={20}
                  required
                />
              </div>
              <p className="text-sm text-text-muted mt-1">用户名一月内最多修改3次</p>
            </div>

            <div className="input-group">
              <label className="input-label">昵称</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  name="nickname"
                  value={formData.nickname}
                  onChange={handleInputChange}
                  placeholder="请输入昵称"
                  maxLength={50}
                />
              </div>
            </div>

            <div className="button-group">
              <button
                type="submit"
                className="submit-button"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>保存中...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>保存</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      <style>{`
        .with-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .status-icon {
          flex-shrink: 0;
        }
        .status-icon.success {
          color: var(--success);
        }
        .status-icon.warning {
          color: var(--warning);
        }
        .status-icon.muted {
          color: var(--text-muted);
        }
        .edit-profile-form {
          background: var(--bg-primary);
          border: 1px solid var(--border-default);
          border-radius: 16px;
          padding: 2rem;
        }
        .input-group {
          margin-bottom: 1.5rem;
        }
        .input-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
        }
        .input-wrapper input {
          width: 100%;
          padding: 0.875rem 1rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          color: var(--text-primary);
          font-size: 0.9375rem;
          transition: all 0.2s;
          outline: none;
        }
        .input-wrapper input:hover {
          border-color: var(--border-strong);
        }
        .input-wrapper input:focus {
          border-color: var(--primary-500);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        .input-wrapper input::placeholder {
          color: var(--text-muted);
        }
        .button-group {
          display: flex;
          gap: 1rem;
          margin-top: 2rem;
        }
        .submit-button {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
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
        .submit-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .flex {
          display: flex;
        }
        .justify-between {
          justify-content: space-between;
        }
        .items-center {
          align-items: center;
        }
        .mb-4 {
          margin-bottom: 1rem;
        }
        .mb-2 {
          margin-bottom: 0.5rem;
        }
        .mt-1 {
          margin-top: 0.25rem;
        }
        .mt-2 {
          margin-top: 0.5rem;
        }
        .px-4 {
          padding-left: 1rem;
          padding-right: 1rem;
        }
        .py-2 {
          padding-top: 0.5rem;
          padding-bottom: 0.5rem;
        }
        .bg-gray-200 {
          background-color: #e5e7eb;
        }
        .hover\:bg-gray-300:hover {
          background-color: #d1d5db;
        }
        .text-gray-700 {
          color: #374151;
        }
        .rounded-lg {
          border-radius: 0.5rem;
        }
        .transition-colors {
          transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;
          transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
          transition-duration: 150ms;
        }
        .space-y-4 > * + * {
          margin-top: 1rem;
        }
        .text-xl {
          font-size: 1.25rem;
        }
        .font-semibold {
          font-weight: 600;
        }
        .text-text-primary {
          color: var(--text-primary);
        }
        .text-sm {
          font-size: 0.875rem;
        }
        .text-text-muted {
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
};
