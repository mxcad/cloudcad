///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  KeyRound,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { InteractiveBackground } from '@/components/InteractiveBackground';
import { LoginHeader } from '@/pages/Login/components/LoginHeader';
import { getDefaultAppBrandConfig } from '@/constants/appConfig';
import { t } from '@/languages';
import styles from '../Login/Login.module.css';

/** 从 SDK 抛出的错误对象提取后端 code / message（@hey-api 错误对象顶层含 code/message） */
function getErrorInfo(err: unknown): { code?: string; message: string } {
  const errAny = err as Record<string, unknown> | null;
  const code =
    typeof errAny?.code === 'string' ? (errAny.code as string) : undefined;
  const message =
    (typeof errAny?.message === 'string' && errAny.message) ||
    (err instanceof Error ? err.message : '') ||
    '';
  return { code, message };
}

/**
 * 管理员独立登录页面（/admin-login）
 *
 * 与普通登录（/login）隔离：
 * - 走专用接口 POST /admin/auth/login（后端做 ADMIN 角色 + IP 白名单校验）；
 * - 两步交互（#415 等保 8.1.4.1(d) 双因素）：
 *   第一因子（账号+密码）→ 已启用 TOTP 的管理员后端返回 MFA_REQUIRED，
 *   进入第二因子（动态码）输入，携带 totpCode 重新提交；
 * - 未绑定 TOTP 的管理员登录成功即被锁定至绑定页（/admin/mfa），
 *   完成绑定前后台其余功能不可用（后端 JwtStrategy 层拦截）；
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

  // 双因素第二因子态：MFA_REQUIRED 时进入 totp 步骤，保留已输入的账号/密码
  const [step, setStep] = useState<'password' | 'totp'>('password');
  const [totpCode, setTotpCode] = useState('');

  const appBrandConfig = getDefaultAppBrandConfig();

  /**
   * 登录成功后的落地页：
   * 未绑定 TOTP → 绑定页（#415）；口令到期/首登未改密 → 强制改密页（#416）；
   * 均无 → 管理后台。
   * 顺序与后端 JwtStrategy 一致（MFA 锁定判定先于口令锁定）：两者并存时先绑定，
   * 绑定完成后由全局错误拦截器（clientSetup）重定向至改密页。
   */
  const navigateAfterLogin = (
    mfaSetupRequired: boolean,
    passwordChangeRequired?: 'first_login' | 'expired'
  ) => {
    if (mfaSetupRequired) {
      navigate('/admin/mfa', { replace: true });
      return;
    }
    if (passwordChangeRequired) {
      navigate('/admin/change-password', { replace: true });
      return;
    }
    const redirect = searchParams.get('redirect');
    navigate(
      redirect && redirect.startsWith('/admin') ? redirect : '/admin/ip-access',
      { replace: true }
    );
  };

  /** 第一因子：账号 + 密码。MFA_REQUIRED → 进入第二因子；成功 → 落地 */
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const { mfaSetupRequired, passwordChangeRequired } = await adminLogin(
        account.trim(),
        password
      );
      navigateAfterLogin(mfaSetupRequired, passwordChangeRequired);
    } catch (err: unknown) {
      const { code, message } = getErrorInfo(err);
      if (code === 'MFA_REQUIRED') {
        // 已启用 TOTP：进入第二因子输入（保留账号/密码，无需重输）
        setStep('totp');
        setTotpCode('');
      } else {
        setError(message || t('登录失败，请检查账号和密码'));
      }
    } finally {
      setLoading(false);
    }
  };

  /** 第二因子：动态码。MFA_CODE_INVALID → 提示重试；成功 → 落地 */
  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (totpCode.replace(/\s+/g, '').length < 6) {
      setError(t('请输入 6 位动态码'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { mfaSetupRequired, passwordChangeRequired } = await adminLogin(
        account.trim(),
        password,
        totpCode.replace(/\s+/g, '')
      );
      navigateAfterLogin(mfaSetupRequired, passwordChangeRequired);
    } catch (err: unknown) {
      const { code, message } = getErrorInfo(err);
      if (code === 'MFA_CODE_INVALID') {
        setError(message || t('动态码错误，请重试'));
        setTotpCode('');
      } else {
        setError(message || t('登录失败，请检查账号和密码'));
      }
    } finally {
      setLoading(false);
    }
  };

  const backToPassword = () => {
    setStep('password');
    setTotpCode('');
    setError(null);
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

          {step === 'password' ? (
            <form className={styles.loginForm} onSubmit={handlePasswordSubmit}>
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
          ) : (
            <form className={styles.loginForm} onSubmit={handleTotpSubmit}>
              <div
                className={`${styles.inputGroup} ${focusedField === 'totp' ? styles.focused : ''}`}
              >
                <label htmlFor="admin-totp" className={styles.inputLabel}>
                  {t('双因素动态码')}
                </label>
                <div className={styles.inputWrapper}>
                  <KeyRound
                    size={18}
                    className={`${styles.inputIcon} ${focusedField === 'totp' ? styles.active : ''}`}
                  />
                  <input
                    id="admin-totp"
                    name="totp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    className={styles.inputField}
                    placeholder={t('请输入验证器 App 中的 6 位动态码')}
                    value={totpCode}
                    onChange={(e) =>
                      setTotpCode(e.target.value.replace(/[^\d]/g, '').slice(0, 8))
                    }
                    onFocus={() => setFocusedField('totp')}
                    onBlur={() => setFocusedField(null)}
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
                  <span>{t('验证中...')}</span>
                ) : (
                  <>
                    <span>{t('验证并登录')}</span>
                    <ArrowRight size={18} className={styles.buttonArrow} />
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={backToPassword}
                className="w-full"
              >
                <ArrowLeft size={16} />
                {t('返回重新输入密码')}
              </Button>
            </form>
          )}

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
