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
import { PasswordStrength } from '@/components/ui/PasswordStrength';
import { UseFormRegister } from 'react-hook-form';
import { passwordPlaceholder, usePasswordPolicy } from '@/lib/passwordPolicy';
import { RegisterFormValues } from './hooks/registerFormSchema';
import { FieldErrors } from './types';
import { FieldErrorMessage } from './FieldErrorMessage';
import styles from './register.module.css';

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
  loading,
  onBack,
}) => {
  // 口令要求提示由生效策略值推导（/runtime-config/public 下发），禁写死策略数字
  const policy = usePasswordPolicy();
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
            placeholder={passwordPlaceholder(policy)}
            {...register('password')}
            aria-invalid={!!fieldErrors.password}
            onFocus={() => setFocusedField('password')}
          />
          <Button
            type="button"
            variant="icon"
            size="xs"
            className="absolute right-4 top-1/2 -translate-y-1/2"
            icon={showPassword ? EyeOff : Eye}
            tooltip={showPassword ? t('隐藏密码') : t('显示密码')}
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
          />
          <div className={styles.inputGlow} />
        </div>
        {/* 强度条 + 要求清单走共享组件（唯一呈现出口）：清单常显，既是实时达标
            反馈，也是密码框提交失败时的唯一错误信号。空密码时清单仍显示未达标项 */}
        <PasswordStrength password={passwordValue} policy={policy} />
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
            placeholder={t('请再次输入新密码')}
            {...register('confirmPassword')}
            aria-invalid={!!fieldErrors.confirmPassword}
            aria-describedby={
              fieldErrors.confirmPassword ? 'confirmPassword-error' : undefined
            }
            onFocus={() => setFocusedField('confirmPassword')}
          />
          <Button
            type="button"
            variant="icon"
            size="xs"
            className="absolute right-4 top-1/2 -translate-y-1/2"
            icon={showConfirmPassword ? EyeOff : Eye}
            tooltip={showConfirmPassword ? t('隐藏密码') : t('显示密码')}
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            tabIndex={-1}
          />
          <div className={styles.inputGlow} />
        </div>
        {fieldErrors.confirmPassword && (
          <FieldErrorMessage id="confirmPassword-error">
            {fieldErrors.confirmPassword}
          </FieldErrorMessage>
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
