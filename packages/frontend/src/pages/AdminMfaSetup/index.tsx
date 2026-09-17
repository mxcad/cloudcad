///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTheme } from '@/contexts/ThemeContext';
import {
  ShieldCheck,
  KeyRound,
  Smartphone,
  CheckCircle2,
} from 'lucide-react';
import {
  adminMfaControllerSetup,
  adminMfaControllerBind,
} from '@/api-sdk';
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

/**
 * 管理员 TOTP 双因素绑定页（#415 等保 8.1.4.1(d)）
 *
 * 未绑定 TOTP 的管理员登录后被锁定至此（后端 JwtStrategy 层拦截其余后台端点）：
 * - 绑定准备：调 /admin/auth/mfa/setup 取密钥 + otpauth 链接，渲染二维码（qrcode.react）；
 * - 首码激活：验证器 App 扫码后输入当前 6 位动态码，调 /admin/auth/mfa/bind 置启用标志；
 * - 激活成功 → 锁定自动解除，进入管理后台；
 * - 解绑仅走运维 CLI（MFA_UNBIND 审计），本页无解绑入口。
 */
const AdminMfaSetup: React.FC = () => {
  useDocumentTitle(t('绑定双因素认证'));
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();

  const [setupLoading, setSetupLoading] = useState(true);
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appBrandConfig = getDefaultAppBrandConfig();

  // 绑定准备：拉取密钥 + otpauth 链接（幂等，复用未启用的既有密钥，二维码稳定）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminMfaControllerSetup();
        if (res.error) throw res.error;
        if (cancelled) return;
        setSecret(res.data!.secret);
        setOtpauthUrl(res.data!.otpauthUrl);
      } catch (err) {
        if (cancelled) return;
        const { message } = getErrorInfo(err);
        // 已启用 TOTP（409）→ 锁定应已解除，直接进入管理后台
        if (/已启用|already/i.test(message)) {
          navigate('/admin/ip-access', { replace: true });
          return;
        }
        setError(message || t('加载双因素绑定信息失败'));
      } finally {
        if (!cancelled) setSetupLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleBind = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (loading) return;
      const normalized = code.replace(/\s+/g, '');
      if (normalized.length < 6) {
        setError(t('请输入 6 位动态码'));
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await adminMfaControllerBind({ body: { code: normalized } });
        if (res.error) throw res.error;
        // 绑定成功 → 锁定解除，进入管理后台
        navigate('/admin/ip-access', { replace: true });
      } catch (err) {
        const { message } = getErrorInfo(err);
        setError(message || t('动态码错误，请重试'));
        setCode('');
      } finally {
        setLoading(false);
      }
    },
    [code, loading, navigate]
  );

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
            appTagline={t('安全合规要求：管理员需启用双因素认证')}
          />

          {/* 错误提示 */}
          {error && (
            <div className={`${styles.alert} ${styles.alertError}`}>
              <ShieldCheck size={18} className={styles.alertIcon} />
              <span>{error}</span>
            </div>
          )}

          {setupLoading ? (
            <div className={styles.loginForm}>
              <div className="flex items-center justify-center gap-2 py-6">
                <CheckCircle2 size={20} className="animate-spin" />
                <span style={{ color: 'var(--text-secondary)' }}>
                  {t('加载绑定信息...')}
                </span>
              </div>
            </div>
          ) : (
            <>
              {/* 步骤一：扫码绑定 */}
              <div className={styles.loginForm}>
                <div
                  className="flex flex-col items-center gap-3 py-2"
                  style={{ textAlign: 'center' }}
                >
                  <Smartphone
                    size={28}
                    style={{ color: 'var(--text-secondary)' }}
                  />
                  <p style={{ color: 'var(--text-secondary)' }}>
                    {t('使用 Google Authenticator / 1Password 等验证器 App 扫描二维码')}
                  </p>
                  <div
                    className="p-3"
                    style={{
                      background: 'var(--bg-primary)',
                      borderRadius: '0.75rem',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <QRCodeSVG value={otpauthUrl} size={180} level="M" />
                  </div>
                  <div
                    className="flex items-center gap-2"
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <KeyRound size={14} style={{ color: 'var(--text-secondary)' }} />
                    <span
                      style={{
                        fontFamily: 'monospace',
                        letterSpacing: '0.1em',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {secret}
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                    {t('无法扫码？手动输入上方密钥到验证器 App')}
                  </p>
                </div>
              </div>

              {/* 步骤二：首码激活 */}
              <form className={styles.loginForm} onSubmit={handleBind}>
                <div className={styles.inputGroup}>
                  <label htmlFor="mfa-code" className={styles.inputLabel}>
                    {t('输入验证器 App 当前显示的 6 位动态码')}
                  </label>
                  <div className={styles.inputWrapper}>
                    <KeyRound size={18} className={styles.inputIcon} />
                    <input
                      id="mfa-code"
                      name="mfa-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      className={styles.inputField}
                      placeholder={t('例如 123456')}
                      value={code}
                      onChange={(e) =>
                        setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 8))
                      }
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
                    <span>{t('激活中...')}</span>
                  ) : (
                    <span>{t('激活双因素认证')}</span>
                  )}
                </Button>
              </form>
            </>
          )}

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

export default AdminMfaSetup;
