import { Search, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { Input } from '@/components/ui/Input';
import { t } from '@/languages';
import {
  formatYuan,
  ORDER_STATUS_META,
  PAGE_SIZE,
  STATUS_OPTIONS,
} from '../constants';
import type { AdminOrder } from '../types';

interface OrdersTabProps {
  orders: AdminOrder[];
  loading: boolean;
  page: number;
  total: number;
  keyword: string;
  status: string;
  /** 是否有 SYSTEM_BILLING_WRITE 权限（无则禁用退款/模拟回调按钮） */
  canWrite: boolean;
  onPageChange: (page: number) => void;
  onKeywordChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSearch: () => void;
  onRefund: (order: AdminOrder) => void;
  onMockCallback: (order: AdminOrder) => void;
}

export function OrdersTab({
  orders,
  loading,
  page,
  total,
  keyword,
  status,
  canWrite,
  onPageChange,
  onKeywordChange,
  onStatusChange,
  onSearch,
  onRefund,
  onMockCallback,
}: OrdersTabProps) {
  const getOrderStatusMeta = (orderStatus: string) =>
    ORDER_STATUS_META[orderStatus] ?? {
      label: orderStatus,
      color: 'neutral' as const,
    };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-tertiary)' }}
          />
          <Input
            placeholder={t('搜索订单号...')}
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            className="pl-8"
            size="md"
          />
        </div>
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="h-[28px] px-3 rounded-lg text-sm"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={onSearch}>
          {t('搜索')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={RefreshCw}
          onClick={onSearch}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div
            className="w-8 h-8 rounded-full animate-spin"
            style={{
              border: '3px solid var(--border-default)',
              borderTopColor: 'var(--primary-500)',
            }}
          />
        </div>
      ) : (
        <>
          <Card variant="outlined" padding="none" radius="xl">
            <table
              className="w-full text-sm"
              style={{ color: 'var(--text-primary)' }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <th className="text-left px-4 py-3 font-medium">
                    {t('订单号')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium">
                    {t('用户')}
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    {t('金额')}
                  </th>
                  <th className="text-center px-4 py-3 font-medium">
                    {t('状态')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium">
                    {t('支付方式')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium">
                    {t('时间')}
                  </th>
                  <th className="text-center px-4 py-3 font-medium">
                    {t('操作')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const meta = getOrderStatusMeta(order.status);
                  return (
                    <tr
                      key={order.id}
                      style={{
                        borderBottom: '1px solid var(--border-default)',
                      }}
                    >
                      <td className="px-4 py-3 font-mono text-xs">
                        {order.orderNo}
                      </td>
                      <td className="px-4 py-3">
                        {order.user?.email ||
                          order.user?.username ||
                          order.userId}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatYuan(order.amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Tag
                          variant={
                            meta.color as
                              'success' | 'warning' | 'error' | 'neutral'
                          }
                          size="xs"
                        >
                          {meta.label}
                        </Tag>
                      </td>
                      <td className="px-4 py-3">{order.gateway}</td>
                      <td className="px-4 py-3 text-xs">
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleString('zh-CN')
                          : ''}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {order.status === 'SUCCEEDED' && (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => onRefund(order)}
                              disabled={!canWrite}
                            >
                              {t('退款')}
                            </Button>
                          )}
                          {order.status === 'PENDING' && (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => onMockCallback(order)}
                              disabled={!canWrite}
                            >
                              {t('模拟回调')}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {orders.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center py-8"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {t('暂无订单')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
          {total > PAGE_SIZE && (
            <div className="mt-4 flex justify-center gap-2">
              <button
                className="px-3 py-1 rounded-lg text-sm"
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                }}
                onClick={() => onPageChange(Math.max(1, page - 1))}
              >
                {t('上一页')}
              </button>
              <span
                className="px-3 py-1 text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                {page} / {totalPages}
              </span>
              <button
                className="px-3 py-1 rounded-lg text-sm"
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                }}
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              >
                {t('下一页')}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
