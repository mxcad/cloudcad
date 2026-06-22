import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/Button';

declare const WeixinJSBridge: {
  invoke: (
    method: string,
    params: any,
    callback: (res: { err_msg: string }) => void,
  ) => void;
};

interface WechatPayButtonProps {
  gateway: string;
  payParams: Record<string, any> | null;
  codeUrl: string | null;
  orderNo: string;
  amount: number;
  onSuccess: () => void;
  onError: (msg: string) => void;
  onClose: () => void;
}

type PayState = 'idle' | 'paying' | 'success' | 'error';

export default function WechatPayButton({
  gateway,
  payParams,
  codeUrl,
  amount,
  onSuccess,
  onError,
  onClose,
}: WechatPayButtonProps) {
  const [payState, setPayState] = useState<PayState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handlePay = useCallback(async () => {
    setPayState('paying');
    setErrorMsg('');

    if (gateway === 'mock') {
      await new Promise((r) => setTimeout(r, 800));
      setPayState('success');
      onSuccess();
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        if (typeof WeixinJSBridge === 'undefined') {
          reject(new Error('请在微信浏览器中打开'));
          return;
        }
        WeixinJSBridge.invoke(
          'getBrandWCPayRequest',
          payParams,
          (res) => {
            if (res.err_msg === 'get_brand_wcpay_request:ok') {
              resolve();
            } else if (res.err_msg === 'get_brand_wcpay_request:cancel') {
              reject(new Error('支付已取消'));
            } else {
              reject(new Error(res.err_msg || '支付失败'));
            }
          },
        );
      });

      setPayState('success');
      onSuccess();
    } catch (err: any) {
      const msg = err?.message || '支付失败';
      setErrorMsg(msg);
      setPayState('error');
      onError(msg);
    }
  }, [gateway, payParams, onSuccess, onError]);

  if (gateway === 'wechat_pay' && codeUrl && !payParams) {
    return (
      <div className="text-center">
        <p className="mb-3" style={{ color: 'var(--text-secondary)' }}>
          请使用微信扫码支付
        </p>
        <div
          className="inline-block p-2 rounded-lg mb-3"
          style={{ background: '#fff', border: '1px solid var(--border-default)' }}
        >
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(codeUrl)}`}
            alt="微信支付二维码"
            width={200}
            height={200}
          />
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

  if (gateway === 'wechat_pay' && !codeUrl && !payParams) {
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

  return (
    <div className="text-center">
      <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
        订单金额:{' '}
        <strong className="text-xl" style={{ color: 'var(--accent-600)' }}>
          ¥{(amount / 100).toFixed(2)}
        </strong>
      </p>

      <p className="mb-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>
        支付方式: {gateway === 'mock' ? '模拟支付' : '微信支付 (JSAPI)'}
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
