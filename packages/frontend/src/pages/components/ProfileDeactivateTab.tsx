import React from 'react';
import {
  AlertTriangle,
  Lock,
  Phone,
  Mail,
  MessageCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { WechatDeactivateConfirm } from '../Profile/WechatDeactivateConfirm';

interface ProfileDeactivateTabProps {
  user?: {
    hasPassword?: boolean;
    phone?: string | null;
    phoneVerified?: boolean;
    email?: string | null;
    wechatId?: string | null;
  } | null;
  deactivateForm: {
    verificationMethod: 'password' | 'phone' | 'email' | 'wechat' | '';
    password: string;
    phoneCode: string;
    emailCode: string;
    wechatConfirm: string;
    confirmed: boolean;
    immediate: boolean;
  };
  showPassword: { old: boolean; new: boolean; confirm: boolean };
  deactivateLoading: boolean;
  deactivateCountdown: number;
  loading: boolean;

  onVerificationMethodChange: (
    method: 'password' | 'phone' | 'email' | 'wechat' | ''
  ) => void;
  onPasswordChange: (value: string) => void;
  onPhoneCodeChange: (value: string) => void;
  onEmailCodeChange: (value: string) => void;
  onConfirmedChange: (confirmed: boolean) => void;
  onImmediateChange: (immediate: boolean) => void;
  onSendPhoneCode: () => void;
  onSendEmailCode: () => void;
  onWechatConfirm: () => void;
  onDeactivate: () => void;
  onTogglePassword: (field: 'old' | 'new' | 'confirm') => void;
  onShowConfirm: (options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
  }) => Promise<boolean>;
  onLogout: () => void;
}

export const ProfileDeactivateTab: React.FC<ProfileDeactivateTabProps> = ({
  user,
  deactivateForm,
  showPassword,
  deactivateLoading,
  deactivateCountdown,
  loading,

  onVerificationMethodChange,
  onPasswordChange,
  onPhoneCodeChange,
  onEmailCodeChange,
  onConfirmedChange,
  onImmediateChange,
  onSendPhoneCode,
  onSendEmailCode,
  onWechatConfirm,
  onDeactivate,
  onTogglePassword,
  onShowConfirm,
  onLogout,
}) => {
  const canSubmit = () => {
    if (!deactivateForm.confirmed || !deactivateForm.verificationMethod)
      return false;
    if (
      deactivateForm.verificationMethod === 'password' &&
      !deactivateForm.password
    )
      return false;
    if (
      deactivateForm.verificationMethod === 'phone' &&
      !deactivateForm.phoneCode
    )
      return false;
    if (
      deactivateForm.verificationMethod === 'email' &&
      !deactivateForm.emailCode
    )
      return false;
    if (
      deactivateForm.verificationMethod === 'wechat' &&
      !deactivateForm.wechatConfirm
    )
      return false;
    return true;
  };

  const handleDeactivate = async () => {
    const confirmed = await onShowConfirm({
      title: '确认注销',
      message: '确定要注销您的账户吗？此操作不可恢复！',
      confirmText: '确定注销',
      cancelText: '取消',
      type: 'danger',
    });
    if (confirmed) {
      onDeactivate();
    }
  };

  return (
    <div className="tab-content animate-fade-in">
      <div className="deactivate-content">
        <div className="warning-icon">
          <AlertTriangle size={48} />
        </div>
        <h3>注销账户</h3>
        <p className="warning-text">
          注销账户是一个不可逆的操作。注销后，您的所有数据将被永久删除，且无法恢复。
        </p>
        <div className="warning-list">
          <div className="warning-item">
            <AlertTriangle size={14} />
            <span>所有项目文件将被永久删除</span>
          </div>
          <div className="warning-item">
            <AlertTriangle size={14} />
            <span>所有收藏和历史记录将被清除</span>
          </div>
          <div className="warning-item">
            <AlertTriangle size={14} />
            <span>账户信息将无法再恢复</span>
          </div>
        </div>

        <div className="deactivate-form">
          <div className="input-group">
            <label className="input-label">选择验证方式</label>
            <select
              value={deactivateForm.verificationMethod}
              onChange={(e) =>
                onVerificationMethodChange(e.target.value as any)
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
                <Lock size={14} />
                密码验证
              </label>
              <div className="input-wrapper">
                <input
                  type={showPassword.confirm ? 'text' : 'password'}
                  value={deactivateForm.password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  placeholder="请输入密码"
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => onTogglePassword('confirm')}
                >
                  {showPassword.confirm ? (
                    <AlertTriangle size={16} />
                  ) : (
                    <Lock size={16} />
                  )}
                </button>
                <div className="input-glow" />
              </div>
            </div>
          )}

          {deactivateForm.verificationMethod === 'phone' && (
            <div className="input-group">
              <label className="input-label">
                <Phone size={14} />
                手机验证码
              </label>
              <div className="input-wrapper has-button">
                <input
                  type="text"
                  value={deactivateForm.phoneCode}
                  onChange={(e) => onPhoneCodeChange(e.target.value)}
                  placeholder="请输入手机验证码"
                />
                <button
                  type="button"
                  className="send-code-button"
                  disabled={deactivateCountdown > 0}
                  onClick={onSendPhoneCode}
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
                <Mail size={14} />
                邮箱验证码
              </label>
              <div className="input-wrapper has-button">
                <input
                  type="text"
                  value={deactivateForm.emailCode}
                  onChange={(e) => onEmailCodeChange(e.target.value)}
                  placeholder="请输入邮箱验证码"
                />
                <button
                  type="button"
                  className="send-code-button"
                  disabled={deactivateCountdown > 0}
                  onClick={onSendEmailCode}
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
              {deactivateForm.wechatConfirm === 'confirmed' ? (
                <div className="wechat-warning success">
                  <CheckCircle size={32} strokeWidth={2} />
                  <p>微信验证成功</p>
                </div>
              ) : (
                <WechatDeactivateConfirm onConfirm={onWechatConfirm} />
              )}
            </>
          )}

          <div className="confirm-checkbox">
            <input
              type="checkbox"
              id="confirmDeactivate"
              checked={deactivateForm.confirmed}
              onChange={(e) => onConfirmedChange(e.target.checked)}
            />
            <label htmlFor="confirmDeactivate">
              我已了解注销的后果，并确认注销
            </label>
          </div>

          <div className="confirm-checkbox">
            <input
              type="checkbox"
              id="immediateDeactivate"
              checked={deactivateForm.immediate}
              onChange={(e) => onImmediateChange(e.target.checked)}
            />
            <label htmlFor="immediateDeactivate">
              立即注销并清理所有数据（不等待30天）
            </label>
          </div>

          <button
            type="button"
            className="submit-button danger"
            disabled={deactivateLoading || !canSubmit()}
            onClick={handleDeactivate}
          >
            {deactivateLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>注销中...</span>
              </>
            ) : (
              <>
                <AlertTriangle size={18} />
                <span>确认注销</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
