import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';

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
  createdAt: string;
}

interface OrderHistoryProps {
  orders: Order[];
  loading?: boolean;
  onRefresh: () => void;
  onContinuePayment: (order: Order) => void;
}

const PAGE_SIZE = 10;

const STATUS_MAP: Record<string, { label: string; color: string; icon?: React.ReactNode }> = {
  PENDING: { label: '待支付', color: 'var(--warning-500)' },
  SUCCEEDED: { label: '已完成', color: 'var(--success-500)', icon: <CheckCircle size={16} style={{ color: 'var(--success-500)' }} /> },
  FAILED: { label: '支付失败', color: 'var(--error-500)', icon: <XCircle size={16} style={{ color: 'var(--error-500)' }} /> },
  REFUNDED: { label: '已退款', color: 'var(--text-tertiary)' },
  CLOSED: { label: '已取消', color: 'var(--text-tertiary)' },
  TIMEOUT: { label: '超时未支付', color: 'var(--text-tertiary)', icon: <AlertCircle size={16} style={{ color: 'var(--text-tertiary)' }} /> },
};

const RETRYABLE_STATUSES = ['FAILED', 'CLOSED', 'TIMEOUT'];

export default function OrderHistory({
  orders,
  loading,
  onContinuePayment,
}: OrderHistoryProps) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const total = orders.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pagedOrders = orders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!loading && orders.length === 0) {
    return (
      <Card variant="outlined" padding="lg" radius="xl">
        <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
          <Clock size={40} className="mx-auto mb-3" />
          <p>暂无购买记录</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/profile?tab=membership')}>
            去开通会员
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {pagedOrders.map((order) => {
        const statusInfo = STATUS_MAP[order.status] || {
          label: order.status,
          color: 'var(--text-tertiary)',
        };
        const isPending = order.status === 'PENDING';
        const canRetry = RETRYABLE_STATUSES.includes(order.status);

        return (
          <Card key={order.id} variant="outlined" padding="md" radius="xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {order.description || `订单 ${order.orderNo}`}
                </p>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  ¥{(order.amount / 100).toFixed(2)} ·{' '}
                  {new Date(order.createdAt).toLocaleDateString('zh-CN')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5" style={{ color: statusInfo.color }}>
                  {statusInfo.icon}
                  {statusInfo.label}
                </span>
                {isPending && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onContinuePayment(order)}
                  >
                    继续支付
                  </Button>
                )}
                {canRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onContinuePayment(order)}
                  >
                    重新购买
                  </Button>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      {totalPages > 1 && (
        <Pagination
          meta={{ total, page, limit: PAGE_SIZE, totalPages }}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
