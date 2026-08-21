import React from 'react';
import {
  Lock,
  CheckCircle,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { t } from '@/languages';
import { Button } from '@/components/ui/Button';
import { UseFormRegister } from 'react-hook-form';
import { RegisterFormValues } from './hooks/registerFormSchema';
import { FieldErrors } from './types';
import styles from './register.module.css';

interface PasswordStrength {
  strength: number;
  label: string;
  color: string;
}

interface PasswordStepProps {
  register: UseFormRegister<RegisterFormValues>;
  focusedField: string | null;
  setFocusedField: (field: string | null) => void;
  fieldErrors: FieldErrors;
  showPassword: boolean;
  showConfirmPassword: boolean;
  setShowPassword: (v: boolean) => void;
  setShowConfirmPassword: (v: boolean) => void;
  passwordValue: string;
  passwordStrength: PasswordStrength;
  loading: boolean;
  onBack: () => void;
}

const inputGroupCls = (
  styles: Record<string, string>,
  focused: boolean,
  hasError: boolean
): string => {
  return `${styles.inputGroup} ${focused ? styles.inputGroupFocused : ''} ${
    hasError ? styles.inputGroupError : ''
  }`;
};

const iconCls = (styles: Record<string, string>, active: boolean): string => {
  return `${styles.inputIcon} ${active ? styles.inputIconActive : ''}`;
};

export const PasswordStep: React.FC<PasswordStepProps> = ({
  register,
  focusedField,
  setFocusedField,
  fieldErrors,
  showPassword,
  showConfirmPassword,
  setShowPassword,
  setShowConfirmPassword,
  passwordValue,
  passwordStrength,
  loading,
  onBack,
}) => {
  return (
    <div className={`${styles.formStep} animate-fade-in`}>
      <div
        className={inputGroupCls(
          styles,
          focusedField === 'password',
          !!fieldErrors.password
        )}
      >
        <label htmlFor="password" className={styles.inputLabel}>
          {t('密码')} <span className={styles.required}>*</span>
        </label>
        <div className={styles.inputWrapper}>
          <Lock
            size={18}
            className={iconCls(styles, focusedField === 'password')}
          />
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            className={`${styles.inputField} ${styles.inputFieldHasToggle}`}
            placeholder={t('至少8位，包含大小写字母、数字和特殊字符')}
            {...register('password')}
            onFocus={() => setFocusedField('password')}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="absolute right-4 top-1/2 -translate-y-1/2"
            icon={showPassword ? EyeOff : Eye}
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
          />
          <div className={styles.inputGlow} />
        </div>
        {passwordValue && (
          <div className={styles.passwordStrength}>
            <div className={styles.strengthBar}>
              <div
                className={styles.strengthFill}
                style={{
                  width: `${(passwordStrength.strength / 4) * 100}%`,
                  background: passwordStrength.color,
                }}
              />
            </div>
            <span
              className={styles.strengthLabel}
              style={{ color: passwordStrength.color }}
            >
              {passwordStrength.label}
            </span>
          </div>
        )}
        {fieldErrors.password && (
          <p className={styles.errorMessage}>{fieldErrors.password}</p>
        )}
      </div>

      <div
        className={inputGroupCls(
          styles,
          focusedField === 'confirmPassword',
          !!fieldErrors.confirmPassword
        )}
      >
        <label htmlFor="confirmPassword" className={styles.inputLabel}>
          {t('确认密码')} <span className={styles.required}>*</span>
        </label>
        <div className={styles.inputWrapper}>
          <CheckCircle
            size={18}
            className={iconCls(styles, focusedField === 'confirmPassword')}
          />
          <input
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            className={`${styles.inputField} ${styles.inputFieldHasToggle}`}
            placeholder={t('请再次输入密码')}
            {...register('confirmPassword')}
            onFocus={() => setFocusedField('confirmPassword')}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="absolute right-4 top-1/2 -translate-y-1/2"
            icon={showConfirmPassword ? EyeOff : Eye}
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            tabIndex={-1}
          />
          <div className={styles.inputGlow} />
        </div>
        {fieldErrors.confirmPassword && (
          <p className={styles.errorMessage}>{fieldErrors.confirmPassword}</p>
        )}
      </div>

      <div className={styles.buttonGroup}>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="flex-1"
          icon={ArrowLeft}
          onClick={onBack}
        >
          {t('返回')}
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="flex-1"
          loading={loading}
          icon={ArrowRight}
        >
          {t('立即注册')}
        </Button>
      </div>
    </div>
  );
};
