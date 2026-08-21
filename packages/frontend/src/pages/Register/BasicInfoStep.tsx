import React from 'react';
import {
  User,
  Mail,
  Phone,
  MessageSquare,
  Sparkles,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { t } from '@/languages';
import { Button } from '@/components/ui/Button';
import { UseFormRegister } from 'react-hook-form';
import { RegisterFormValues } from './hooks/registerFormSchema';
import { FieldErrors } from './types';
import styles from './register.module.css';

interface BasicInfoStepProps {
  register: UseFormRegister<RegisterFormValues>;
  focusedField: string | null;
  setFocusedField: (field: string | null) => void;
  fieldErrors: FieldErrors;
  mailEnabled: boolean;
  requireEmailVerification: boolean;
  smsEnabled: boolean;
  requirePhoneVerification: boolean;
  phoneForm: { phone: string; code: string };
  countdown: number;
  sendingCode: boolean;
  handlePhoneChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSendCode: () => void;
  onNext: () => void;
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

export const BasicInfoStep: React.FC<BasicInfoStepProps> = ({
  register,
  focusedField,
  setFocusedField,
  fieldErrors,
  mailEnabled,
  requireEmailVerification,
  smsEnabled,
  requirePhoneVerification,
  phoneForm,
  countdown,
  sendingCode,
  handlePhoneChange,
  handleSendCode,
  onNext,
}) => {
  return (
    <div className={`${styles.formStep} animate-fade-in`}>
      <div
        className={inputGroupCls(
          styles,
          focusedField === 'username',
          !!fieldErrors.username
        )}
      >
        <label htmlFor="username" className={styles.inputLabel}>
          {t('用户名')} <span className={styles.required}>*</span>
        </label>
        <div className={styles.inputWrapper}>
          <User
            size={18}
            className={iconCls(styles, focusedField === 'username')}
          />
          <input
            id="username"
            type="text"
            required
            className={styles.inputField}
            placeholder={t('请输入用户名')}
            {...register('username')}
            onFocus={() => setFocusedField('username')}
          />
          <div className={styles.inputGlow} />
        </div>
        {fieldErrors.username && (
          <p className={styles.errorMessage}>{fieldErrors.username}</p>
        )}
      </div>

      <div
        className={inputGroupCls(
          styles,
          focusedField === 'nickname',
          !!fieldErrors.nickname
        )}
      >
        <label htmlFor="nickname" className={styles.inputLabel}>
          {t('昵称')}
        </label>
        <div className={styles.inputWrapper}>
          <Sparkles
            size={18}
            className={iconCls(styles, focusedField === 'nickname')}
          />
          <input
            id="nickname"
            type="text"
            className={styles.inputField}
            placeholder={t('请输入昵称（可选）')}
            {...register('nickname')}
            onFocus={() => setFocusedField('nickname')}
          />
          <div className={styles.inputGlow} />
        </div>
        {fieldErrors.nickname && (
          <p className={styles.errorMessage}>{fieldErrors.nickname}</p>
        )}
      </div>

      {mailEnabled && requireEmailVerification && (
        <div
          className={inputGroupCls(
            styles,
            focusedField === 'email',
            !!fieldErrors.email
          )}
        >
          <label htmlFor="email" className={styles.inputLabel}>
            {t('邮箱地址')}{' '}
            {requireEmailVerification && (
              <span className={styles.required}>*</span>
            )}
          </label>
          <div className={styles.inputWrapper}>
            <Mail
              size={18}
              className={iconCls(styles, focusedField === 'email')}
            />
            <input
              id="email"
              type="email"
              autoComplete="email"
              required={requireEmailVerification}
              className={styles.inputField}
              placeholder={t('请输入邮箱地址')}
              {...register('email')}
              onFocus={() => setFocusedField('email')}
            />
            <div className={styles.inputGlow} />
          </div>
          {fieldErrors.email && (
            <p className={styles.errorMessage}>{fieldErrors.email}</p>
          )}
        </div>
      )}

      {smsEnabled && requirePhoneVerification && (
        <>
          <div
            className={inputGroupCls(
              styles,
              focusedField === 'phone',
              !!fieldErrors.phone
            )}
          >
            <label htmlFor="phone" className={styles.inputLabel}>
              {t('手机号')}{' '}
              {requirePhoneVerification && (
                <span className={styles.required}>*</span>
              )}
            </label>
            <div className={styles.inputWrapper}>
              <Phone
                size={18}
                className={iconCls(styles, focusedField === 'phone')}
              />
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                required={requirePhoneVerification}
                maxLength={11}
                className={styles.inputField}
                placeholder={t('请输入手机号')}
                value={phoneForm.phone}
                onChange={handlePhoneChange}
                onFocus={() => setFocusedField('phone')}
                onBlur={() => setFocusedField(null)}
              />
              <div className={styles.inputGlow} />
            </div>
            {fieldErrors.phone && (
              <p className={styles.errorMessage}>{fieldErrors.phone}</p>
            )}
          </div>

          <div
            className={inputGroupCls(
              styles,
              focusedField === 'code',
              !!fieldErrors.code
            )}
          >
            <label htmlFor="code" className={styles.inputLabel}>
              {t('验证码')}{' '}
              {requirePhoneVerification && (
                <span className={styles.required}>*</span>
              )}
            </label>
            <div
              className={`${styles.inputWrapper} ${styles.inputWrapperHasButton}`}
            >
              <MessageSquare
                size={18}
                className={iconCls(styles, focusedField === 'code')}
              />
              <input
                id="code"
                name="code"
                type="text"
                autoComplete="one-time-code"
                required={requirePhoneVerification}
                maxLength={6}
                className={`${styles.inputField} ${styles.inputFieldHasButton}`}
                placeholder={t('请输入验证码')}
                value={phoneForm.code}
                onChange={handlePhoneChange}
                onFocus={() => setFocusedField('code')}
                onBlur={() => setFocusedField(null)}
              />
              <button
                type="button"
                className={styles.codeButton}
                onClick={handleSendCode}
                disabled={
                  countdown > 0 || sendingCode || phoneForm.phone.length !== 11
                }
              >
                {sendingCode ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : countdown > 0 ? (
                  `${countdown}s`
                ) : (
                  t('获取验证码')
                )}
              </button>
              <div className={styles.inputGlow} />
            </div>
            {fieldErrors.code && (
              <p className={styles.errorMessage}>{fieldErrors.code}</p>
            )}
          </div>
        </>
      )}

      <div
        className={`${styles.agreementGroup} ${
          fieldErrors.agreedToTerms ? styles.agreementGroupError : ''
        }`}
      >
        <label className={styles.agreementLabel}>
          <input
            type="checkbox"
            className={styles.agreementCheckbox}
            {...register('agreedToTerms')}
          />
          <span className={styles.agreementText}>
            {t('我已阅读并同意')}
            <Link to="/terms" className={styles.agreementLink}>
              《{t('用户协议')}》
            </Link>
            {t('和')}
            <Link to="/privacy" className={styles.agreementLink}>
              《{t('隐私政策')}》
            </Link>
          </span>
        </label>
        {fieldErrors.agreedToTerms && (
          <p className={styles.errorMessage}>{fieldErrors.agreedToTerms}</p>
        )}
      </div>

      <Button
        type="button"
        variant="primary"
        size="lg"
        className="w-full"
        onClick={onNext}
        icon={ArrowRight}
      >
        {t('下一步')}
      </Button>
    </div>
  );
};
