import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useRuntimeConfig } from '../contexts/RuntimeConfigContext';
import { usePermission } from '../hooks/usePermission';
import { usersApi } from '../services/usersApi';
import { authApi } from '../services/authApi';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { AuthLayout } from '../components/AuthLayout';
import { formatDateTime } from '../utils/dateUtils';

// 导入 lucide 图标
import UserIcon from 'lucide-react/dist/esm/icons/user';
import MailIcon from 'lucide-react/dist/esm/icons/mail';
import ShieldIcon from 'lucide-react/dist/esm/icons/shield';
import KeyIcon from 'lucide-react/dist/esm/icons/key';
import CheckCircleIcon from 'lucide-react/dist/esm/icons/check-circle';
import AlertCircleIcon from 'lucide-react/dist/esm/icons/alert-circle';
import Loader2Icon from 'lucide-react/dist/esm/icons/loader-2';
import SaveIcon from 'lucide-react/dist/esm/icons/save';
import LockIcon from 'lucide-react/dist/esm/icons/lock';
import EyeIcon from 'lucide-react/dist/esm/icons/eye';
import EyeOffIcon from 'lucide-react/dist/esm/icons/eye-off';
import CrownIcon from 'lucide-react/dist/esm/icons/crown';
import ActivityIcon from 'lucide-react/dist/esm/icons/activity';
import CalendarIcon from 'lucide-react/dist/esm/icons/calendar';
import SparklesIcon from 'lucide-react/dist/esm/icons/sparkles';
import SendIcon from 'lucide-react/dist/esm/icons/send';

/**
 * 个人信息页面 - CloudCAD
 * 
 * 使用 AuthLayout 统一布局
 */
