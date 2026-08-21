import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useRuntimeConfig } from '../../contexts/RuntimeConfigContext';
import { useWechatAuth } from '../../hooks/useWechatAuth';
import { usePermission } from '../../hooks/usePermission';
import { useNotification } from '../../contexts/NotificationContext';
import { useWechatBind, isWechatBindConflict } from './hooks/useWechatBind';
import { getErrorMessage } from '@/utils/errorHandler';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useTheme } from '../../contexts/ThemeContext';
import { t } from '@/languages';
import { Button, TabButton, Tabs } from '@/components/ui';
import { useMembership } from '@/hooks/useMembership';
import { ProfileInfoTab } from './ProfileInfoTab';
import { ProfilePasswordTab } from './ProfilePasswordTab';
import { ProfileEmailTab } from './ProfileEmailTab';
import { ProfilePhoneTab } from './ProfilePhoneTab';
import { ProfileWechatTab } from './ProfileWechatTab';
import { ProfileDeactivateTab } from './ProfileDeactivateTab';
import { ProfileHeader } from './ProfileHeader';
import { usePasswordProfile } from './hooks/usePasswordProfile';
import { useEmailProfile } from './hooks/useEmailProfile';
import { usePhoneProfile } from './hooks/usePhoneProfile';
import { useDeactivateProfile } from './hooks/useDeactivateProfile';
import styles from './Profile.module.css';

type TabType = 'info' | 'deactivate';

type InfoSubView = 'grid' | 'password' | 'email' | 'phone' | 'wechat';

