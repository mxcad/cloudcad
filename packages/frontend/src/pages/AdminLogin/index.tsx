///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTheme } from '@/contexts/ThemeContext';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { InteractiveBackground } from '@/components/InteractiveBackground';
import { LoginHeader } from '@/pages/Login/components/LoginHeader';
import { getDefaultAppBrandConfig } from '@/constants/appConfig';
import { t } from '@/languages';
import styles from '../Login/Login.module.css';

/**
 * 管理员独立登录页面（/admin-login）
 *
 * 与普通登录（/login）隔离：
 * - 走专用接口 POST /admin/auth/login（后端做 ADMIN 角色 + IP 白名单校验）；
 * - 登录成功写入标准登录态，进入管理后台（复用既有鉴权/权限链路）；
 * - 账号/密码错误、非管理员、IP 不在白名单均展示通用防枚举文案。
 */
const AdminLogin: React.FC = () => {
  useDocumentTitle(t('管理员登录'));
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { adminLogin } = useAuth();
  const { isDark } = useTheme();

  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appBrandConfig = getDefaultAppBrandConfig();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await adminLogin(account.trim(), password);
      // 管理员登录成功 → 进入 IP 白名单管理后台（管理员拥有全部系统权限）
      const redirect = searchParams.get('redirect');
      navigate(redirect && redirect.startsWith('/admin') ? redirect : '/admin/ip-whitelist', {
        replace: true,
      });
    } catch (err: unknown) {
      const errAny = err as Record<string, unknown>;
      const errResponse = errAny?.response as Record<string, unknown> | undefined;
      const errorData = errResponse?.data as Record<string, unknown> | undefined;
      const errorBody = (errorData ?? errAny) as Record<string, unknown>;
      setError(
        (errorBody?.message as string) ||
          (err as Error).message ||
          t('登录失败，请检查账号和密码')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginPage} data-theme={isDark ? 'dark' : 'light'}>
      <InteractiveBackground />

      <div
        className={styles.themeToggleWrapper}
        style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
      >
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className={styles.loginContainer}>
        <div className={styles.loginCard}>
          <LoginHeader
            appLogo={appBrandConfig.logo || '/logo.png'}
            appName={`${t('管理员')} · ${appBrandConfig.title || 'CloudCAD'}`}
            appTagline={t('仅限系统管理员登录，需 IP 白名单校验')}
          />

          {/* 错误提示 */}
          {error && (
            <div className={`${styles.alert} ${styles.alertError}`}>
              <ShieldCheck size={18} className={styles.alertIcon} />
              <span>{error}</span>
            </div>
          )}

          <form className={styles.loginForm} onSubmit={handleSubmit}>
            <div
              className={`${styles.inputGroup} ${focusedField === 'account' ? styles.focused : ''}`}
            >
              <label htmlFor="admin-account" className={styles.inputLabel}>
                {t('管理员账号')}
              </label>
              <div className={styles.inputWrapper}>
                <Mail
                  size={18}
                  className={`${styles.inputIcon} ${focusedField === 'account' ? styles.active : ''}`}
                />
                <input
                  id="admin-account"
                  name="account"
                  type="text"
                  autoComplete="username"
                  required
                  className={styles.inputField}
                  placeholder={t('请输入管理员账号')}
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  onFocus={() => setFocusedField('account')}
                  onBlur={() => setFocusedField(null)}
                />
                <div className={styles.inputGlow} />
              </div>
            </div>

            <div
              className={`${styles.inputGroup} ${focusedField === 'password' ? styles.focused : ''}`}
            >
              <label htmlFor="admin-password" className={styles.inputLabel}>
                {t('密码')}
              </label>
              <div className={styles.inputWrapper}>
                <Lock
                  size={18}
                  className={`${styles.inputIcon} ${focusedField === 'password' ? styles.active : ''}`}
                />
                <input
                  id="admin-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className={`${styles.inputField} ${styles.hasToggle}`}
                  placeholder={t('请输入密码')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                />
                <Button
                  type="button"
                  variant="icon"
                  size="xs"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  icon={showPassword ? EyeOff : Eye}
                  tooltip={showPassword ? t('隐藏密码') : t('显示密码')}
                />
                <div className={styles.inputGlow} />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full"
            >
              {loading ? (
                <span>{t('登录中...')}</span>
              ) : (
                <>
                  <span>{t('管理员登录')}</span>
                  <ArrowRight size={18} className={styles.buttonArrow} />
                </>
              )}
            </Button>
          </form>

          <div className={styles.formFooter}>
            <p className={styles.registerText}>
              {t('返回')}
              <Button
                variant="secondary"
                size="xs"
                onClick={() => navigate('/login')}
              >
                {t('普通用户登录')}
              </Button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
