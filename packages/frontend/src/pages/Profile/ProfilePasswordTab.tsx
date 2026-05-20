import React from 'react';
import {
  Lock,
  Key,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  Shield,
} from 'lucide-react';
import { UserDto } from '@/api-sdk';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui';


interface ProfilePasswordTabProps {
  user?: UserDto | null;
  passwordForm: {
    oldPassword: string;
    newPassword: string;
    confirmPassword: string;
  };
  showPassword: { old: boolean; new: boolean; confirm: boolean };
  focusedField: string | null;
  passwordStrength: { strength: number; label: string; color: string };
  loading: boolean;
  onPasswordChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPasswordSubmit: (e: React.FormEvent) => void;
  onTogglePassword: (field: 'old' | 'new' | 'confirm') => void;
  onFocusField: (field: string | null) => void;
  onNavigate: (path: string) => void;
}

export const ProfilePasswordTab: React.FC<ProfilePasswordTabProps> = ({
  user,
  passwordForm,
  showPassword,
  focusedField,
  passwordStrength,
  loading,
  onPasswordChange,
  onPasswordSubmit,
  onTogglePassword,
  onFocusField,
  onNavigate,
}) => {
  return (
    <div className="tab-content animate-fade-in">
      <form onSubmit={onPasswordSubmit} className="password-form">
        {user?.hasPassword !== false && (
          <div
            className={`input-group ${focusedField === 'oldPassword' ? 'focused' : ''}`}
          >
            <label className="input-label">
              <Lock size={14} />
              当前密码
            </label>
            <div className="input-wrapper">
              <Input
                type={showPassword.old ? 'text' : 'password'}
                name="oldPassword"
                value={passwordForm.oldPassword}
                onChange={onPasswordChange}
                onFocus={() => onFocusField('oldPassword')}
                onBlur={() => onFocusField(null)}
                placeholder="请输入当前密码"
                required={!user || user.hasPassword === true}
              />
              <Button
                variant="ghost"
                size="xs"
                icon={showPassword.old ? EyeOff : Eye}
                onClick={() => onTogglePassword('old')}
                tooltip={showPassword.old ? '隐藏密码' : '显示密码'}
              />
              <div className="input-glow" />
            </div>
            <div className="field-hint">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onNavigate('/forgot-password')}
              >
                忘记密码？
              </Button>
            </div>
          </div>
        )}

        {user?.hasPassword === false && (
          <div className="no-password-hint">
            <div className="hint-icon">
              <Key size={24} />
            </div>
            <div className="hint-content">
              <h4>设置密码</h4>
              <p>
                您的账户是通过手机号或微信自动创建的，尚未设置密码。
                设置密码后可使用账号密码登录。
              </p>
            </div>
          </div>
        )}

        <div
          className={`input-group ${focusedField === 'newPassword' ? 'focused' : ''}`}
        >
          <label className="input-label">
            <Key size={14} />
            新密码
          </label>
          <div className="input-wrapper">
            <Input
              type={showPassword.new ? 'text' : 'password'}
              name="newPassword"
              value={passwordForm.newPassword}
              onChange={onPasswordChange}
              onFocus={() => onFocusField('newPassword')}
              onBlur={() => onFocusField(null)}
              placeholder="至少8位，包含大小写字母和数字"
              required
            />
            <Button
              variant="ghost"
              size="xs"
              icon={showPassword.new ? EyeOff : Eye}
              onClick={() => onTogglePassword('new')}
              tooltip={showPassword.new ? '隐藏密码' : '显示密码'}
            />
            <div className="input-glow" />
          </div>
          {passwordForm.newPassword && (
            <div className="password-strength">
              <div className="strength-bar">
                <div
                  className="strength-fill"
                  style={{
                    width: `${(passwordStrength.strength / 4) * 100}%`,
                    background: passwordStrength.color,
                  }}
                />
              </div>
              <span
                className="strength-label"
                style={{ color: passwordStrength.color }}
              >
                {passwordStrength.label}
              </span>
            </div>
          )}
        </div>

        <div
          className={`input-group ${focusedField === 'confirmPassword' ? 'focused' : ''}`}
        >
          <label className="input-label">
            <CheckCircle size={14} />
            确认新密码
          </label>
          <div className="input-wrapper">
            <Input
              type={showPassword.confirm ? 'text' : 'password'}
              name="confirmPassword"
              value={passwordForm.confirmPassword}
              onChange={onPasswordChange}
              onFocus={() => onFocusField('confirmPassword')}
              onBlur={() => onFocusField(null)}
              placeholder="再次输入新密码"
              required
            />
            <Button
              variant="ghost"
              size="xs"
              icon={showPassword.confirm ? EyeOff : Eye}
              onClick={() => onTogglePassword('confirm')}
              tooltip={showPassword.confirm ? '隐藏密码' : '显示密码'}
            />
            <div className="input-glow" />
          </div>
        </div>

        <Button type="submit" variant="primary" loading={loading} icon={CheckCircle} className="w-full">
          {loading ? '提交中...' : (user?.hasPassword === false ? '设置密码' : '修改密码')}
        </Button>

        <div className="security-tips">
          <h4>
            <Shield size={16} />
            安全建议
          </h4>
          <ul>
            <li>密码长度至少 8 个字符</li>
            <li>包含大小写字母和数字</li>
            <li>避免使用常见的密码组合</li>
            <li>不要在多个网站使用相同的密码</li>
          </ul>
        </div>
      </form>
    </div>
  );
};
