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
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { usePermission } from '../../hooks/usePermission';
import { useProfileUpdate } from '../Profile/hooks/useProfileUpdate';
import { Input } from '@/components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';

interface ProfileInfoTabProps {
  user: {
    username?: string;
    email?: string | { [key: string]: unknown } | null;
    phone?: string | { [key: string]: unknown } | null;
    phoneVerified?: boolean;
    nickname?: string;
    status?: string;
    avatar?: string;
    wechatId?: string | { [key: string]: unknown } | null;
    createdAt?: string;
    lastLoginAt?: string;
  } | null;
}

export const ProfileInfoTab: React.FC<ProfileInfoTabProps> = ({ user }) => {
  const { isAdmin } = usePermission();
  const { refreshUser } = useAuth();
  const { updateProfile, loading } = useProfileUpdate();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    username: user?.username || '',
    nickname: user?.nickname || '',
  });
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
    setError(null);
    setSuccess(null);

    try {
      await updateProfile({
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
            <Button onClick={() => setIsEditing(true)} icon={Edit}>
              <span>编辑</span>
            </Button>
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
                  {typeof user?.email === 'string' ? user.email : '未绑定'}
                  {typeof user?.email === 'string' && (
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
                  {typeof user?.phone === 'string' ? user.phone : '未绑定'}
                  {typeof user?.phone === 'string' && user?.phoneVerified && (
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
                <Tag variant="primary">{isAdmin() ? '系统管理员' : '普通用户'}</Tag>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon-wrapper warning">
                <Activity size={20} />
              </div>
              <div className="info-content">
                <label>账户状态</label>
                <Tag variant={user?.status === 'ACTIVE' ? 'success' : user?.status === 'INACTIVE' ? 'warning' : 'error'}>
                  {user?.status === 'ACTIVE'
                    ? '正常'
                    : user?.status === 'INACTIVE'
                      ? '未激活'
                      : '已禁用'}
                </Tag>
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
            <Button
              variant="secondary"
              icon={X}
              onClick={() => {
                setIsEditing(false);
                setFormData({
                  username: user?.username || '',
                  nickname: user?.nickname || '',
                });
                setError(null);
                setSuccess(null);
              }}
            >
              <span>取消</span>
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="input-group">
              <label className="input-label">用户名</label>
              <div className="input-wrapper">
                <Input
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
                <Input
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
              <Button
                type="submit"
                variant="primary"
                loading={loading}
                icon={Save}
              >
                {loading ? <span>保存中...</span> : <span>保存</span>}
              </Button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
