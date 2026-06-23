import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { QRCodeSVG } from 'qrcode.react';
import { billingControllerQueryOrder } from '@/api-sdk';

declare const WeixinJSBridge: {
  invoke: (
    method: string,
    params: any,
    callback: (res: { err_msg: string }) => void,
  ) => void;
};

interface WechatPayButtonProps {
  payParams: Record<string, any> | null;
  codeUrl: string | null;
  redirectUrl: string | null;
  orderNo: string;
  amount: number;
  onSuccess: () => void;
  onError: (msg: string) => void;
  onClose: () => void;
}

type PayState = 'idle' | 'paying' | 'success' | 'error';

export default function WechatPayButton({
  payParams,
  codeUrl,
  redirectUrl,
  orderNo,
  amount,
  onSuccess,
  onError,
  onClose,
}: WechatPayButtonProps) {
  const [payState, setPayState] = useState<PayState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const redirectAttempted = useRef(false);

  const isWeChat = useMemo(() => /MicroMessenger/i.test(navigator.userAgent), []);
  const isMobile = useMemo(() => /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent), []);

  const invokeWechatPay = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      if (typeof WeixinJSBridge === 'undefined') {
        // WeixinJSBridge 可能尚未加载完成，等待 ready 事件
        const onReady = () => {
          document.removeEventListener('WeixinJSBridgeReady', onReady);
          (WeixinJSBridge as any).invoke(
            'getBrandWCPayRequest',
            payParams,
            (res: { err_msg: string }) => {
              if (res.err_msg === 'get_brand_wcpay_request:ok') resolve();
              else if (res.err_msg === 'get_brand_wcpay_request:cancel') reject(new Error('支付已取消'));
              else reject(new Error(res.err_msg || '支付失败'));
            },
          );
        };
        document.addEventListener('WeixinJSBridgeReady', onReady);
        // 5 秒超时 — 若 WeixinJSBridge 仍未就绪则降级提示
        setTimeout(() => {
          document.removeEventListener('WeixinJSBridgeReady', onReady);
          reject(new Error('微信支付组件加载超时，请刷新页面重试'));
        }, 5000);
        return;
      }
      WeixinJSBridge.invoke(
        'getBrandWCPayRequest',
        payParams,
        (res) => {
          if (res.err_msg === 'get_brand_wcpay_request:ok') resolve();
          else if (res.err_msg === 'get_brand_wcpay_request:cancel') reject(new Error('支付已取消'));
          else reject(new Error(res.err_msg || '支付失败'));
        },
      );
    });
  }, [payParams]);

  const handlePay = useCallback(async () => {
    setPayState('paying');
    setErrorMsg('');

    try {
      await invokeWechatPay();
      setPayState('success');
      onSuccess();
    } catch (err: any) {
      const msg = err?.message || '支付失败';
      setErrorMsg(msg);
      setPayState('error');
      onError(msg);
    }
  }, [invokeWechatPay, onSuccess, onError]);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingCountRef = useRef(0);
  const MAX_POLLING_ATTEMPTS = 120; // 最多轮询 120 次（5s * 120 = 10min）

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingCountRef.current = 0;
    pollingRef.current = setInterval(async () => {
      pollingCountRef.current += 1;
      if (pollingCountRef.current > MAX_POLLING_ATTEMPTS) {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
        return;
      }
      try {
        const res = await billingControllerQueryOrder({ path: { orderNo } });
        const order = res?.data as Record<string, any> | undefined;
        if (order?.status === 'SUCCEEDED') {
          if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
          setPayState('success');
          onSuccess();
        }
      } catch {
        // polling error, retry on next interval
      }
    }, 5000);
  }, [orderNo, onSuccess]);

  useEffect(() => {
    if (codeUrl && !redirectUrl) {
      startPolling();
    }
    if (payState === 'success' || payState === 'error') {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    }
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [codeUrl, redirectUrl, payState, startPolling]);

  useEffect(() => {
    if (redirectUrl && isMobile && !isWeChat && !redirectAttempted.current) {
      redirectAttempted.current = true;
      startPolling();
      // 延迟跳转确保轮询先注册并发出第一次请求；用户跳转后由 paymentReturn 参数兜底
      setTimeout(() => { window.location.href = redirectUrl; }, 500);
    }
  }, [redirectUrl, isMobile, isWeChat, startPolling]);

  if (isWeChat && payParams) {
    return (
      <div className="text-center">
        <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
          订单金额:{' '}
          <strong className="text-xl" style={{ color: 'var(--accent-600)' }}>
            ¥{(amount / 100).toFixed(2)}
          </strong>
        </p>

        <p className="mb-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          支付方式: 微信支付
        </p>

        {payState === 'error' && (
          <p className="mb-3 text-sm" style={{ color: 'var(--error-500)' }}>
            {errorMsg}
          </p>
        )}

        <div className="flex gap-3">
          <Button variant="outline" size="lg" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={handlePay}
            loading={payState === 'paying'}
          >
            {payState === 'paying' ? '支付中...' : '确认支付'}
          </Button>
        </div>
      </div>
    );
  }

  if (codeUrl) {
    return (
      <div className="text-center">
        <p className="mb-3" style={{ color: 'var(--text-secondary)' }}>
          请使用微信扫码支付
        </p>
        <div
          className="inline-block p-2 rounded-lg mb-3"
          style={{ background: '#fff', border: '1px solid var(--border-default)' }}
        >
          <QRCodeSVG value={codeUrl} size={200} level="M" />
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>
          订单金额:{' '}
          <strong style={{ color: 'var(--accent-600)' }}>
            ¥{(amount / 100).toFixed(2)}
          </strong>
        </p>
        <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
          支付成功后返回页面查看会员状态
        </p>
        <Button variant="primary" size="lg" className="w-full" onClick={onClose}>
          已完成支付
        </Button>
      </div>
    );
  }

  if (payParams && !isWeChat) {
    return (
      <div className="text-center">
        <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
          请在微信浏览器中打开完成支付
        </p>
        <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>
          订单金额:{' '}
          <strong style={{ color: 'var(--accent-600)' }}>
            ¥{(amount / 100).toFixed(2)}
          </strong>
        </p>
        <Button variant="primary" size="lg" className="w-full" onClick={onClose}>
          关闭
        </Button>
      </div>
    );
  }

  if (redirectUrl && isMobile && !isWeChat) {
    return (
      <div className="text-center">
        <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
          订单金额:{' '}
          <strong style={{ color: 'var(--accent-600)' }}>
            ¥{(amount / 100).toFixed(2)}
          </strong>
        </p>
        <Button
          variant="primary"
          size="lg"
          className="w-full mb-3"
          onClick={() => { window.location.href = redirectUrl; }}
        >
          前往微信支付
        </Button>
        <Button variant="outline" size="lg" className="w-full" onClick={onClose}>
          取消
        </Button>
      </div>
    );
  }

  return null;
}
