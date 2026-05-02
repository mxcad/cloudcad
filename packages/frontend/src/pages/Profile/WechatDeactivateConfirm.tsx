import { useCallback, useState } from 'react';
import { useWechatAuth } from '../../hooks/useWechatAuth';
import { authApi } from '../../services/authApi';
import { MessageCircle } from 'lucide-react';
import { CheckCircle } from 'lucide-react';

interface WechatDeactivateConfirmProps {
  onConfirm: () => void;
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
        await authApi.bindWechat(result.code!, result.state!);
        setSuccess(true);
        // 清除保存的验证方式
        sessionStorage.removeItem(DEACTIVATE_VERIFICATION_KEY);
        onConfirm();
      } catch {
        setError('微信验证失败');
      } finally {
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
      <div className="wechat-warning success">
        <CheckCircle size={32} strokeWidth={2} />
        <p>微信验证成功</p>
      </div>
    );
  }

  return (
    <div className="wechat-warning">
      <MessageCircle size={28} strokeWidth={1.5} />
      <p>您是通过微信登录的账户，请使用微信扫码确认注销</p>
      <button
        type="button"
        className="submit-button"
        disabled={loading}
        onClick={handleClick}
      >
        <MessageCircle size={16} />
        <span>{loading ? '等待授权...' : '微信扫码确认'}</span>
      </button>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