export const Profile: React.FC = () => {
  useDocumentTitle('个人资料');
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuth();
  const { config: runtimeConfig } = useRuntimeConfig();
  const { isAdmin } = usePermission();

  const mailEnabled = runtimeConfig.mailEnabled;

  // 标签页状态
  const [activeTab, setActiveTab] = useState<'info' | 'password' | 'email'>('info');

  // 密码表单
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState({
    old: false,
    new: false,
    confirm: false,
  });

  // 邮箱表单
  const [emailForm, setEmailForm] = useState({
    email: '',
    code: '',
  });
  const [emailStep, setEmailStep] = useState<'input' | 'verify'>('input');

  // 加载和消息状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // 密码强度计算
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
    return { strength: score, label: levels[score].label, color: levels[score].color };
  };

  const passwordStrength = getPasswordStrength(passwordForm.newPassword);

  // 处理密码表单变化
  const handlePasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
    if (success) setSuccess(null);
  }, [error, success]);

  // 处理邮箱表单变化
  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEmailForm((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
    if (success) setSuccess(null);
  }, [error, success]);

  // 提交密码修改
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

  // 发送绑定邮箱验证码
  const handleSendBindCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!emailForm.email) {
      setError('请输入邮箱地址');
      setLoading(false);
      return;
    }

    try {
      await authApi.sendBindEmailCode(emailForm.email);
      setEmailStep('verify');
      setSuccess('验证码已发送到您的邮箱');
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '发送验证码失败'
      );
    } finally {
      setLoading(false);
    }
  };

  // 验证绑定邮箱
  const handleVerifyBindEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await authApi.verifyBindEmail(emailForm.email, emailForm.code);
      setSuccess('邮箱绑定成功');
      setEmailStep('input');
      setEmailForm({ email: '', code: '' });
      await refreshUser();
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '验证失败'
      );
    } finally {
      setLoading(false);
    }
  };

  // 切换标签页
  const switchTab = (tab: 'info' | 'password' | 'email') => {
    setActiveTab(tab);
    setError(null);
    setSuccess(null);
  };

  return (
    <AuthLayout showFeatures={true} showBackButton={true} onBack={() => navigate(-1)}>
      {/* 头部区域 */}
      <div className="profile-header">
        <div className="avatar-section">
          <div className="avatar-wrapper">
            <div className="avatar-glow" />
            {user?.avatar ? (
              <img src={user.avatar} alt="Avatar" className="avatar-image" />
            ) : (
              <div className="avatar-placeholder">
                <UserIcon size={40} />
              </div>
            )}
            <div className="avatar-badge">
              <CrownIcon size={12} />
            </div>
          </div>
          <div className="user-info">
            <h1 className="user-name">{user?.nickname || user?.username || '用户'}</h1>
            <p className="user-role">
              <ShieldIcon size={14} />
              {isAdmin() ? '系统管理员' : '普通用户'}
            </p>
          </div>
        </div>
      </div>

      {/* 标签页导航 */}
      <div className="tabs-container">
        <button
          onClick={() => switchTab('info')}
          className={`tab-button ${activeTab === 'info' ? 'active' : ''}`}
        >
          <UserIcon size={16} />
          <span>个人信息</span>
        </button>
        <button
          onClick={() => switchTab('password')}
          className={`tab-button ${activeTab === 'password' ? 'active' : ''}`}
        >
          <KeyIcon size={16} />
          <span>修改密码</span>
        </button>
        <button
          onClick={() => switchTab('email')}
          className={`tab-button ${activeTab === 'email' ? 'active' : ''}`}
        >
          <MailIcon size={16} />
          <span>邮箱绑定</span>
        </button>
        {/* 活跃指示器背景 */}
        <div 
          className="tab-indicator"
          style={{
            transform: `translateX(${activeTab === 'info' ? 0 : activeTab === 'password' ? 100 : 200}%)`
          }}
        />
      </div>

      {/* 消息提示 */}
      {success && (
        <div className="profile-alert alert-success">
          <CheckCircleIcon size={18} className="alert-icon" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="profile-alert alert-error">
          <AlertCircleIcon size={18} className="alert-icon" />
          <span>{error}</span>
        </div>
      )}

      {/* 内容区域 */}
      <div className="profile-content">
        {/* 个人信息标签 */}
        {activeTab === 'info' && (
          <div className="tab-content animate-fade-in">
            <div className="info-grid">
              <div className="info-card">
                <div className="info-icon-wrapper primary">
                  <UserIcon size={20} />
                </div>
                <div className="info-content">
                  <label>用户名</label>
                  <span>{user?.username || '-'}</span>
                </div>
              </div>

              <div className="info-card">
                <div className="info-icon-wrapper accent">
                  <MailIcon size={20} />
                </div>
                <div className="info-content">
                  <label>邮箱地址</label>
                  <span>{user?.email || '未绑定'}</span>
                </div>
              </div>

              <div className="info-card">
                <div className="info-icon-wrapper success">
                  <ShieldIcon size={20} />
                </div>
                <div className="info-content">
                  <label>账户角色</label>
                  <span className="role-badge">
                    {isAdmin() ? '系统管理员' : '普通用户'}
                  </span>
                </div>
              </div>

              <div className="info-card">
                <div className="info-icon-wrapper warning">
                  <ActivityIcon size={20} />
                </div>
                <div className="info-content">
                  <label>账户状态</label>
                  <span className={`status-badge ${user?.status?.toLowerCase() || 'active'}`}>
                    {user?.status === 'ACTIVE' ? '正常' : user?.status === 'INACTIVE' ? '未激活' : '已禁用'}
                  </span>
                </div>
              </div>

              <div className="info-card">
                <div className="info-icon-wrapper info">
                  <CalendarIcon size={20} />
                </div>
                <div className="info-content">
                  <label>创建时间</label>
                  <span>{user?.createdAt ? formatDateTime(user.createdAt) : '-'}</span>
                </div>
              </div>

              <div className="info-card">
                <div className="info-icon-wrapper purple">
                  <SparklesIcon size={20} />
                </div>
                <div className="info-content">
                  <label>最后登录</label>
                  <span>{user?.lastLoginAt ? formatDateTime(user.lastLoginAt) : '-'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 修改密码标签 */}
        {activeTab === 'password' && (
          <div className="tab-content animate-fade-in">
            <form onSubmit={handlePasswordSubmit} className="password-form">
              <div className={`input-group ${focusedField === 'oldPassword' ? 'focused' : ''}`}>
                <label className="input-label">
                  <LockIcon size={14} />
                  当前密码
                </label>
                <div className="input-wrapper">
                  <input
                    type={showPassword.old ? 'text' : 'password'}
                    name="oldPassword"
                    value={passwordForm.oldPassword}
                    onChange={handlePasswordChange}
                    onFocus={() => setFocusedField('oldPassword')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="请输入当前密码"
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword(p => ({ ...p, old: !p.old }))}
                  >
                    {showPassword.old ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                  <div className="input-glow" />
                </div>
              </div>

              <div className={`input-group ${focusedField === 'newPassword' ? 'focused' : ''}`}>
                <label className="input-label">
                  <KeyIcon size={14} />
                  新密码
                </label>
                <div className="input-wrapper">
                  <input
                    type={showPassword.new ? 'text' : 'password'}
                    name="newPassword"
                    value={passwordForm.newPassword}
                    onChange={handlePasswordChange}
                    onFocus={() => setFocusedField('newPassword')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="至少8位，包含大小写字母和数字"
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword(p => ({ ...p, new: !p.new }))}
                  >
                    {showPassword.new ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                  <div className="input-glow" />
                </div>
                {passwordForm.newPassword && (
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
              </div>

              <div className={`input-group ${focusedField === 'confirmPassword' ? 'focused' : ''}`}>
                <label className="input-label">
                  <CheckCircleIcon size={14} />
                  确认新密码
                </label>
                <div className="input-wrapper">
                  <input
                    type={showPassword.confirm ? 'text' : 'password'}
                    name="confirmPassword"
                    value={passwordForm.confirmPassword}
                    onChange={handlePasswordChange}
                    onFocus={() => setFocusedField('confirmPassword')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="请再次输入新密码"
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword(p => ({ ...p, confirm: !p.confirm }))}
                  >
                    {showPassword.confirm ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                  <div className="input-glow" />
                </div>
              </div>

              <button type="submit" disabled={loading} className="submit-button">
                {loading ? (
                  <>
                    <Loader2Icon size={18} className="animate-spin" />
                    <span>修改中...</span>
                  </>
                ) : (
                  <>
                    <SaveIcon size={18} />
                    <span>保存修改</span>
                  </>
                )}
              </button>

              <div className="security-tips">
                <h4>
                  <ShieldIcon size={14} />
                  安全提示
                </h4>
                <ul>
                  <li>密码长度至少 8 位</li>
                  <li>包含大小写字母、数字和特殊字符</li>
                  <li>修改密码后需要重新登录</li>
                </ul>
              </div>
            </form>
          </div>
        )}

        {/* 邮箱绑定标签 */}
        {activeTab === 'email' && (
          <div className="tab-content animate-fade-in">
            {user?.email ? (
              <div className="email-bound">
                <div className="success-icon">
                  <CheckCircleIcon size={48} />
                </div>
                <h3>邮箱已绑定</h3>
                <p className="bound-email">{user.email}</p>
                <div className="benefits">
                  <div className="benefit-item">
                    <CheckCircleIcon size={14} />
                    <span>可用于找回密码</span>
                  </div>
                  <div className="benefit-item">
                    <CheckCircleIcon size={14} />
                    <span>接收系统通知</span>
                  </div>
                  <div className="benefit-item">
                    <CheckCircleIcon size={14} />
                    <span>账户安全验证</span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {!mailEnabled ? (
                  <div className="email-disabled">
                    <div className="warning-icon">
                      <AlertCircleIcon size={48} />
                    </div>
                    <h3>邮件服务未启用</h3>
                    <p>请联系系统管理员开启邮件服务后，再进行邮箱绑定</p>
                  </div>
                ) : (
                  <div className="email-form">
                    {emailStep === 'input' ? (
                      <form onSubmit={handleSendBindCode}>
                        <div className={`input-group ${focusedField === 'email' ? 'focused' : ''}`}>
                          <label className="input-label">
                            <MailIcon size={14} />
                            邮箱地址
                          </label>
                          <div className="input-wrapper">
                            <input
                              type="email"
                              name="email"
                              value={emailForm.email}
                              onChange={handleEmailChange}
                              onFocus={() => setFocusedField('email')}
                              onBlur={() => setFocusedField(null)}
                              placeholder="请输入您的邮箱地址"
                              required
                            />
                            <div className="input-glow" />
                          </div>
                        </div>
                        <button type="submit" disabled={loading} className="submit-button">
                          {loading ? (
                            <>
                              <Loader2Icon size={18} className="animate-spin" />
                              <span>发送中...</span>
                            </>
                          ) : (
                            <>
                              <SendIcon size={18} />
                              <span>发送验证码</span>
                            </>
                          )}
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyBindEmail}>
                        <div className="email-preview">
                          <MailIcon size={20} />
                          <span>{emailForm.email}</span>
                        </div>
                        <div className={`input-group ${focusedField === 'code' ? 'focused' : ''}`}>
                          <label className="input-label">
                            <ShieldIcon size={14} />
                            验证码
                          </label>
                          <div className="input-wrapper">
                            <input
                              type="text"
                              name="code"
                              value={emailForm.code}
                              onChange={handleEmailChange}
                              onFocus={() => setFocusedField('code')}
                              onBlur={() => setFocusedField(null)}
                              placeholder="请输入6位验证码"
                              maxLength={6}
                              required
                            />
                            <div className="input-glow" />
                          </div>
                        </div>
                        <div className="button-group">
                          <button
                            type="button"
                            className="back-button-form"
                            onClick={() => setEmailStep('input')}
                          >
                            返回修改
                          </button>
                          <button type="submit" disabled={loading} className="submit-button">
                            {loading ? (
                              <>
                                <Loader2Icon size={18} className="animate-spin" />
                                <span>验证中...</span>
                              </>
                            ) : (
                              <>
                                <CheckCircleIcon size={18} />
                                <span>确认绑定</span>
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        /* ===== 头部区域 ===== */
        .profile-header {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .avatar-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .avatar-wrapper {
          position: relative;
          width: 80px;
          height: 80px;
        }

        .avatar-glow {
          position: absolute;
          inset: -4px;
          background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
          border-radius: 50%;
          opacity: 0.3;
          filter: blur(15px);
          animation: avatar-pulse 3s ease-in-out infinite;
        }

        @keyframes avatar-pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
        }

        .avatar-image,
        .avatar-placeholder {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
          z-index: 1;
          border: 3px solid var(--bg-secondary);
        }

        .avatar-placeholder {
          background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .avatar-badge {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 24px;
          height: 24px;
          background: linear-gradient(135deg, #f59e0b, #fbbf24);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          z-index: 2;
          border: 2px solid var(--bg-secondary);
        }

        .user-info {
          text-align: center;
        }

        .user-name {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 0.375rem;
        }

        .user-role {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.375rem;
          font-size: 0.875rem;
          color: var(--text-tertiary);
        }

        /* ===== 标签页导航 ===== */
        .tabs-container {
          position: relative;
          display: flex;
          padding: 0.5rem;
          background: var(--bg-tertiary);
          margin-bottom: 1.5rem;
          border-radius: var(--radius-xl);
        }

        .tab-button {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.625rem 1rem;
          background: transparent;
          border: none;
          border-radius: var(--radius-lg);
          color: var(--text-tertiary);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          z-index: 1;
        }

        .tab-button:hover {
          color: var(--text-secondary);
        }

        .tab-button.active {
          color: var(--text-primary);
        }

        .tab-indicator {
          position: absolute;
          top: 0.5rem;
          left: 0.5rem;
          width: calc(33.333% - 0.333rem);
          height: calc(100% - 1rem);
          background: var(--bg-secondary);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sm);
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 0;
        }

        /* ===== 消息提示 ===== */
        .profile-alert {
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

        @keyframes slide-up {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ===== 内容区域 ===== */
        .profile-content {
          min-height: 300px;
        }

        .tab-content {
          animation: fade-in 0.3s ease-out;
        }

        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        /* ===== 信息网格 ===== */
        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 0.875rem;
        }

        .info-card {
          display: flex;
          align-items: center;
          gap: 0.875rem;
          padding: 1rem;
          background: var(--bg-primary);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          transition: all 0.3s ease;
        }

        .info-card:hover {
          border-color: var(--border-strong);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .info-icon-wrapper {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .info-icon-wrapper.primary {
          background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
          color: white;
        }

        .info-icon-wrapper.accent {
          background: linear-gradient(135deg, var(--accent-500), var(--accent-600));
          color: white;
        }

        .info-icon-wrapper.success {
          background: linear-gradient(135deg, var(--success), #16a34a);
          color: white;
        }

        .info-icon-wrapper.warning {
          background: linear-gradient(135deg, var(--warning), #d97706);
          color: white;
        }

        .info-icon-wrapper.info {
          background: linear-gradient(135deg, var(--info), #2563eb);
          color: white;
        }

        .info-icon-wrapper.purple {
          background: linear-gradient(135deg, #8b5cf6, #7c3aed);
          color: white;
        }

        .info-content {
          flex: 1;
          min-width: 0;
        }

        .info-content label {
          display: block;
          font-size: 0.6875rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.25rem;
        }

        .info-content span {
          display: block;
          font-size: 0.875rem;
          color: var(--text-primary);
          font-weight: 500;
        }

        .role-badge,
        .status-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.625rem;
          border-radius: 9999px;
          font-size: 0.6875rem;
          font-weight: 600;
        }

        .role-badge {
          background: linear-gradient(135deg, var(--primary-100), var(--primary-200));
          color: var(--primary-700);
        }

        .status-badge.active {
          background: var(--success-dim);
          color: var(--success);
        }

        .status-badge.inactive {
          background: var(--warning-dim);
          color: var(--warning);
        }

        .status-badge.disabled {
          background: var(--error-dim);
          color: var(--error);
        }

        /* ===== 表单样式 ===== */
        .password-form,
        .email-form {
          max-width: 100%;
        }

        .input-group {
          margin-bottom: 1rem;
        }

        .input-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
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

        .input-wrapper input {
          width: 100%;
          padding: 0.75rem 1rem;
          padding-right: 2.5rem;
          background: var(--bg-primary);
          border: 1px solid var(--border-default);
          border-radius: 10px;
          color: var(--text-primary);
          font-size: 0.875rem;
          transition: all 0.2s;
          outline: none;
        }

        .input-wrapper input::placeholder {
          color: var(--text-muted);
        }

        .input-wrapper input:hover {
          border-color: var(--border-strong);
        }

        .input-wrapper input:focus {
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

        .input-group.focused .input-glow {
          opacity: 0.25;
        }

        .toggle-password {
          position: absolute;
          right: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0.25rem;
          transition: color 0.2s;
        }

        .toggle-password:hover {
          color: var(--text-secondary);
        }

        /* 密码强度 */
        .password-strength {
          margin-top: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .strength-bar {
          flex: 1;
          height: 4px;
          background: var(--bg-tertiary);
          border-radius: 2px;
          overflow: hidden;
        }

        .strength-fill {
          height: 100%;
          border-radius: 2px;
          transition: all 0.3s ease;
        }

        .strength-label {
          font-size: 0.75rem;
          font-weight: 500;
        }

        /* ===== 按钮 ===== */
        .submit-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
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
          margin-top: 0.5rem;
        }

        .submit-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(99, 102, 241, 0.4);
        }

        .submit-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .submit-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .animate-spin {
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .button-group {
          display: flex;
          gap: 0.75rem;
          margin-top: 0.5rem;
        }

        .back-button-form {
          flex: 1;
          padding: 0.75rem 1.25rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-default);
          border-radius: 10px;
          color: var(--text-secondary);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .back-button-form:hover {
          background: var(--bg-elevated);
          border-color: var(--border-strong);
        }

        /* ===== 安全提示 ===== */
        .security-tips {
          margin-top: 1.25rem;
          padding: 1rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-default);
          border-radius: 10px;
        }

        .security-tips h4 {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 0.625rem;
        }

        .security-tips ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .security-tips li {
          position: relative;
          padding-left: 0.875rem;
          font-size: 0.75rem;
          color: var(--text-tertiary);
          margin-bottom: 0.25rem;
        }

        .security-tips li::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0.4375rem;
          width: 4px;
          height: 4px;
          background: var(--primary-500);
          border-radius: 50%;
        }

        /* ===== 邮箱绑定状态 ===== */
        .email-bound,
        .email-disabled {
          text-align: center;
          padding: 1.5rem 1rem;
        }

        .success-icon,
        .warning-icon {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1rem;
        }

        .success-icon {
          background: var(--success-dim);
          color: var(--success);
        }

        .warning-icon {
          background: var(--warning-dim);
          color: var(--warning);
        }

        .email-bound h3,
        .email-disabled h3 {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 0.5rem;
        }

        .bound-email {
          font-size: 0.9375rem;
          color: var(--primary-500);
          font-weight: 500;
          margin-bottom: 1rem;
        }

        .email-disabled p {
          font-size: 0.8125rem;
          color: var(--text-tertiary);
        }

        .benefits {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-width: 200px;
          margin: 0 auto;
        }

        .benefit-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }

        .email-preview {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 0.875rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-default);
          border-radius: 10px;
          margin-bottom: 1rem;
          color: var(--text-secondary);
          font-weight: 500;
          font-size: 0.875rem;
        }

        /* ===== 响应式设计 ===== */
        @media (max-width: 480px) {
          .info-grid {
            grid-template-columns: 1fr;
          }

          .tab-button span {
            display: none;
          }

          .avatar-wrapper {
            width: 64px;
            height: 64px;
          }
        }
      `}</style>
    </AuthLayout>
  );
};

export default Profile;
