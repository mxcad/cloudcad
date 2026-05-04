import React, { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { CheckCircle } from 'lucide-react';
import { WechatVerifyModal } from '../../components/WechatVerifyModal';

interface DeactivateForm {
  verificationMethod: 'password' | 'phone' | 'email' | 'wechat' | '';
  password: string;
  phoneCode: string;
  emailCode: string;
  wechatConfirm: string;
  confirmed: boolean;
}

interface ShowPassword {
  old: boolean;
  new: boolean;
  confirm: boolean;
}

interface ProfileAccountTabProps {
  user: {
    hasPassword?: boolean;
    phone?: string;
    phoneVerified?: boolean;
    email?: string;
    wechatId?: string;
  } | null;
  deactivateForm: DeactivateForm;
  deactivateLoading: boolean;
  deactivateCountdown: number;
  showPassword: ShowPassword;
  onSetDeactivateForm: (
    form: DeactivateForm | ((prev: DeactivateForm) => DeactivateForm)
  ) => void;
  onSetDeactivateLoading: (value: boolean) => void;
  onSetDeactivateCountdown: (
    value: number | ((prev: number) => number)
  ) => void;
  onSetShowPassword: (
    show: ShowPassword | ((prev: ShowPassword) => ShowPassword)
  ) => void;
  onLogout: () => Promise<void>;
  onShowConfirm: (options: {
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    type: 'warning' | 'danger';
  }) => Promise<boolean>;
  onShowToast: (message: string, type: 'success' | 'error') => void;
}

export const ProfileAccountTab: React.FC<ProfileAccountTabProps> = ({
  user,
  deactivateForm,
  deactivateLoading,
  deactivateCountdown,
  showPassword,
  onSetDeactivateForm,
  onSetDeactivateLoading,
  onSetDeactivateCountdown,
  onSetShowPassword,
  onLogout,
  onShowConfirm,
  onShowToast,
}) => {
  const [showWechatModal, setShowWechatModal] = useState(false);
  return (
    <div className="tab-content animate-fade-in">
      <div className="deactivate-content">
        <div className="warning-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </div>
        <h3>注销账户</h3>
        <p className="warning-text">
          注销账户是一个不可逆的操作。注销后，您的所有数据将被永久删除，且无法恢复。
        </p>
        <div className="warning-list">
          <div className="warning-item">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            <span>所有项目文件将被永久删除</span>
          </div>
          <div className="warning-item">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            <span>所有收藏和历史记录将被清除</span>
          </div>
          <div className="warning-item">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            <span>账户信息将无法再恢复</span>
          </div>
        </div>

        <div className="deactivate-form">
          <div className="input-group">
            <label className="input-label">选择验证方式</label>
            <select
              value={deactivateForm.verificationMethod}
              onChange={(e) =>
                onSetDeactivateForm((f) => ({
                  ...f,
                  verificationMethod: e.target.value as
                    | 'password'
                    | 'phone'
                    | 'email'
                    | 'wechat'
                    | '',
                  password: '',
                  phoneCode: '',
                  emailCode: '',
                  wechatConfirm: '',
                }))
              }
              className="verification-select"
            >
              <option value="">请选择验证方式</option>
              {user?.hasPassword && <option value="password">密码验证</option>}
              {user?.phone && user.phoneVerified && (
                <option value="phone">手机验证码</option>
              )}
              {user?.email && <option value="email">邮箱验证码</option>}
              {user?.wechatId && <option value="wechat">微信扫码验证</option>}
            </select>
          </div>

          {deactivateForm.verificationMethod === 'password' && (
            <div className="input-group">
              <label className="input-label">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                密码验证
              </label>
              <div className="input-wrapper">
                <input
                  type={showPassword.confirm ? 'text' : 'password'}
                  value={deactivateForm.password}
                  onChange={(e) =>
                    onSetDeactivateForm((f) => ({
                      ...f,
                      password: e.target.value,
                    }))
                  }
                  placeholder="请输入密码"
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() =>
                    onSetShowPassword((p) => ({
                      ...p,
                      confirm: !p.confirm,
                    }))
                  }
                >
                  {showPassword.confirm ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" x2="23" y1="1" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
                <div className="input-glow" />
              </div>
            </div>
          )}

          {deactivateForm.verificationMethod === 'phone' && (
            <div className="input-group">
              <label className="input-label">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                手机验证码
              </label>
              <div className="input-wrapper">
                <input
                  type="text"
                  value={deactivateForm.phoneCode}
                  onChange={(e) =>
                    onSetDeactivateForm((f) => ({
                      ...f,
                      phoneCode: e.target.value,
                    }))
                  }
                  placeholder="请输入手机验证码"
                />
                <button
                  type="button"
                  className="send-code-button"
                  disabled={deactivateCountdown > 0}
                  onClick={async () => {
                    try {
                      if (!user?.phone) {
                        onSetDeactivateForm((f) => ({ ...f }));
                        return;
                      }
                      const { authApi } =
                        await import('../../services/authApi');
                      await authApi.sendSmsCode(user.phone);
                      onSetDeactivateCountdown(60);
                      const timer = setInterval(() => {
                        onSetDeactivateCountdown((c) => {
                          if (c <= 1) {
                            clearInterval(timer);
                            return 0;
                          }
                          return c - 1;
                        });
                      }, 1000);
                    } catch {
                      // Handle error silently
                    }
                  }}
                >
                  {deactivateCountdown > 0
                    ? `${deactivateCountdown}s`
                    : '获取验证码'}
                </button>
                <div className="input-glow" />
              </div>
            </div>
          )}

          {deactivateForm.verificationMethod === 'email' && (
            <div className="input-group">
              <label className="input-label">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                邮箱验证码
              </label>
              <div className="input-wrapper">
                <input
                  type="text"
                  value={deactivateForm.emailCode}
                  onChange={(e) =>
                    onSetDeactivateForm((f) => ({
                      ...f,
                      emailCode: e.target.value,
                    }))
                  }
                  placeholder="请输入邮箱验证码"
                />
                <button
                  type="button"
                  className="send-code-button"
                  disabled={deactivateCountdown > 0}
                  onClick={async () => {
                    try {
                      if (!user?.email) {
                        onSetDeactivateForm((f) => ({ ...f }));
                        return;
                      }
                      const { authApi } =
                        await import('../../services/authApi');
                      await authApi.resendVerification(user.email);
                      onSetDeactivateCountdown(60);
                      const timer = setInterval(() => {
                        onSetDeactivateCountdown((c) => {
                          if (c <= 1) {
                            clearInterval(timer);
                            return 0;
                          }
                          return c - 1;
                        });
                      }, 1000);
                    } catch {
                      // Handle error silently
                    }
                  }}
                >
                  {deactivateCountdown > 0
                    ? `${deactivateCountdown}s`
                    : '获取验证码'}
                </button>
                <div className="input-glow" />
              </div>
            </div>
          )}

          {deactivateForm.verificationMethod === 'wechat' && (
            <>
              {deactivateForm.wechatConfirm ? (
                <div className="wechat-warning success">
                  <CheckCircle size={32} strokeWidth={2} />
                  <p>微信验证成功</p>
                </div>
              ) : (
                <div className="wechat-warning">
                  <MessageCircle size={28} strokeWidth={1.5} />
                  <p>您是通过微信登录的账户，请使用微信扫码确认注销</p>
                  <button
                    type="button"
                    className="submit-button"
                    onClick={() => setShowWechatModal(true)}
                  >
                    <MessageCircle size={16} />
                    <span>微信扫码确认</span>
                  </button>
                </div>
              )}
            </>
          )}

          <div className="confirm-checkbox">
            <input
              type="checkbox"
              id="confirmDeactivate"
              checked={deactivateForm.confirmed}
              onChange={(e) =>
                onSetDeactivateForm((f) => ({
                  ...f,
                  confirmed: e.target.checked,
                }))
              }
            />
            <label htmlFor="confirmDeactivate">
              我已了解注销的后果，并确认注销
            </label>
          </div>

          <button
            type="button"
            className="submit-button danger"
            disabled={
              deactivateLoading ||
              !deactivateForm.confirmed ||
              !deactivateForm.verificationMethod ||
              (deactivateForm.verificationMethod === 'password' &&
                !deactivateForm.password) ||
              (deactivateForm.verificationMethod === 'phone' &&
                !deactivateForm.phoneCode) ||
              (deactivateForm.verificationMethod === 'email' &&
                !deactivateForm.emailCode) ||
              (deactivateForm.verificationMethod === 'wechat' &&
                !deactivateForm.wechatConfirm)
            }
            onClick={async () => {
              const confirmed = await onShowConfirm({
                title: '确认注销',
                message: '确定要注销您的账户吗？此操作不可恢复！',
                confirmText: '确定注销',
                cancelText: '取消',
                type: 'danger',
              });
              if (!confirmed) {
                return;
              }
              try {
                onSetDeactivateLoading(true);
                const { usersApi } = await import('../../services/usersApi');
                await usersApi.deactivateAccount({
                  password: deactivateForm.password || undefined,
                  phoneCode: deactivateForm.phoneCode || undefined,
                  emailCode: deactivateForm.emailCode || undefined,
                  wechatConfirm: deactivateForm.wechatConfirm || undefined,
                });
                setTimeout(() => {
                  onLogout();
                }, 1500);
              } catch {
                // Handle error silently
              } finally {
                onSetDeactivateLoading(false);
              }
            }}
          >
            {deactivateLoading ? (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="animate-spin"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span>注销中...</span>
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
                <span>确认注销</span>
              </>
            )}
          </button>
        </div>
        <WechatVerifyModal
          open={showWechatModal}
          onClose={() => setShowWechatModal(false)}
          onSuccess={(token: string) => {
            onSetDeactivateForm((f) => ({
              ...f,
              wechatConfirm: token,
            }));
            setShowWechatModal(false);
          }}
        />
      </div>
    </div>
  );
};
