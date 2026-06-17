import React, { useMemo } from 'react';
import {
  AlertTriangle,
  Lock,
  Phone,
  Mail,
  MessageCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { Button, Select, Checkbox } from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import { Input } from '@/components/ui/Input';
import { WechatDeactivateConfirm } from '../Profile/WechatDeactivateConfirm';

interface ProfileDeactivateTabProps {
  user?: {
    hasPassword?: boolean;
    phone?: string | { [key: string]: unknown } | null;
    phoneVerified?: boolean;
    email?: string | { [key: string]: unknown } | null;
    wechatId?: string | { [key: string]: unknown } | null;
  } | null;
  deactivateForm: {
    verificationMethod: 'password' | 'phone' | 'email' | 'wechat' | '';
    password: string;
    phoneCode: string;
    emailCode: string;
    wechatConfirm: string;
    confirmed: boolean;
  };
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
  onSendPhoneCode: () => void;
  onSendEmailCode: () => void;
  onWechatConfirm: () => void;
  onDeactivate: () => void;
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
  deactivateLoading,
  deactivateCountdown,
  loading,

  onVerificationMethodChange,
  onPasswordChange,
  onPhoneCodeChange,
  onEmailCodeChange,
  onConfirmedChange,
  onSendPhoneCode,
  onSendEmailCode,
  onWechatConfirm,
  onDeactivate,
  onShowConfirm,
  onLogout,
}) => {
  const verificationOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [];
    if (user?.hasPassword) opts.push({ value: 'password', label: '密码验证' });
    if (user?.phone && user.phoneVerified) opts.push({ value: 'phone', label: '手机验证码' });
    if (user?.email) opts.push({ value: 'email', label: '邮箱验证码' });
    if (user?.wechatId) opts.push({ value: 'wechat', label: '微信扫码验证' });
    return opts;
  }, [user?.hasPassword, user?.phone, user?.phoneVerified, user?.email, user?.wechatId]);

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
            <Select
              value={deactivateForm.verificationMethod}
              onChange={(val) => onVerificationMethodChange(val as 'password' | 'phone' | 'email' | 'wechat' | '')}
              options={verificationOptions}
              placeholder="请选择验证方式"
            />
          </div>

          {deactivateForm.verificationMethod === 'password' && (
            <div className="input-group">
              <label className="input-label">
                <Lock size={14} />
                密码验证
              </label>
              <div className="input-wrapper">
                <Input
                  type="password"
                  value={deactivateForm.password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  placeholder="请输入密码"
                  showPasswordToggle
                />
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
                <Input
                  type="text"
                  value={deactivateForm.phoneCode}
                  onChange={(e) => onPhoneCodeChange(e.target.value)}
                  placeholder="请输入手机验证码"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={deactivateCountdown > 0}
                  onClick={onSendPhoneCode}
                >
                  {deactivateCountdown > 0
                    ? `${deactivateCountdown}s`
                    : '获取验证码'}
                </Button>
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
                <Input
                  type="text"
                  value={deactivateForm.emailCode}
                  onChange={(e) => onEmailCodeChange(e.target.value)}
                  placeholder="请输入邮箱验证码"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={deactivateCountdown > 0}
                  onClick={onSendEmailCode}
                >
                  {deactivateCountdown > 0
                    ? `${deactivateCountdown}s`
                    : '获取验证码'}
                </Button>
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
            <Checkbox
              id="confirmDeactivate"
              checked={deactivateForm.confirmed}
              onChange={(e) => onConfirmedChange(e.target.checked)}
              label="我已了解注销的后果，并确认注销"
            />
          </div>

          <Button
            variant="danger"
            loading={deactivateLoading}
            disabled={!canSubmit()}
            onClick={handleDeactivate}
            icon={AlertTriangle}
          >
            <span>{deactivateLoading ? '注销中...' : '确认注销'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
