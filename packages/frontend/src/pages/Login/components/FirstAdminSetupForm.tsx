///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React, { useState } from 'react';
import {
  User,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { t } from '@/languages';
import { passwordPolicyHint, usePasswordPolicy } from '@/lib/passwordPolicy';
import styles from '../Login.module.css';

interface FirstAdminSetupFormProps {
  /** 提交创建（成功后 AuthContext 登录态翻转，页面自动跳转） */
  onSubmit: (data: {
    username: string;
    password: string;
    email?: string;
  }) => Promise<void>;
}

/**
 * 首启「创建首个管理员」表单（Web 首启页）。
 *
 * 仅在系统零用户时由登录页渲染：创建成功即自动登录进入系统。
 * 表单状态为组件私有（一次性入口，无跨组件共享需求）。
 */
export const FirstAdminSetupForm: React.FC<FirstAdminSetupFormProps> = ({
  onSubmit,
}) => {
  // 口令要求提示由生效策略值推导（/runtime-config/public 下发），禁写死策略数字
  const policy = usePasswordPolicy();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        username,
        password,
        email: email || undefined,
      });
      // 成功：登录态翻转后由页面重定向逻辑跳转，此处不额外处理
    } catch (err: unknown) {
      const errAny = err as Record<string, unknown>;
      const errResponse = errAny?.response as
        Record<string, unknown> | undefined;
      const errorData = errResponse?.data as
        Record<string, unknown> | undefined;
      const errorBody = (errorData ?? errAny) as Record<string, unknown>;
      setError(
        (errorBody?.message as string) ||
          (err as Error).message ||
          t('创建失败，请稍后重试')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className={styles.loginForm} onSubmit={handleSubmit}>
      <div className={styles.setupIntro}>
        <p className={styles.setupTitle}>{t('系统首次启动')}</p>
        <p className={styles.setupDesc}>
          {t('请创建首个管理员账号，创建后即可登录管理本系统')}
        </p>
      </div>

      {error && (
        <div className={`${styles.alert} ${styles.alertError}`}>
          <AlertCircle size={18} className={styles.alertIcon} />
          <span>{error}</span>
        </div>
      )}

      <div className={styles.inputGroup}>
        <label htmlFor="setup-username" className={styles.inputLabel}>
          {t('用户名')}
        </label>
        <div className={styles.inputWrapper}>
          <User size={18} className={styles.inputIcon} />
          <input
            id="setup-username"
            name="setup-username"
            type="text"
            autoComplete="username"
            required
            minLength={3}
            maxLength={20}
            pattern="[a-zA-Z0-9_]+"
            className={styles.inputField}
            placeholder={t('3-20 位字母、数字或下划线')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <div className={styles.inputGlow} />
        </div>
      </div>

      <div className={styles.inputGroup}>
        <label htmlFor="setup-password" className={styles.inputLabel}>
          {t('密码')}
        </label>
        <div className={styles.inputWrapper}>
          <Lock
            size={18}
            className={`${styles.inputIcon} ${showPassword ? styles.active : ''}`}
          />
          <input
            id="setup-password"
            name="setup-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={50}
            className={`${styles.inputField} ${styles.hasToggle}`}
            placeholder={passwordPolicyHint(policy)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            type="button"
            variant="icon"
            size="xs"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            className="absolute right-4 top-1/2 -translate-y-1/2"
            icon={showPassword ? EyeOff : Eye}
            tooltip={showPassword ? t('隐藏密码') : t('显示密码')}
          />
          <div className={styles.inputGlow} />
        </div>
      </div>

      <div className={styles.inputGroup}>
        <label htmlFor="setup-email" className={styles.inputLabel}>
          {t('邮箱（可选）')}
        </label>
        <div className={styles.inputWrapper}>
          <Mail size={18} className={styles.inputIcon} />
          <input
            id="setup-email"
            name="setup-email"
            type="email"
            autoComplete="email"
            className={styles.inputField}
            placeholder={t('用于接收通知，可留空')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          <span>{t('创建中...')}</span>
        ) : (
          <>
            <span>{t('创建并登录')}</span>
            <ArrowRight size={18} className={styles.buttonArrow} />
          </>
        )}
      </Button>
    </form>
  );
};
