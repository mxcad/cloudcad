import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Lock,
  Phone,
  Mail,
  MessageCircle,
  CheckCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button, Select, Checkbox } from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import { WechatVerifyModal } from '../../components/WechatVerifyModal';
import {
  authControllerSendSmsCode,
  authControllerResendVerification,
  usersControllerDeactivateAccount,
} from '@/api-sdk';

interface DeactivateForm {
  verificationMethod: 'password' | 'phone' | 'email' | 'wechat' | '';
  password: string;
  phoneCode: string;
  emailCode: string;
  wechatConfirm: string;
  confirmed: boolean;
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
  onSetDeactivateForm: (
    form: DeactivateForm | ((prev: DeactivateForm) => DeactivateForm)
  ) => void;
  onSetDeactivateLoading: (value: boolean) => void;
  onSetDeactivateCountdown: (
    value: number | ((prev: number) => number)
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
  onSetDeactivateForm,
  onSetDeactivateLoading,
  onSetDeactivateCountdown,
  onLogout,
  onShowConfirm,
  onShowToast,
}) => {
  const [showWechatModal, setShowWechatModal] = useState(false);
  const verificationOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [];
    if (user?.hasPassword) opts.push({ value: 'password', label: '密码验证' });
    if (user?.phone && user.phoneVerified) opts.push({ value: 'phone', label: '手机验证码' });
    if (user?.email) opts.push({ value: 'email', label: '邮箱验证码' });
    if (user?.wechatId) opts.push({ value: 'wechat', label: '微信扫码验证' });
    return opts;
  }, [user?.hasPassword, user?.phone, user?.phoneVerified, user?.email, user?.wechatId]);
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
              onChange={(val) =>
                onSetDeactivateForm((f) => ({
                  ...f,
                  verificationMethod: val as 'password' | 'phone' | 'email' | 'wechat' | '',
                  password: '',
                  phoneCode: '',
                  emailCode: '',
                  wechatConfirm: '',
                }))
              }
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
                  onChange={(e) =>
                    onSetDeactivateForm((f) => ({
                      ...f,
                      password: e.target.value,
                    }))
                  }
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
              <div className="input-wrapper">
                <Input
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
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={deactivateCountdown > 0}
                  onClick={async () => {
                    try {
                      if (!user?.phone) {
                        onSetDeactivateForm((f) => ({ ...f }));
                        return;
                      }
                      await authControllerSendSmsCode({ body: { phone: user.phone } });
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
              <div className="input-wrapper">
                <Input
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
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={deactivateCountdown > 0}
                  onClick={async () => {
                    try {
                      if (!user?.email) {
                        onSetDeactivateForm((f) => ({ ...f }));
                        return;
                      }
                      await authControllerResendVerification({ body: { email: user.email } } as unknown as Parameters<typeof authControllerResendVerification>[0]);
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
                </Button>
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
                  <Button
                    variant="primary"
                    icon={MessageCircle}
                    onClick={() => setShowWechatModal(true)}
                  >
                    微信扫码确认
                  </Button>
                </div>
              )}
            </>
          )}

          <div className="confirm-checkbox">
            <Checkbox
              id="confirmDeactivate"
              checked={deactivateForm.confirmed}
              onChange={(e) =>
                onSetDeactivateForm((f) => ({
                  ...f,
                  confirmed: e.target.checked,
                }))
              }
              label="我已了解注销的后果，并确认注销"
            />
          </div>

          <Button
            variant="danger"
            loading={deactivateLoading}
            disabled={
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
                await usersControllerDeactivateAccount({
                  body: {
                    password: deactivateForm.password || undefined,
                    phoneCode: deactivateForm.phoneCode || undefined,
                    emailCode: deactivateForm.emailCode || undefined,
                    wechatConfirm: deactivateForm.wechatConfirm || undefined,
                  },
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
            {deactivateLoading ? '注销中...' : '确认注销'}
          </Button>
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
