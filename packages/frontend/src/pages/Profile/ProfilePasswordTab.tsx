import React from 'react';
import { Lock } from 'lucide-react';
import { Key } from 'lucide-react';
import { CheckCircle } from 'lucide-react';
import { Eye } from 'lucide-react';
import { EyeOff } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { Save } from 'lucide-react';
import { Shield } from 'lucide-react';

interface PasswordForm {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface ShowPassword {
  old: boolean;
  new: boolean;
  confirm: boolean;
}

interface ProfilePasswordTabProps {
  passwordForm: PasswordForm;
  showPassword: ShowPassword;
  passwordStrength: { strength: number; label: string; color: string };
  loading: boolean;
  focusedField: string | null;
  setFocusedField: (field: string | null) => void;
  onPasswordChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPasswordSubmit: (e: React.FormEvent) => void;
  onTogglePassword: (field: 'old' | 'new' | 'confirm') => void;
}

export const ProfilePasswordTab: React.FC<ProfilePasswordTabProps> = ({
  passwordForm,
  showPassword,
  passwordStrength,
  loading,
  focusedField,
  setFocusedField,
  onPasswordChange,
  onPasswordSubmit,
  onTogglePassword,
}) => {
  return (
    <form onSubmit={onPasswordSubmit} className="password-form">
      {typeof window !== 'undefined' &&
        (window as unknown as { __userHasPassword?: boolean })
          .__userHasPassword !== false && (
          <div
            className={`input-group ${focusedField === 'oldPassword' ? 'focused' : ''}`}
          >
            <label className="input-label">
              <Lock size={14} />
              当前密码
            </label>
            <div className="input-wrapper">
              <input
                type={showPassword.old ? 'text' : 'password'}
                name="oldPassword"
                value={passwordForm.oldPassword}
                onChange={onPasswordChange}
                onFocus={() => setFocusedField('oldPassword')}
                onBlur={() => setFocusedField(null)}
                placeholder="请输入当前密码"
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => onTogglePassword('old')}
              >
                {showPassword.old ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <div className="input-glow" />
            </div>
            <div className="field-hint">
              <button
                type="button"
                className="forgot-password-link"
                onClick={() => (window.location.href = '/forgot-password')}
              >
                忘记密码？
              </button>
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
          <input
            type={showPassword.new ? 'text' : 'password'}
            name="newPassword"
            value={passwordForm.newPassword}
            onChange={onPasswordChange}
            onFocus={() => setFocusedField('newPassword')}
            onBlur={() => setFocusedField(null)}
            placeholder="至少8位，包含大小写字母和数字"
            required
          />
          <button
            type="button"
            className="toggle-password"
            onClick={() => onTogglePassword('new')}
          >
            {showPassword.new ? <EyeOff size={16} /> : <Eye size={16} />}
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
          <input
            type={showPassword.confirm ? 'text' : 'password'}
            name="confirmPassword"
            value={passwordForm.confirmPassword}
            onChange={onPasswordChange}
            onFocus={() => setFocusedField('confirmPassword')}
            onBlur={() => setFocusedField(null)}
            placeholder="请再次输入新密码"
            required
          />
          <button
            type="button"
            className="toggle-password"
            onClick={() => onTogglePassword('confirm')}
          >
            {showPassword.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <div className="input-glow" />
        </div>
      </div>

      <button type="submit" disabled={loading} className="submit-button">
        {loading ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            <span>修改中...</span>
          </>
        ) : (
          <>
            <Save size={18} />
            <span>保存修改</span>
          </>
        )}
      </button>

      <div className="security-tips">
        <h4>
          <Shield size={14} />
          安全提示
        </h4>
        <ul>
          <li>密码长度至少 8 位</li>
          <li>包含大小写字母、数字和特殊字符</li>
          <li>修改密码后需要重新登录</li>
        </ul>
      </div>
    </form>
  );
};
