import React from 'react';
import { buildPasswordRequirements } from '@cloudcad/platform';
import {
  passwordRequirementLabel,
  passwordStrengthDisplay,
  type PasswordPolicyParams,
} from '@/lib/passwordPolicy';
import styles from './PasswordStrength.module.css';

export interface PasswordStrengthProps {
  /** 当前密码值（空串 = 尚未输入） */
  password: string;
  /** 生效口令策略（usePasswordPolicy 取；强度阈值与清单项随策略变化） */
  policy: PasswordPolicyParams;
}

/**
 * 密码强度条 + 实时要求清单（所有「设置新密码」场景的唯一呈现出口）。
 *
 * 强度条仅在密码非空时显示；要求清单常显——空密码时仍显示未达标项，
 * 兼作密码框提交失败时的错误信号。五档强度标签/颜色与清单文案均由
 * 生效策略推导（见 lib/passwordPolicy），页面侧禁止写死策略数字
 * （门禁：pnpm scan:password-policy）。
 */
export const PasswordStrength: React.FC<PasswordStrengthProps> = ({
  password,
  policy,
}) => {
  const display = passwordStrengthDisplay(password, policy);
  const requirements = buildPasswordRequirements(password, policy);

  return (
    <div className={styles.root}>
      {password && (
        <div className={styles.strengthRow}>
          <div className={styles.strengthBar}>
            <div
              className={styles.strengthFill}
              style={{
                width: `${(display.strength / 4) * 100}%`,
                background: display.color,
              }}
            />
          </div>
          <span
            className={styles.strengthLabel}
            style={{ color: display.color }}
          >
            {display.label}
          </span>
        </div>
      )}
      {requirements.length > 0 && (
        <ul className={styles.requirements}>
          {requirements.map((requirement) => (
            <li key={requirement.key} data-ok={requirement.ok}>
              <span aria-hidden>{requirement.ok ? '✓' : '·'}</span>
              {passwordRequirementLabel(requirement, policy)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