export const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuth();
  const { config: runtimeConfig } = useRuntimeConfig();
  const { isAdmin } = usePermission();
  const { isDark } = useTheme();
  const { showToast, showConfirm } = useNotification();
  const { bindWechat, unbindWechat } = useWechatBind();

  const mailEnabled = runtimeConfig.mailEnabled;
  const smsEnabled = runtimeConfig.smsEnabled ?? false;
  const wechatEnabled = runtimeConfig.wechatEnabled ?? false;

  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [infoSubView, setInfoSubView] = useState<InfoSubView>('grid');
  const membership = useMembership();

  useDocumentTitle(t('个人资料'));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('wechat_result')) {
      try {
        const hashValue = hash.split('wechat_result=')[1];
        if (hashValue) {
          const result = JSON.parse(decodeURIComponent(hashValue));
          if (result.purpose === 'bind') {
            setActiveTab('info');
            setInfoSubView('wechat');
          } else if (result.purpose === 'deactivate')
            setActiveTab('deactivate');
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  const { open: wechatBindOpen } = useWechatAuth({
    purpose: 'bind',
    onSuccess: async (result) => {
      try {
        const bindRes = await bindWechat({
          code: result.code!,
          state: result.state!,
        });
        if (bindRes?.success) {
          setSuccess(t('微信绑定成功'));
          await refreshUser();
        } else {
          setError(bindRes?.message || t('绑定失败'));
        }
      } catch (bindErr) {
        // 该微信已绑定其他账号（409，code=CONFLICT）：询问是否接管绑定——
        // 典型场景：解绑后微信登录自动注册了新账号占用了 openid，原账号重新绑定
        if (isWechatBindConflict(bindErr)) {
          const confirmed = await showConfirm({
            title: t('绑定微信'),
            message: t(
              '该微信已绑定其他账号，是否解绑该账号的微信并绑定到当前账号？'
            ),
            confirmText: t('确认接管绑定'),
            cancelText: t('取消'),
            type: 'warning',
          });
          if (confirmed) {
            try {
              const takeoverRes = await bindWechat({
                code: result.code!,
                state: result.state!,
                takeover: true,
              });
              if (takeoverRes?.success) {
                setSuccess(t('微信绑定成功'));
                await refreshUser();
              } else {
                setError(takeoverRes?.message || t('绑定失败'));
              }
            } catch (takeoverErr) {
              setError(getErrorMessage(takeoverErr));
            }
          } else {
            setError(t('该微信已绑定其他账号'));
          }
        } else {
          setError(getErrorMessage(bindErr));
        }
      }
      setLoading(false);
    },
    onError: (errorMsg) => {
      setError(errorMsg);
      setLoading(false);
    },
  });

  const passwordProfile = usePasswordProfile({
    error,
    success,
    setError,
    setSuccess,
    setLoading,
  });

  const emailProfile = useEmailProfile({
    error,
    success,
    setError,
    setSuccess,
    setLoading,
  });

  const phoneProfile = usePhoneProfile({
    error,
    success,
    setError,
    setSuccess,
    setLoading,
  });

  const deactivateProfile = useDeactivateProfile({
    setError,
    setSuccess,
  });

  const handleUnbindWechat = async () => {
    const confirmed = await showConfirm({
      title: t('解绑微信'),
      message: t('确定要解绑微信吗？解绑后需要重新绑定。'),
      confirmText: t('确认解绑'),
      cancelText: t('取消'),
      type: 'warning',
    });
    if (!confirmed) return;
    try {
      setLoading(true);
      setError(null);
      const response = await unbindWechat();
      if (response?.success) {
        showToast(t('微信解绑成功'), 'success');
        setSuccess(t('微信解绑成功'));
        await refreshUser();
      } else {
        setError(response?.message || t('解绑失败'));
        showToast(response?.message || t('解绑失败'), 'error');
      }
    } catch (err) {
      const errorMsg =
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
        (err as Error).message ||
        t('解绑失败');
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetInfoSubForms = () => {
    setInfoSubView('grid');
    emailProfile.setIsEditingEmail(false);
    emailProfile.setEmailStep('input');
    phoneProfile.setIsEditingPhone(false);
    phoneProfile.setPhoneStep('verifyOld');
  };

  const switchTab = (tab: TabType) => {
    setActiveTab(tab);
    resetInfoSubForms();
    setError(null);
    setSuccess(null);
  };

  return (
    <div
      className={`min-h-screen p-6 ${styles.profilePage}`}
      data-theme={isDark ? 'dark' : 'light'}
    >
      <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(-1)}>
        {t('返回')}
      </Button>

      <div className={styles.profileContainer}>
        <div className={styles.profileCard}>
          <ProfileHeader
            user={user}
            isAdmin={isAdmin()}
            membership={membership}
            avatarUploading={passwordProfile.avatarUploading}
            fileInputRef={passwordProfile.fileInputRef}
            onAvatarChange={passwordProfile.handleAvatarChange}
            onNavigate={navigate}
          />

          <Tabs className="ml-6 mr-6 mt-6">
            <TabButton
              active={activeTab === 'info'}
              icon={User}
              onClick={() => switchTab('info')}
            >
              {t('个人信息')}
            </TabButton>
            <TabButton
              active={activeTab === 'deactivate'}
              icon={AlertTriangle}
              onClick={() => switchTab('deactivate')}
            >
              {t('注销账户')}
            </TabButton>
          </Tabs>

          {success && (
            <div className={`${styles.alert} ${styles.alertSuccess}`}>
              <CheckCircle size={18} className={styles.alertIcon} />
              <span>{success}</span>
            </div>
          )}
          {error && (
            <div className={`${styles.alert} ${styles.alertError}`}>
              <AlertCircle size={18} className={styles.alertIcon} />
              <span>{error}</span>
            </div>
          )}

          <div className={styles.contentArea}>
            {activeTab === 'info' &&
              (infoSubView === 'grid' ? (
                <ProfileInfoTab
                  user={user}
                  mailEnabled={mailEnabled}
                  smsEnabled={smsEnabled}
                  wechatEnabled={wechatEnabled}
                  onNavigateTab={(tab) => setInfoSubView(tab)}
                />
              ) : (
                <>
                  <div className="flex justify-between items-center mb-4">
                    <h2
                      className={`text-xl font-semibold ${styles.textTextPrimary}`}
                    >
                      {infoSubView === 'password'
                        ? user?.hasPassword === false
                          ? t('设置密码')
                          : t('修改密码')
                        : infoSubView === 'email'
                          ? t('邮箱绑定')
                          : infoSubView === 'phone'
                            ? t('手机绑定')
                            : t('微信绑定')}
                    </h2>
                    <Button
                      variant="secondary"
                      icon={ArrowLeft}
                      onClick={resetInfoSubForms}
                    >
                      {t('返回')}
                    </Button>
                  </div>

                  {infoSubView === 'password' && (
                    <ProfilePasswordTab
                      user={passwordProfile.user}
                      passwordForm={passwordProfile.passwordForm}
                      focusedField={focusedField}
                      passwordStrength={passwordProfile.passwordStrength}
                      loading={loading}
                      onPasswordChange={passwordProfile.handlePasswordChange}
                      onPasswordSubmit={passwordProfile.handlePasswordSubmit}
                      onFocusField={setFocusedField}
                      onNavigate={navigate}
                    />
                  )}

                  {infoSubView === 'email' && mailEnabled && (
                    <ProfileEmailTab
                      user={user}
                      emailForm={emailProfile.emailForm}
                      emailStep={emailProfile.emailStep}
                      isEditingEmail={emailProfile.isEditingEmail}
                      countdown={emailProfile.countdown}
                      sendingCode={emailProfile.sendingCode}
                      loading={loading}
                      focusedField={focusedField}
                      mailEnabled={mailEnabled}
                      onEmailChange={emailProfile.handleEmailChange}
                      onSendBindCode={emailProfile.handleSendBindCode}
                      onVerifyBindEmail={emailProfile.handleVerifyBindEmail}
                      onResendBindCode={emailProfile.handleResendBindCode}
                      onFocusField={setFocusedField}
                      onSendUnbindCode={emailProfile.handleSendUnbindEmailCode}
                      onVerifyOldEmail={emailProfile.handleVerifyOldEmail}
                      onSendNewEmailCode={emailProfile.handleSendNewEmailCode}
                      onRebindEmail={emailProfile.handleRebindEmail}
                      onUnbindEmail={emailProfile.handleStartUnbind}
                      onSetEditingEmail={emailProfile.handleSetEditingEmail}
                      unbindMode={emailProfile.unbindMode}
                    />
                  )}

                  {infoSubView === 'phone' && smsEnabled && (
                    <ProfilePhoneTab
                      user={user}
                      phoneForm={phoneProfile.phoneForm}
                      phoneStep={phoneProfile.phoneStep}
                      isEditingPhone={phoneProfile.isEditingPhone}
                      countdown={phoneProfile.countdown}
                      sendingCode={phoneProfile.sendingCode}
                      loading={loading}
                      focusedField={focusedField}
                      unbindMode={phoneProfile.unbindMode}
                      onPhoneChange={phoneProfile.handlePhoneChange}
                      onSendPhoneCode={phoneProfile.handleSendPhoneCode}
                      onSendUnbindCode={phoneProfile.handleSendUnbindCode}
                      onVerifyOldPhone={phoneProfile.handleVerifyOldPhone}
                      onSendNewPhoneCode={phoneProfile.handleSendNewPhoneCode}
                      onRebindPhone={phoneProfile.handleRebindPhone}
                      onBindPhone={phoneProfile.handleBindPhone}
                      onUnbindPhone={phoneProfile.handleStartUnbind}
                      onFocusField={setFocusedField}
                      onSetEditingPhone={phoneProfile.handleSetEditingPhone}
                    />
                  )}

                  {infoSubView === 'wechat' && wechatEnabled && (
                    <ProfileWechatTab
                      wechatId={user?.wechatId as string | null | undefined}
                      loading={loading}
                      onBind={wechatBindOpen}
                      onUnbind={handleUnbindWechat}
                    />
                  )}
                </>
              ))}

            {activeTab === 'deactivate' && (
              <ProfileDeactivateTab
                user={deactivateProfile.user}
                deactivateForm={deactivateProfile.deactivateForm}
                deactivateLoading={deactivateProfile.deactivateLoading}
                deactivatePhoneCountdown={
                  deactivateProfile.deactivatePhoneCountdown
                }
                deactivateEmailCountdown={
                  deactivateProfile.deactivateEmailCountdown
                }
                loading={loading}
                onVerificationMethodChange={(
                  method: '' | 'password' | 'phone' | 'email' | 'wechat'
                ) =>
                  deactivateProfile.setDeactivateForm((f) => ({
                    ...f,
                    verificationMethod: method,
                    password: '',
                    phoneCode: '',
                    emailCode: '',
                    wechatCode: '',
                  }))
                }
                onPasswordChange={(password: string) =>
                  deactivateProfile.setDeactivateForm((f) => ({
                    ...f,
                    password,
                  }))
                }
                onPhoneCodeChange={(phoneCode: string) =>
                  deactivateProfile.setDeactivateForm((f) => ({
                    ...f,
                    phoneCode,
                  }))
                }
                onEmailCodeChange={(emailCode: string) =>
                  deactivateProfile.setDeactivateForm((f) => ({
                    ...f,
                    emailCode,
                  }))
                }
                onConfirmedChange={(confirmed: boolean) =>
                  deactivateProfile.setDeactivateForm((f) => ({
                    ...f,
                    confirmed,
                  }))
                }
                onSendPhoneCode={
                  deactivateProfile.handleSendDeactivatePhoneCode
                }
                onSendEmailCode={
                  deactivateProfile.handleSendDeactivateEmailCode
                }
                onWechatConfirm={(code: string) => {
                  deactivateProfile.setDeactivateForm((f) => ({
                    ...f,
                    wechatCode: code,
                  }));
                  // 授权完成 ≠ 验证通过：openid 校验在提交注销时由后端执行
                  setSuccess(t('微信授权完成，确认注销时自动验证'));
                }}
                onDeactivate={deactivateProfile.handleDeactivate}
                onShowConfirm={showConfirm}
                onLogout={logout}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
