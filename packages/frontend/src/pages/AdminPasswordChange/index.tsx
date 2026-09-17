///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTheme } from '@/contexts/ThemeContext';
import { usePasswordChange } from '@/pages/Profile/hooks/usePasswordChange';
import {
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { InteractiveBackground } from '@/components/InteractiveBackground';
import { LoginHeader } from '@/pages/Login/components/LoginHeader';
import { getDefaultAppBrandConfig } from '@/constants/appConfig';
import { t } from '@/languages';
import styles from '../Login/Login.module.css';

/** 从 SDK 抛出的错误对象提取后端 code / message */
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

/** 口令策略最小长度（与后端 passwordPolicy.minLength 默认值一致） */
const MIN_PASSWORD_LENGTH = 10;

/**
 * 校验新口令是否满足复杂度要求（大小写/数字/特殊字符四类至少三类）。
 * 与后端 PasswordPolicyService.assertPasswordPolicy 同规则，前端提前给出实时反馈。
 */
function meetsComplexity(password: string): boolean {
  return [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length >= 3;
}

/**
 * 管理员强制改密页（#416 等保 8.1.4.1 a)/b)）
 *
 * 触发条件（后端 JwtStrategy 层实时判定 passwordChangedAt）：
 * - passwordChangedAt=null → 首登未改密（初始管理员，创建时特意置 null）；
 * - passwordChangedAt 距今 >180 天 → 到期强制改密；
 * 触发后锁定至本页：仅改密 / profile 刷新 / 登出可用，后台其余端点一律 403。
 * 改密成功（后端写 passwordChangedAt=now）后锁定自动解除，无需刷新 token。
 *
 * 与 AdminMfaSetup（#415 TOTP 绑定页）同构：共用 Login.module.css 视觉、
 * 独立于后台 Layout 渲染（后台 Layout 的菜单/数据请求会被锁定拦截）。
 */
const AdminPasswordChange: React.FC = () => {
  useDocumentTitle(t('修改管理员密码'));
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const { isDark } = useTheme();
  const { changePassword, loading } = usePasswordChange();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [focused, setFocused] = useState<'old' | 'new' | 'confirm' | null>(null);
  const [showPassword, setShowPassword] = useState({
    old: false,
    new: false,
    confirm: false,
  });
  const [error, setError] = useState<string | null>(null);
  // mutation 的 isPending 覆盖真实请求；submitting 仅作防重复提交护栏
  const [submitting, setSubmitting] = useState(false);

  const appBrandConfig = getDefaultAppBrandConfig();

  // 首登未改密 / 超期到期 / 主动提前修改（从 Layout 提示条进入，后端未下发强制标记）
  const reason =
    (user as { passwordChangeRequired?: 'first_login' | 'expired' })
      ?.passwordChangeRequired;

  const reasonText =
    reason === 'first_login'
      ? t('首次登录未修改初始密码，请设置新密码')
      : reason === 'expired'
        ? t('当前密码已超过有效期，请设置新密码')
        : t('建议定期更换密码，可降低账号被盗风险');

  const checks = useMemo(
    () => [
      { label: t(`至少 ${MIN_PASSWORD_LENGTH} 位`), ok: newPassword.length >= MIN_PASSWORD_LENGTH },
      { label: t('包含大写字母'), ok: /[A-Z]/.test(newPassword) },
      { label: t('包含小写字母'), ok: /[a-z]/.test(newPassword) },
      { label: t('包含数字'), ok: /\d/.test(newPassword) },
      { label: t('包含特殊字符'), ok: /[^a-zA-Z0-9]/.test(newPassword) },
    ],
    [newPassword]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || submitting) return;
    if (!oldPassword) {
      setError(t('请输入当前密码'));
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t(`新密码长度至少 ${MIN_PASSWORD_LENGTH} 位`));
      return;
    }
    if (!meetsComplexity(newPassword)) {
      setError(t('新密码需包含大小写字母、数字、特殊字符中至少三类'));
      return;
    }
    if (newPassword === oldPassword) {
      setError(t('新密码不能与当前密码相同'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('两次输入的新密码不一致'));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await changePassword({ oldPassword, newPassword });
      // 刷新用户态（后端 /auth/profile 返回新的口令到期状态），提示条随之消失
      await refreshUser();
      navigate('/admin/ip-access', { replace: true });
    } catch (err) {
      const { message } = getErrorInfo(err);
      setError(message || t('修改密码失败，请重试'));
    } finally {
      setSubmitting(false);
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
            appTagline={t('安全合规要求：管理员密码必须定期更换')}
          />

          {/* 锁定原因（强制）/ 主动修改提示 */}
          <div
            className={`${styles.alert} ${
              reason ? styles.alertError : styles.alertSuccess
            }`}
          >
            <ShieldCheck size={18} className={styles.alertIcon} />
            <span>{reasonText}</span>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className={`${styles.alert} ${styles.alertError}`}>
              <KeyRound size={18} className={styles.alertIcon} />
              <span>{error}</span>
            </div>
          )}

          <form className={styles.loginForm} onSubmit={handleSubmit}>
            <div className={styles.inputGroup}>
              <label htmlFor="admin-old-password" className={styles.inputLabel}>
                {t('当前密码')}
              </label>
              <div className={styles.inputWrapper}>
                <KeyRound
                  size={18}
                  className={`${styles.inputIcon} ${focused === 'old' ? styles.active : ''}`}
                />
                <input
                  id="admin-old-password"
                  name="old-password"
                  type={showPassword.old ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className={styles.inputField}
                  placeholder={t('请输入当前密码')}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  onFocus={() => setFocused('old')}
                  onBlur={() => setFocused(null)}
                />
                <Button
                  type="button"
                  variant="icon"
                  size="xs"
                  onClick={() =>
                    setShowPassword((v) => ({ ...v, old: !v.old }))
                  }
                  tabIndex={-1}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  icon={showPassword.old ? EyeOff : Eye}
                  tooltip={showPassword.old ? t('隐藏密码') : t('显示密码')}
                />
                <div className={styles.inputGlow} />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="admin-new-password" className={styles.inputLabel}>
                {t('新密码')}
              </label>
              <div className={styles.inputWrapper}>
                <KeyRound
                  size={18}
                  className={`${styles.inputIcon} ${focused === 'new' ? styles.active : ''}`}
                />
                <input
                  id="admin-new-password"
                  name="new-password"
                  type={showPassword.new ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className={styles.inputField}
                  placeholder={t('请输入新密码')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onFocus={() => setFocused('new')}
                  onBlur={() => setFocused(null)}
                />
                <Button
                  type="button"
                  variant="icon"
                  size="xs"
                  onClick={() =>
                    setShowPassword((v) => ({ ...v, new: !v.new }))
                  }
                  tabIndex={-1}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  icon={showPassword.new ? EyeOff : Eye}
                  tooltip={showPassword.new ? t('隐藏密码') : t('显示密码')}
                />
                <div className={styles.inputGlow} />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="admin-confirm-password" className={styles.inputLabel}>
                {t('确认新密码')}
              </label>
              <div className={styles.inputWrapper}>
                <KeyRound
                  size={18}
                  className={`${styles.inputIcon} ${focused === 'confirm' ? styles.active : ''}`}
                />
                <input
                  id="admin-confirm-password"
                  name="confirm-password"
                  type={showPassword.confirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className={styles.inputField}
                  placeholder={t('请再次输入新密码')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onFocus={() => setFocused('confirm')}
                  onBlur={() => setFocused(null)}
                />
                <Button
                  type="button"
                  variant="icon"
                  size="xs"
                  onClick={() =>
                    setShowPassword((v) => ({ ...v, confirm: !v.confirm }))
                  }
                  tabIndex={-1}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  icon={showPassword.confirm ? EyeOff : Eye}
                  tooltip={
                    showPassword.confirm ? t('隐藏密码') : t('显示密码')
                  }
                />
                <div className={styles.inputGlow} />
              </div>
            </div>

            {/* 口令策略提示（与后端 PasswordPolicyService 同规则） */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                padding: '0.75rem',
                background: 'var(--bg-secondary)',
                borderRadius: '0.5rem',
                border: '1px solid var(--border-default)',
              }}
            >
              {checks.map((c) => (
                <span
                  key={c.label}
                  style={
                    c.ok
                      ? { color: 'var(--text-secondary)', fontSize: '0.8rem' }
                      : { color: 'var(--text-tertiary)', fontSize: '0.8rem' }
                  }
                >
                  {c.ok ? '✓' : '·'} {c.label}
                </span>
              ))}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading || submitting}
              className="w-full"
            >
              {loading || submitting ? (
                <span>{t('提交中...')}</span>
              ) : (
                <>
                  <span>{t('设置新密码')}</span>
                  <ArrowRight size={18} className={styles.buttonArrow} />
                </>
              )}
            </Button>
          </form>

          <div className={styles.formFooter}>
            <p className={styles.registerText} style={{ textAlign: 'center' }}>
              {user?.username ? t('当前账号：') : ''}
              {user?.username}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPasswordChange;
