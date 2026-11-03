import React, { useCallback, useMemo, useState } from 'react';
import { RefreshCw, Search, Gift, XCircle, CheckCircle2 } from 'lucide-react';
import { t } from '@/languages';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { Tabs } from '@/components/ui/Tabs';
import { Tab } from '@/components/ui/Tab';
import { Tag } from '@/components/ui/Tag';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePermission } from '@/hooks/usePermission';
import { useNotification } from '@/contexts/NotificationContext';
import { getErrorMessage } from '@/utils/errorHandler';
import { globalShowPrompt } from '@/utils/notificationEvents';
import { SystemPermission } from '@/constants/permissions';
import type {
  FeedbackAttachmentDto,
  FeedbackResponseDto,
  FeedbackRewardResponseDto,
} from '@/api-sdk';
import {
  FEEDBACK_TYPE_OPTIONS,
  FEEDBACK_STATUS_OPTIONS,
  REWARD_STATUS_OPTIONS,
  FEEDBACK_TYPE_MAP,
  FEEDBACK_STATUS_MAP,
  REWARD_STATUS_MAP,
} from '@/constants/feedback';
import {
  useFeedbackList,
  useUpdateFeedbackStatus,
  useRevokeReward,
} from './useFeedbackAdmin';
import { AdoptDialog } from './AdoptDialog';
import { IssueDialog } from './IssueDialog';
import { FeedbackAttachmentAdminPanel } from './FeedbackAttachmentAdminPanel';
import { FeedbackAttachmentList } from '@/components/feedback/FeedbackAttachmentList';
import { RichContentView } from '@/components/richtext';

const PAGE_SIZE = 30;

const STATUS_TAG: Record<string, TagVariantLike> = {
  PENDING: 'warning',
  REVIEWING: 'info',
  ADOPTED: 'success',
  REJECTED: 'error',
  CLOSED: 'neutral',
};
const REWARD_TAG: Record<string, TagVariantLike> = {
  NONE: 'neutral',
  PENDING: 'warning',
  ISSUED: 'success',
  REVOKED: 'neutral',
};
type TagVariantLike = 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral';

const STATUS_FILTERS = FEEDBACK_STATUS_OPTIONS;
const TYPE_OPTIONS = [
  { value: '', label: t('全部类型') },
  ...FEEDBACK_TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
];
const REWARD_FILTERS = REWARD_STATUS_OPTIONS.filter((o) => o.value !== 'NONE');

/**
 * 用户反馈管理（后台）：反馈列表（筛选/分页/采纳/驳回/状态流转）
 * + 奖励发放台（客服认领绑定账号、发放/撤销会员奖励）。
 */
