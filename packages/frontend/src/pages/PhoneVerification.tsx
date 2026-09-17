import { getCopyrightLine } from '@/constants/appConfig';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePhoneVerification } from '../hooks/usePhoneVerification';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { t } from '@/languages';
import { useBrandConfig } from '../contexts/BrandContext';
import { useTheme } from '../contexts/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { InteractiveBackground } from '../components/InteractiveBackground';

// Lucide 图标
import { Phone } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { CheckCircle } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import { Cpu } from 'lucide-react';
import { Boxes } from 'lucide-react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import styles from './PhoneVerification.module.css';

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * 手机号验证页面 - CloudCAD
 *
 * 用于已注册但手机号未验证的用户，验证成功后自动登录
 */
export const PhoneVerification: React.FC = () => {
  useDocumentTitle(t('手机号验证'));
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyPhoneAndLogin, isAuthenticated } = useAuth();
  const { bindPhoneAndLogin, sendSmsCode } = usePhoneVerification();
  const { config: brandConfig } = useBrandConfig();
  const { isDark } = useTheme();

  const appName = brandConfig?.title || 'CloudCAD';
  const appLogo = brandConfig?.logo || '/logo.png';

  // 绑定模式：用户没有手机号，需要先输入手机号再验证
  const bindMode = location.state?.mode === 'bind';
  const tempToken = location.state?.tempToken || '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [phone, setPhone] = useState<string>('');
  const [codeSent, setCodeSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState<string>('');

  // 重发验证码相关状态
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSuccess, setResendSuccess] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
      return;
    }

    const statePhone = location.state?.phone;
    if (statePhone) {
      setPhone(statePhone);
      // 非绑定模式下已有手机号，直接可以发送验证码
      if (location.state?.mode !== 'bind') {
        setCodeSent(true);
      }
    }
  }, [location, navigate, isAuthenticated]);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      setError(t('请输入验证码'));
      return;
    }
    if (verificationCode.length !== 6) {
      setError(t('验证码应为6位数字'));
      return;
    }
    if (!phone) {
      setError(bindMode ? t('请输入手机号') : t('手机号缺失，请重新登录'));
      return;
    }

    // 绑定模式下验证手机号格式
    if (bindMode && !/^1[3-9]\d{9}$/.test(phone)) {
      setError(t('请输入正确的手机号'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (bindMode) {
        // 绑定模式：调用绑定手机号接口，返回 token 后存储并通过刷新更新 AuthContext
        const response = await bindPhoneAndLogin({
          tempToken,
          phone,
          code: verificationCode.trim(),
        });
        if (!response) throw new Error(t('绑定手机号失败'));
        const { accessToken, refreshToken, user: userData } = response;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(userData));
        // 直接刷新页面，让 AuthContext 从 localStorage 重新初始化
        window.location.href = '/';
        return;
      } else {
        // 验证模式：调用验证手机号接口
        await verifyPhoneAndLogin(phone, verificationCode.trim());
      }
      setSuccess(true);
      // 验证成功（自动登录），直接跳转到首页
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 1500);
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('验证失败，请检查验证码是否正确或已过期')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = useCallback(async () => {
    if (!phone) {
      setError(bindMode ? t('请先输入手机号') : t('手机号缺失，请重新登录'));
      return;
    }

    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError(t('请输入正确的手机号'));
      return;
    }

    if (resendCooldown > 0 || resendLoading) return;

    setResendLoading(true);
    setError(null);
    setResendSuccess(false);

    try {
      await sendSmsCode(phone, bindMode ? 'bind' : 'login');
      setResendSuccess(true);
      setCodeSent(true);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setTimeout(() => setResendSuccess(false), 5000);
    } catch (err) {
      const errorMessage =
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
        (err as Error).message ||
        t('发送失败，请稍后重试');
      setError(errorMessage);
    } finally {
      setResendLoading(false);
    }
  }, [phone, resendCooldown, resendLoading, bindMode]);

  // 验证成功状态
  if (success) {
    return (
      <div className={styles.authPage} data-theme={isDark ? 'dark' : 'light'}>
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
              <h2 className={styles.successTitle}>{t('手机号验证成功！')}</h2>
              <p className={styles.successSubtitle}>
                {t('账号已激活，即将自动跳转...')}
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
            <p className={styles.appTagline}>
              {bindMode ? t('绑定您的手机号') : t('验证您的手机号')}
            </p>
          </div>

          {/* 手机号提示 */}
          <div className={styles.phoneNotice}>
            <div className={styles.phoneIcon}>
              <Phone size={24} />
            </div>
            {bindMode && !codeSent ? (
              <p className={styles.phoneText}>
                {t('您的账号需要绑定手机号才能继续使用')}
              </p>
            ) : phone ? (
              <p className={styles.phoneText}>
                {t('我们已向')}{' '}
                <span className={styles.phoneHighlight}>{phone}</span>{' '}
                {t('发送了验证码')}
              </p>
            ) : (
              <p className={styles.phoneText}>
                {t('请输入您收到的6位数字验证码')}
              </p>
            )}
          </div>

          {/* 绑定模式下：手机号输入框 */}
          {bindMode && !codeSent && (
            <div
              className={styles.codeSection}
              style={{ marginBottom: '1.25rem' }}
            >
              <label htmlFor="phone" className={styles.codeLabel}>
                {t('手机号')}
              </label>
              <input
                id="phone"
                type="text"
                maxLength={11}
                value={phone}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  setPhone(value);
                  if (error) setError(null);
                }}
                placeholder={t('请输入手机号')}
                className={styles.codeInput}
                style={{
                  fontSize: '1rem',
                  fontWeight: 400,
                  letterSpacing: 'normal',
                  textAlign: 'left',
                }}
                disabled={loading}
              />
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className={`${styles.alert} ${styles.alertError}`}>
              <AlertCircle size={18} className={styles.alertIcon} />
              <span>{error}</span>
            </div>
          )}

          {/* 成功提示 */}
          {resendSuccess && (
            <div className={`${styles.alert} ${styles.alertSuccess}`}>
              <CheckCircle size={18} className={styles.alertIcon} />
              <span>{t('验证码已重新发送，请查收')}</span>
            </div>
          )}

          {/* 验证码输入 */}
          <div className={styles.codeSection}>
            <label htmlFor="code" className={styles.codeLabel}>
              {t('验证码')}
            </label>
            <input
              id="code"
              type="text"
              maxLength={6}
              value={verificationCode}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '');
                setVerificationCode(value);
                if (error) setError(null);
              }}
              placeholder={t('请输入6位数字验证码')}
              className={styles.codeInput}
              disabled={loading}
            />
            <p className={styles.codeHint}>
              {t('验证码为6位数字，请查看手机短信')}
            </p>
          </div>

          {/* 验证按钮 */}
          <Button
            onClick={handleVerifyCode}
            variant="primary"
            size="lg"
            loading={loading}
            disabled={verificationCode.length !== 6}
            className="w-full mb-5"
          >
            {loading ? (
              <span>{t('验证中...')}</span>
            ) : (
              <>
                <span>{t('验证')}</span>
                <CheckCircle size={18} />
              </>
            )}
          </Button>

          {/* 帮助信息 */}
          <div className={styles.helpSection}>
            <h4 className={styles.helpTitle}>{t('没有收到验证码？')}</h4>
            <ul className={styles.helpList}>
              <li>&#8226; {t('检查手机号是否正确')}</li>
              <li>&#8226; {t('检查短信是否被拦截')}</li>
              <li>&#8226; {t('验证码15分钟内有效')}</li>
            </ul>
          </div>

          {/* 重发和返回按钮 */}
          <div className={styles.actionButtons}>
            <Button
              onClick={handleResendCode}
              variant="secondary"
              size="lg"
              loading={resendLoading}
              disabled={resendCooldown > 0 || !phone}
              className="w-full"
            >
              {resendCooldown > 0 ? (
                <>
                  <RefreshCw size={16} />
                  <span>
                    {t(`{cooldown}秒后可重新发送`).replace(
                      '{cooldown}',
                      String(resendCooldown)
                    )}
                  </span>
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  <span>
                    {!codeSent && bindMode
                      ? t('发送验证码')
                      : t('重新发送验证码')}
                  </span>
                </>
              )}
            </Button>

            <Button
              variant="secondary"
              size="lg"
              onClick={() => navigate('/login')}
            >
              <ArrowLeft size={16} />
              <span>{t('返回登录')}</span>
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

        <p className={styles.copyright}>{getCopyrightLine(appName)}</p>
      </div>
    </div>
  );
};

export default PhoneVerification;
