import { useCallback, useRef } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, Search } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { t } from '@/languages';

export interface Order {
  id: string;
  orderNo: string;
  planId: string;
  amount: number;
  status: string;
  gateway: string;
  tradeType: string | null;
  description: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  refundReason: string | null;
  createdAt: string;
}

interface OrderHistoryProps {
  orders: Order[];
  loading?: boolean;
  onRefresh: () => void;
  onContinuePayment: (order: Order) => void;
  page?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  searchKeyword?: string;
  searchStatus?: string;
  onSearchChange?: (keyword: string, status: string) => void;
}

function getStatusMap(): Record<string, { label: string; color: string; icon?: React.ReactNode }> {
  return {
    PENDING: { label: t('待支付'), color: 'var(--warning-500)' },
    SUCCEEDED: { label: t('已完成'), color: 'var(--success-500)', icon: <CheckCircle size={16} style={{ color: 'var(--success-500)' }} /> },
    FAILED: { label: t('支付失败'), color: 'var(--error-500)', icon: <XCircle size={16} style={{ color: 'var(--error-500)' }} /> },
    REFUNDED: { label: t('已退款'), color: 'var(--text-tertiary)' },
    CLOSED: { label: t('已取消'), color: 'var(--text-tertiary)' },
    TIMEOUT: { label: t('超时未支付'), color: 'var(--text-tertiary)', icon: <AlertCircle size={16} style={{ color: 'var(--text-tertiary)' }} /> },
  };
}

const RETRYABLE_STATUSES = ['FAILED', 'CLOSED', 'TIMEOUT'];

export default function OrderHistory({
  orders,
  loading,
  onRefresh,
  onContinuePayment,
  page = 1,
  total = 0,
  onPageChange,
  searchKeyword = '',
  searchStatus = '',
  onSearchChange,
}: OrderHistoryProps) {
  const totalPages = Math.max(1, Math.ceil(total / 10));

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKeywordChange = useCallback((val: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearchChange?.(val, searchStatus);
    }, 400);
  }, [onSearchChange, searchStatus]);

  const handleStatusChange = (val: string) => {
    onSearchChange?.(searchKeyword, val);
  };

  if (!loading && orders.length === 0 && !searchKeyword && !searchStatus) {
    return (
      <Card variant="outlined" padding="lg" radius="xl">
        <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
          <Clock size={40} className="mx-auto mb-3" />
          <p>{t("暂无购买记录")}</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
          <Input
            placeholder={t("搜索订单号")}
            value={searchKeyword}
            onChange={(e) => handleKeywordChange(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          value={searchStatus}
          onChange={handleStatusChange}
          placeholder={t("全部状态")}
          clearable
          options={[
            { value: 'PENDING', label: t('待支付') },
            { value: 'SUCCEEDED', label: t('已完成') },
            { value: 'FAILED', label: t('支付失败') },
            { value: 'REFUNDED', label: t('已退款') },
            { value: 'CLOSED', label: t('已取消') },
            { value: 'TIMEOUT', label: t('超时未支付') },
          ]}
          className="w-36"
        />
        <Button variant="outline" size="sm" icon={RefreshCw} onClick={onRefresh} />
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
          <Search size={40} className="mx-auto mb-3" />
          <p>{t("未找到匹配的订单")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const statusInfo = getStatusMap()[order.status] || {
              label: order.status,
              color: 'var(--text-tertiary)',
            };
            const isPending = order.status === 'PENDING';
            const canRetry = RETRYABLE_STATUSES.includes(order.status);
            const isRefunded = order.status === 'REFUNDED';

            return (
              <Card key={order.id} variant="outlined" padding="md" radius="xl">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {order.description || t('订单')}
                    </p>
                    <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      {order.orderNo}
                    </p>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      ¥{(order.amount / 100).toFixed(2)} ·{' '}
                      {new Date(order.createdAt).toLocaleDateString('zh-CN')}
                    </p>
                    {isRefunded && order.refundedAt && (
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        {t(`退款时间：${formatDateTime(order.refundedAt)}`)}
                      </p>
                    )}
                    {isRefunded && order.refundReason && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        {t(`退款原因：${order.refundReason}`)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className="flex items-center gap-1.5 whitespace-nowrap" style={{ color: statusInfo.color }}>
                      {statusInfo.icon}
                      {statusInfo.label}
                    </span>
                    {isPending && (
                      <Button variant="primary" size="sm" onClick={() => onContinuePayment(order)}>
                        {t("继续支付")}
                      </Button>
                    )}
                    {canRetry && (
                      <Button variant="outline" size="sm" onClick={() => onContinuePayment(order)}>
                        {t("重新购买")}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && onPageChange && (
        <Pagination
          meta={{ total, page, limit: 10, totalPages }}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
