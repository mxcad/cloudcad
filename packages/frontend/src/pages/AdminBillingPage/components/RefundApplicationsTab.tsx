import { RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { t } from '@/languages';
import {
  formatYuan,
  PAGE_SIZE,
  REFUND_APPLICATION_STATUS_META,
  REFUND_APPLICATION_STATUS_OPTIONS,
} from '../constants';
import type { RefundApplicationItem } from '../types';

interface RefundApplicationsTabProps {
  applications: RefundApplicationItem[];
  loading: boolean;
  page: number;
  total: number;
  status: string;
  /** 是否有 SYSTEM_BILLING_WRITE 权限（无则禁用审核按钮） */
  canWrite: boolean;
  onPageChange: (page: number) => void;
  onStatusChange: (value: string) => void;
  onRefresh: () => void;
  onApprove: (application: RefundApplicationItem) => void;
  onReject: (application: RefundApplicationItem) => void;
}

export function RefundApplicationsTab({
  applications,
  loading,
  page,
  total,
  status,
  canWrite,
  onPageChange,
  onStatusChange,
  onRefresh,
  onApprove,
  onReject,
}: RefundApplicationsTabProps) {
  const getMeta = (s: string) =>
    REFUND_APPLICATION_STATUS_META[s] ?? {
      label: s,
      color: 'neutral' as const,
    };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
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
          {REFUND_APPLICATION_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          icon={RefreshCw}
          onClick={onRefresh}
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
                    {t('用户')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium">
                    {t('订单号')}
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    {t('金额')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium">
                    {t('申请原因')}
                  </th>
                  <th className="text-center px-4 py-3 font-medium">
                    {t('状态')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium">
                    {t('申请时间')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium">
                    {t('审核信息')}
                  </th>
                  <th className="text-center px-4 py-3 font-medium">
                    {t('操作')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => {
                  const meta = getMeta(application.status);
                  return (
                    <tr
                      key={application.id}
                      style={{
                        borderBottom: '1px solid var(--border-default)',
                      }}
                    >
                      <td className="px-4 py-3">
                        {application.user?.email ||
                          application.user?.username ||
                          application.userId}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {application.order?.orderNo}
                        {application.order?.description && (
                          <div
                            className="font-sans text-xs mt-0.5"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            {application.order.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatYuan(application.amount)}
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <div className="truncate" title={application.reason}>
                          {application.reason}
                        </div>
                        {application.reviewNote && (
                          <div
                            className="truncate text-xs mt-0.5"
                            style={{ color: 'var(--text-tertiary)' }}
                            title={`${t('审核意见')}: ${application.reviewNote}`}
                          >
                            {t('审核意见')}: {application.reviewNote}
                          </div>
                        )}
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
                      <td className="px-4 py-3 text-xs">
                        {new Date(application.createdAt).toLocaleString(
                          'zh-CN'
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {application.reviewedAt ? (
                          <>
                            {new Date(application.reviewedAt).toLocaleString(
                              'zh-CN'
                            )}
                            {application.reviewer && (
                              <div
                                className="mt-0.5"
                                style={{ color: 'var(--text-tertiary)' }}
                              >
                                {t('审核人')}:{' '}
                                {application.reviewer.email ||
                                  application.reviewer.username ||
                                  application.reviewer.id}
                              </div>
                            )}
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {application.status === 'PENDING' && (
                            <>
                              <Button
                                variant="ghost"
                                size="xs"
                                icon={ShieldCheck}
                                onClick={() => onApprove(application)}
                                disabled={!canWrite}
                              >
                                {t('通过')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                icon={XCircle}
                                onClick={() => onReject(application)}
                                disabled={!canWrite}
                              >
                                {t('驳回')}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {applications.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="text-center py-8"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {t('暂无退款申请')}
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