export default function AdminFeedbackPage() {
  useDocumentTitle(t('反馈管理'));
  const { showConfirm, showToast } = useNotification();
  const { hasPermission } = usePermission();
  const canManage = hasPermission(SystemPermission.SYSTEM_FEEDBACK_MANAGE);
  const canReward = hasPermission(SystemPermission.SYSTEM_FEEDBACK_REWARD);

  const [tab, setTab] = useState<'list' | 'attachments'>('list');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [rewardStatusFilter, setRewardStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailTarget, setDetailTarget] = useState<FeedbackResponseDto | null>(null);

  const [adoptTarget, setAdoptTarget] = useState<FeedbackResponseDto | null>(null);
  const [issueTarget, setIssueTarget] = useState<{
    reward: FeedbackRewardResponseDto;
    contact?: string | null;
  } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<FeedbackResponseDto | null>(null);

  const listQuery = useFeedbackList({
    page,
    pageSize,
    type: typeFilter || undefined,
    status: statusFilter || undefined,
    rewardStatus: rewardStatusFilter || undefined,
    search: searchQuery || undefined,
  });

  const updateStatus = useUpdateFeedbackStatus();
  const revokeReward = useRevokeReward();

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;

  const handleSearchSubmit = useCallback(() => {
    setPage(1);
    setSearchQuery(search.trim());
  }, [search]);

  const handleFilterChange = useCallback((next: string) => {
    setStatusFilter(next);
    setPage(1);
  }, []);
  const handleRewardStatusChange = useCallback((next: string) => {
    setRewardStatusFilter(next);
    setPage(1);
  }, []);
  const handleTypeChange = useCallback((next: string) => {
    setTypeFilter(next);
    setPage(1);
  }, []);
  // 每页条数变化：重置到第一页（新条数下深层页码无意义）
  const handlePageSizeChange = useCallback(
    (next: number) => {
      if (next === pageSize) return;
      setPageSize(next);
      setPage(1);
    },
    [pageSize]
  );

  const handleStatusAction = useCallback(
    async (feedback: FeedbackResponseDto, next: 'REVIEWING' | 'CLOSED') => {
      try {
        await updateStatus.mutateAsync({
          id: feedback.id,
          body: { status: next },
        });
        showToast(next === 'REVIEWING' ? t('已标记处理中') : t('已关闭'), 'success');
      } catch (err) {
        showToast(getErrorMessage(err), 'error');
      }
    },
    [updateStatus, showToast]
  );

  const handleRevoke = useCallback(
    async (reward: FeedbackRewardResponseDto) => {
      const reason = await globalShowPrompt({
        title: t('撤销奖励'),
        label: t('撤销原因（必填，审计留痕）'),
        multiline: true,
        required: true,
        confirmText: t('撤销'),
      });
      if (!reason) return;
      try {
        await revokeReward.mutateAsync({
          id: reward.id,
          body: { reason },
        });
        showToast(t('奖励已撤销'), 'success');
      } catch (err) {
        showToast(getErrorMessage(err), 'error');
      }
    },
    [revokeReward, showToast]
  );

  const feedbackRows = items;
  const pageCount = Math.ceil(total / pageSize);

  return (
    <div className="h-full flex flex-col overflow-hidden p-6">
      <div className="max-w-7xl mx-auto w-full flex flex-col flex-1 min-h-0">
        <div className="flex-shrink-0 flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {t('反馈管理')}
          </h1>
          <div className="flex items-center gap-2">
            {/* 刷新只作用于反馈列表；附件资源 tab 无列表可刷，隐藏避免 no-op 误导 */}
            {tab === 'list' && (
              <Button
                variant="outline"
                size="sm"
                icon={RefreshCw}
                onClick={() => void listQuery.refetch()}
              >
                {t('刷新')}
              </Button>
            )}
          </div>
        </div>

        <Tabs className="flex-shrink-0 mb-4 w-fit">
          <Tab value="list" active={tab === 'list'} onClick={() => setTab('list')}>
            {t('反馈列表')}
          </Tab>
          <Tab value="attachments" active={tab === 'attachments'} onClick={() => setTab('attachments')}>
            {t('附件资源')}
          </Tab>
        </Tabs>

        {tab === 'attachments' ? (
          <FeedbackAttachmentAdminPanel />
        ) : (
          <>
            {/* 筛选栏：反馈状态 + 奖励状态（原「奖励发放」tab 已并入本列表） */}
            <div className="flex-shrink-0 mb-4 flex flex-wrap items-center gap-2">
              <TabButtonRow
                active={statusFilter}
                onChange={handleFilterChange}
                options={[{ value: '', labelKey: '全部状态' }, ...STATUS_FILTERS]}
              />
              <TabButtonRow
                active={rewardStatusFilter}
                onChange={handleRewardStatusChange}
                options={[{ value: '', labelKey: '全部奖励' }, ...REWARD_FILTERS]}
              />
              <Select
                value={typeFilter}
                onChange={handleTypeChange}
                options={TYPE_OPTIONS}
                className="w-32"
              />
              <div className="flex gap-2 ml-auto">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('搜索标题/内容/查询码/账号')}
                  className="w-56"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearchSubmit();
                  }}
                />
                <Button variant="secondary" onClick={handleSearchSubmit} icon={Search}>
                  {t('搜索')}
                </Button>
              </div>
            </div>

            <Card
              variant="outlined"
              padding="none"
              radius="xl"
              className="flex-1 min-h-0 flex flex-col"
            >
              {listQuery.isLoading ? (
                <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-secondary)]">
                  {t('加载中...')}
                </div>
              ) : feedbackRows.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-secondary)]">
                  {t('暂无反馈')}
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[var(--bg-secondary)]">
                      <tr className="text-left text-xs text-[var(--text-tertiary)]">
                        <th className="px-4 py-2 font-medium">{t('查询码')}</th>
                        <th className="px-4 py-2 font-medium">{t('类型')}</th>
                        <th className="px-4 py-2 font-medium">{t('标题')}</th>
                        <th className="px-4 py-2 font-medium">{t('状态')}</th>
                        <th className="px-4 py-2 font-medium">{t('奖励')}</th>
                        <th className="px-4 py-2 font-medium">{t('发放账号')}</th>
                        <th className="px-4 py-2 font-medium">{t('提交者')}</th>
                        <th className="px-4 py-2 font-medium">{t('时间')}</th>
                        <th className="px-4 py-2 font-medium text-right">{t('操作')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {feedbackRows.map((f) => (
                        <tr key={f.id} className="hover:bg-[var(--bg-tertiary)]">
                          <td className="px-4 py-2 font-mono text-xs">{f.feedbackCode}</td>
                          <td className="px-4 py-2">
                            {t(FEEDBACK_TYPE_MAP[f.type] ?? f.type)}
                          </td>
                          <td className="px-4 py-2 max-w-[220px]">
                            <div className="truncate">{f.title}</div>
                            {f.contact && (
                              <div className="text-xs text-[var(--text-tertiary)] truncate">
                                {f.contact}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <Tag variant={STATUS_TAG[f.status] ?? 'neutral'}>
                              {t(FEEDBACK_STATUS_MAP[f.status] ?? f.status)}
                            </Tag>
                          </td>
                          <td className="px-4 py-2 text-xs whitespace-nowrap">
                            {f.reward ? (
                              <span className="flex items-center gap-1.5">
                                <Tag variant={REWARD_TAG[f.rewardStatus] ?? 'neutral'}>
                                  {t(REWARD_STATUS_MAP[f.rewardStatus] ?? f.rewardStatus)}
                                </Tag>
                                {t('VIP{level} {days} 天', {
                                  level: f.reward.vipTierLevel,
                                  days: f.reward.durationDays,
                                })}
                              </span>
                            ) : (
                              <span className="text-[var(--text-tertiary)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs">
                            {f.reward ? (
                              f.reward.user ? (
                                f.reward.user.nickname || f.reward.user.username
                              ) : (
                                t('未绑定')
                              )
                            ) : (
                              <span className="text-[var(--text-tertiary)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs">
                            {f.submitterName || t('匿名')}
                          </td>
                          <td className="px-4 py-2 text-xs whitespace-nowrap">
                            {new Date(f.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-2">
                            <RowActions
                              feedback={f}
                              canManage={canManage}
                              canReward={canReward}
                              onAdopt={() => setAdoptTarget(f)}
                              onReject={() => setRejectTarget(f)}
                              onReviewing={() => handleStatusAction(f, 'REVIEWING')}
                              onClose={() => handleStatusAction(f, 'CLOSED')}
                              onShowDetail={() => setDetailTarget(f)}
                              onIssue={() =>
                                f.reward &&
                                setIssueTarget({ reward: f.reward, contact: f.contact })
                              }
                              onRevoke={() => f.reward && handleRevoke(f.reward)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {total > pageSize && (
                <div className="flex-shrink-0 flex justify-center py-3 border-t border-[var(--border-subtle)]">
                  <Pagination
                    meta={{ total, page, limit: pageSize, totalPages: pageCount }}
                    onPageChange={setPage}
                    showSizeChanger
                    onPageSizeChange={handlePageSizeChange}
                    pageSizeOptions={[30, 50, 100]}
                  />
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      <AdoptDialog
        isOpen={!!adoptTarget}
        feedback={adoptTarget}
        onClose={() => setAdoptTarget(null)}
        onAdopted={() => void listQuery.refetch()}
      />
      <IssueDialog
        isOpen={!!issueTarget}
        reward={issueTarget?.reward ?? null}
        contact={issueTarget?.contact}
        onClose={() => setIssueTarget(null)}
        onIssued={() => void listQuery.refetch()}
      />
      <RejectDialog
        isOpen={!!rejectTarget}
        feedback={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onRejected={() => void listQuery.refetch()}
      />
      <FeedbackDetailDialog
        feedback={detailTarget}
        onClose={() => setDetailTarget(null)}
        onStaleView={
          detailTarget
            ? async (attachmentId: string) => {
                const { data } = await listQuery.refetch();
                return (
                  data?.items
                    .find((f) => f.id === detailTarget.id)
                    ?.attachments.find((a) => a.id === attachmentId) ?? null
                );
              }
            : undefined
        }
      />
    </div>
  );
}

/** 反馈详情弹窗：内容 + 元信息 + 附件列表 */
function FeedbackDetailDialog({
  feedback,
  onClose,
  onStaleView,
}: {
  feedback: FeedbackResponseDto | null;
  onClose: () => void;
  onStaleView?: (attachmentId: string) => Promise<FeedbackAttachmentDto | null>;
}) {
  return (
    <Modal
      isOpen={!!feedback}
      onClose={onClose}
      title={t('反馈详情')}
      maxWidth="max-w-[560px]"
      closeOnOverlayClick
    >
      {feedback && (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">{feedback.title}</span>
            <Tag variant={STATUS_TAG[feedback.status] ?? 'neutral'}>
              {t(FEEDBACK_STATUS_MAP[feedback.status] ?? feedback.status)}
            </Tag>
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">
            {t(FEEDBACK_TYPE_MAP[feedback.type] ?? feedback.type)} ·{' '}
            {feedback.source} · {new Date(feedback.createdAt).toLocaleString()}
            {feedback.submitterName ? ` · ${feedback.submitterName}` : ` · ${t('匿名')}`}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {t('查询码')}：<span className="font-mono">{feedback.feedbackCode}</span>
          </p>
          <div className="rounded-lg bg-[var(--bg-secondary)] p-3 text-[var(--text-primary)]">
            <RichContentView
              html={feedback.content ?? ''}
              attachmentsById={Object.fromEntries(
                (feedback.attachments ?? []).map((a) => [a.id, a])
              )}
            />
          </div>
          {feedback.contact && (
            <p className="text-xs text-[var(--text-secondary)]">
              {t('联系方式')}：{feedback.contact}
            </p>
          )}
          {feedback.pageUrl && (
            <p className="text-xs text-[var(--text-secondary)]">
              {t('来源页面')}：{feedback.pageUrl}
            </p>
          )}
          {feedback.ip && (
            <p className="text-xs text-[var(--text-secondary)]">
              {t('IP')}：{feedback.ip}
            </p>
          )}
          {feedback.reward && (
            <div className="rounded-lg border border-[var(--border-default)] p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5">
                <Tag variant={REWARD_TAG[feedback.rewardStatus] ?? 'neutral'}>
                  {t(REWARD_STATUS_MAP[feedback.rewardStatus] ?? feedback.rewardStatus)}
                </Tag>
                <span>
                  {t('VIP{level} {days} 天', {
                    level: feedback.reward.vipTierLevel,
                    days: feedback.reward.durationDays,
                  })}
                </span>
              </div>
              {feedback.reward.user && (
                <p className="text-[var(--text-secondary)]">
                  {t('发放账号')}：
                  {feedback.reward.user.nickname || feedback.reward.user.username}
                </p>
              )}
              {feedback.reward.issuedAt && (
                <p className="text-[var(--text-secondary)]">
                  {t('发放时间')}：
                  {new Date(feedback.reward.issuedAt).toLocaleString()}
                </p>
              )}
              {feedback.reward.remark && (
                <p className="text-[var(--text-secondary)]">
                  {t('备注')}：{feedback.reward.remark}
                </p>
              )}
            </div>
          )}
          {feedback.attachments?.length ? (
            <div className="border-t border-[var(--border-subtle)] pt-3">
              <p className="mb-2 text-xs text-[var(--text-secondary)]">
                {t('附件')}（{feedback.attachments.length}）
              </p>
              <FeedbackAttachmentList
                attachments={feedback.attachments}
                onStaleView={onStaleView}
              />
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function TabButtonRow({
  active,
  onChange,
  options,
}: {
  active: string;
  onChange: (v: string) => void;
  options: readonly { value: string; labelKey: string }[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-lg text-sm ${
            active === o.value
              ? 'bg-[var(--primary-500)] text-white'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          {t(o.labelKey)}
        </button>
      ))}
    </div>
  );
}

function RowActions({
  feedback,
  canManage,
  canReward,
  onAdopt,
  onReject,
  onReviewing,
  onClose,
  onShowDetail,
  onIssue,
  onRevoke,
}: {
  feedback: FeedbackResponseDto;
  canManage: boolean;
  canReward: boolean;
  onAdopt: () => void;
  onReject: () => void;
  onReviewing: () => void;
  onClose: () => void;
  onShowDetail: () => void;
  onIssue: () => void;
  onRevoke: () => void;
}) {
  const s = feedback.status;
  const rs = feedback.rewardStatus;
  return (
    <div className="flex justify-end gap-1.5 flex-wrap">
      <Button size="xs" variant="ghost" onClick={onShowDetail}>
        {t('详情')}
      </Button>
      {canManage && s === 'PENDING' && (
        <Button size="xs" variant="outline" onClick={onReviewing}>
          {t('处理')}
        </Button>
      )}
      {canManage && (s === 'PENDING' || s === 'REVIEWING') && (
        <>
          <Button size="xs" variant="outline" icon={CheckCircle2} onClick={onAdopt}>
            {t('采纳')}
          </Button>
          <Button size="xs" variant="ghost" icon={XCircle} onClick={onReject}>
            {t('驳回')}
          </Button>
        </>
      )}
      {/* ADOPTED 是锁定终态（后端 status_locked_adopted 拒绝任何状态变更，只能走奖励撤销），
          故仅 REJECTED 可关闭；ADOPTED 行不渲染「关闭」按钮，避免点击恒报错 */}
      {canManage && s === 'REJECTED' && (
        <Button size="xs" variant="ghost" onClick={onClose}>
          {t('关闭')}
        </Button>
      )}
      {canReward && rs === 'PENDING' && (
        <Button size="xs" variant="outline" icon={Gift} onClick={onIssue}>
          {t('发放')}
        </Button>
      )}
      {canReward && rs !== 'NONE' && rs !== 'REVOKED' && (
        <Button size="xs" variant="ghost" icon={XCircle} onClick={onRevoke}>
          {t('撤销')}
        </Button>
      )}
    </div>
  );
}

/** 驳回弹窗：必填原因 */
function RejectDialog({
  isOpen,
  feedback,
  onClose,
  onRejected,
}: {
  isOpen: boolean;
  feedback: FeedbackResponseDto | null;
  onClose: () => void;
  onRejected: () => void;
}) {
  const { showToast } = useNotification();
  const updateStatus = useUpdateFeedbackStatus();
  const [reason, setReason] = useState('');

  React.useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  const handleSubmit = useCallback(async () => {
    if (!feedback) return;
    if (!reason.trim()) {
      showToast(t('请填写驳回原因'), 'warning');
      return;
    }
    try {
      await updateStatus.mutateAsync({
        id: feedback.id,
        body: { status: 'REJECTED', reason: reason.trim() },
      });
      showToast(t('已驳回'), 'success');
      onRejected();
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    }
  }, [feedback, reason, updateStatus, showToast, onRejected, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('驳回反馈')}
      maxWidth="max-w-[480px]"
      closeOnOverlayClick={!updateStatus.isPending}
    >
      <div className="flex flex-col gap-4">
        {feedback && (
          <p className="text-sm text-[var(--text-secondary)]">
            {t('反馈：')}「{feedback.title}」
          </p>
        )}
        <div className="space-y-2">
          <label className="block text-sm font-medium">{t('驳回原因（必填）')}</label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={t('请说明未采纳的原因')}
            disabled={updateStatus.isPending}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={updateStatus.isPending}>
            {t('取消')}
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={updateStatus.isPending}>
            {t('确认驳回')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
