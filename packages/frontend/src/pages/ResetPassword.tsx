import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { t } from '@/languages';
import { useBrandConfig } from '../contexts/BrandContext';
import { useTheme } from '../contexts/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { InteractiveBackground } from '../components/InteractiveBackground';
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from './ResetPassword/resetPasswordSchema';
import { useResetPassword } from './ResetPassword/useResetPassword';

// Lucide 图标
import { Mail } from 'lucide-react';
import { Lock } from 'lucide-react';
import { KeyRound } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { CheckCircle } from 'lucide-react';
import { Eye } from 'lucide-react';
import { EyeOff } from 'lucide-react';
import { Phone } from 'lucide-react';
import { Cpu } from 'lucide-react';
import { Boxes } from 'lucide-react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import styles from './ResetPassword.module.css';

interface LocationState {
  email?: string;
  phone?: string;
}

/**
 * 重置密码页面 - CloudCAD
 *
 * 设计特色：
 * - 居中卡片布局
 * - 统一渐变网格背景
 * - 玻璃态效果
 * - 密码可见性切换
 * - 支持邮箱/手机号两种方式
 * - 完美主题适配
 */
export const ResetPassword: React.FC = () => {
  useDocumentTitle(t('重置密码'));
  const navigate = useNavigate();
  const location = useLocation();
  const { config: brandConfig } = useBrandConfig();
  const { isDark } = useTheme();

  const appName = brandConfig?.title || 'CloudCAD';
  const appLogo = brandConfig?.logo || '/logo.png';

  const emailFromState = (location.state as LocationState)?.email || '';
  const phoneFromState = (location.state as LocationState)?.phone || '';
  const contactType = emailFromState ? 'email' : 'phone';

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const resetPassword = useResetPassword();
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit: rhfSubmit } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      code: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: ResetPasswordValues) => {
    const ok = await resetPassword.submit({
      email: emailFromState || undefined,
      phone: phoneFromState || undefined,
      code: data.code,
      newPassword: data.newPassword,
      confirmPassword: data.confirmPassword,
    });

    if (ok) {
      setSuccess(true);
      setTimeout(() => {
        navigate('/login', {
          state: { message: t('密码重置成功，请使用新密码登录') },
        });
      }, 2000);
    }
  };

  // 重置成功状态
  if (success) {
    return (
      <div className={styles.authPage} data-theme={isDark ? 'dark' : 'light'}>
        <InteractiveBackground />

        <div
          className={styles.themeToggleWrapper}
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
        >
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        <div className={styles.authContainer}>
          <div className={styles.authCard}>
            <div className={styles.successContent}>
              <div className={styles.successIcon}>
                <CheckCircle size={32} />
              </div>
              <h2 className={styles.successTitle}>{t('密码重置成功！')}</h2>
              <p className={styles.successSubtitle}>
                {t('即将自动跳转到登录页...')}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.authPage} data-theme={isDark ? 'dark' : 'light'}>
      <InteractiveBackground />

      <div className={styles.themeToggleWrapper}>
        <ThemeToggle />
      </div>

      <div className={styles.authContainer}>
        <div className={styles.authCard}>
          {/* Logo */}
          <div className={styles.logoSection}>
            <div className={styles.logoWrapper}>
              <div className={styles.logoGlow} />
              <img src={appLogo} alt={appName} className={styles.logoImage} />
            </div>
            <h1 className={styles.appTitle}>{appName}</h1>
            <p className={styles.appTagline}>{t('重置您的账户密码')}</p>
          </div>

          {/* 表单头部 */}
          <div className={styles.formHeader}>
            <h2 className={styles.formTitle}>{t('设置新密码')}</h2>
            <p className={styles.formSubtitle}>{t('请输入验证码和新密码')}</p>
          </div>

          {/* 错误提示 */}
          {resetPassword.error && (
            <div className={`${styles.alert} ${styles.alertError}`}>
              <AlertCircle size={18} className={styles.alertIcon} />
              <span>{resetPassword.error}</span>
            </div>
          )}

          {/* 表单 */}
          <form className={styles.authForm} onSubmit={rhfSubmit(onSubmit)}>
            {contactType === 'email' ? (
              <div className={styles.inputGroup}>
                <label htmlFor="email" className={styles.inputLabel}>
                  {t('邮箱地址')}
                </label>
                <div className={styles.inputWrapper}>
                  <Mail size={18} className={styles.inputIcon} />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className={styles.inputField}
                    placeholder={t('请输入邮箱地址')}
                    value={emailFromState}
                    readOnly
                  />
                  <div className={styles.inputGlow} />
                </div>
              </div>
            ) : (
              <div className={styles.inputGroup}>
                <label htmlFor="phone" className={styles.inputLabel}>
                  {t('手机号码')}
                </label>
                <div className={styles.inputWrapper}>
                  <Phone size={18} className={styles.inputIcon} />
                  <input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    className={styles.inputField}
                    placeholder={t('请输入手机号码')}
                    value={phoneFromState}
                    readOnly
                  />
                  <div className={styles.inputGlow} />
                </div>
              </div>
            )}

            <div className={styles.inputGroup}>
              <label htmlFor="code" className={styles.inputLabel}>
                {t('验证码')}
              </label>
              <div className={styles.inputWrapper}>
                <KeyRound size={18} className={styles.inputIcon} />
                <input
                  id="code"
                  type="text"
                  maxLength={6}
                  className={styles.inputField}
                  placeholder={t('请输入6位验证码')}
                  {...register('code')}
                />
                <div className={styles.inputGlow} />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="newPassword" className={styles.inputLabel}>
                {t('新密码')}
              </label>
              <div className={styles.inputWrapper}>
                <Lock size={18} className={styles.inputIcon} />
                <input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={styles.inputField}
                  placeholder={t('新密码（至少8个字符）')}
                  {...register('newPassword')}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="absolute right-4"
                  icon={showPassword ? EyeOff : Eye}
                  onClick={() => setShowPassword(!showPassword)}
                />
                <div className={styles.inputGlow} />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="confirmPassword" className={styles.inputLabel}>
                {t('确认新密码')}
              </label>
              <div className={styles.inputWrapper}>
                <Lock size={18} className={styles.inputIcon} />
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={styles.inputField}
                  placeholder={t('请再次输入新密码')}
                  {...register('confirmPassword')}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="absolute right-4"
                  icon={showConfirmPassword ? EyeOff : Eye}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                />
                <div className={styles.inputGlow} />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={resetPassword.loading}
              icon={ArrowRight}
            >
              {t('重置密码')}
            </Button>
          </form>

          {/* 返回登录 */}
          <div className={styles.formFooter}>
            <Button
              variant="secondary"
              size="lg"
              icon={ArrowLeft}
              onClick={() => navigate('/login')}
            >
              {t('返回登录')}
            </Button>
          </div>

          {/* 特性图标 */}
          <div className={styles.featuresBar}>
            <div
              className={styles.featureDot}
              data-tooltip={t('高性能 CAD 在线预览')}
            >
              <Cpu size={14} />
            </div>
            <div
              className={styles.featureDot}
              data-tooltip={t('多用户实时协同编辑')}
            >
              <Boxes size={14} />
            </div>
            <div
              className={styles.featureDot}
              data-tooltip={t('企业级数据安全保障')}
            >
              <ShieldCheck size={14} />
            </div>
          </div>
        </div>

        <p className={styles.copyright}>
          © 2026 {appName}. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default ResetPassword;
