import { Modal } from '@/components/ui/Modal';
import { t } from '@/languages';
import { centsToYuan } from '@/utils/priceUtils';
import WechatPayButton from './WechatPayButton';

interface WechatPayModalProps {
  open: boolean;
  orderNo: string;
  amount: number;
  payParams: Record<string, unknown> | null;
  codeUrl: string | null;
  redirectUrl: string | null;
  /** 订单描述（如「VIP1 · 1个月」），展示在金额上方 */
  orderLabel?: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
  onClose: () => void;
}

export default function WechatPayModal({
  open,
  orderNo,
  amount,
  payParams,
  codeUrl,
  redirectUrl,
  orderLabel,
  onSuccess,
  onError,
  onClose,
}: WechatPayModalProps) {
  return (
    <Modal isOpen={open} onClose={onClose} title={t('微信支付')} size="sm">
      {orderLabel && (
        <p
          className="text-sm mb-2"
          style={{ color: 'var(--text-primary)', fontWeight: 600 }}
        >
          {orderLabel}
        </p>
      )}
      <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
        {t('支付金额: ¥{amount}', { amount: centsToYuan(amount) })}
      </p>
      <WechatPayButton
        payParams={payParams}
        codeUrl={codeUrl}
        redirectUrl={redirectUrl}
        orderNo={orderNo}
        amount={amount}
        onSuccess={onSuccess}
        onError={onError}
        onClose={onClose}
      />
    </Modal>
  );
}
