import { useCallback, useState } from 'react';
import { useWechatAuth } from '../../hooks/useWechatAuth';
import { MessageCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { t } from '@/languages';
import styles from './Profile.module.css';

interface WechatDeactivateConfirmProps {
  /** 授权成功回调（携带授权 code，由后端换取 openid 与账户绑定微信比对） */
  onConfirm: (code: string) => void;
}

const DEACTIVATE_VERIFICATION_KEY = 'deactivate_verification_method';

export function WechatDeactivateConfirm({
  onConfirm,
}: WechatDeactivateConfirmProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSuccess = useCallback(
    async (result: { code?: string; state?: string }) => {
      try {
        if (!result.code) {
          setError(t('微信验证失败'));
          setLoading(false);
          return;
        }
        setSuccess(true);
        // 清除保存的验证方式
        sessionStorage.removeItem(DEACTIVATE_VERIFICATION_KEY);
        // 只回传授权 code，不做任何绑定操作；注销提交时由后端验证 openid 匹配
        onConfirm(result.code);
      } catch {
        setError(t('微信验证失败'));
        setLoading(false);
      }
    },
    [onConfirm]
  );

  const handleError = useCallback((errorMsg: string) => {
    setError(errorMsg);
    setLoading(false);
  }, []);

  const { open } = useWechatAuth({
    purpose: 'deactivate',
    onSuccess: handleSuccess,
    onError: handleError,
  });

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    // 跳转前保存当前验证方式
    sessionStorage.setItem(DEACTIVATE_VERIFICATION_KEY, 'wechat');
    await open();
  };

  if (success) {
    return (
      <div className={`${styles.wechatWarning} ${styles.wechatWarningSuccess}`}>
        <CheckCircle size={32} strokeWidth={2} />
        <p>{t('微信授权完成，确认注销时自动验证')}</p>
      </div>
    );
  }

  return (
    <div className={styles.wechatWarning}>
      <MessageCircle size={28} strokeWidth={1.5} />
      <p>{t('您是通过微信登录的账户，请使用微信扫码确认注销')}</p>
      <Button
        variant="primary"
        icon={MessageCircle}
        loading={loading}
        onClick={handleClick}
      >
        {loading ? t('等待授权...') : t('微信扫码确认')}
      </Button>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
