import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { t } from '@/languages';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { Tabs } from '@/components/ui/Tabs';
import { Tab } from '@/components/ui/Tab';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useCopy } from '@/hooks/useCopy';
import { getErrorMessage } from '@/utils/errorHandler';
import { buildLoginUrl } from '@/config/clientSetup';
import {
  feedbackControllerListMine,
  feedbackControllerListMineRewards,
} from '@/api-sdk';
import type {
  FeedbackResponseDto,
  FeedbackRewardResponseDto,
} from '@/api-sdk';
import {
  FEEDBACK_TYPE_MAP,
  FEEDBACK_STATUS_MAP,
  REWARD_STATUS_MAP,
} from '@/constants/feedback';
import { FeedbackAttachmentList } from '@/components/feedback/FeedbackAttachmentList';
import { FeedbackQueryModal } from '@/components/feedback/FeedbackQueryModal';
import { stripHtmlTags } from '@/components/richtext';
import {
  getLocalFeedbackRecords,
  type FeedbackLocalRecord,
} from '@/lib/feedbackLocalRecords';

const PAGE_SIZE = 30;

/** 反馈状态徽标颜色 */
function statusColor(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'bg-amber-100 text-amber-800';
    case 'REVIEWING':
      return 'bg-blue-100 text-blue-800';
    case 'ADOPTED':
      return 'bg-green-100 text-green-800';
    case 'REJECTED':
      return 'bg-red-100 text-red-800';
    case 'CLOSED':
      return 'bg-gray-100 text-gray-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function rewardColor(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'bg-amber-100 text-amber-800';
    case 'ISSUED':
      return 'bg-green-100 text-green-800';
    case 'REVOKED':
      return 'bg-gray-100 text-gray-500';
    default:
      return 'bg-gray-100 text-gray-500';
  }
}

/** 本地记录卡片：标题 + 「本地」徽标 + 类型/时间 + 两行文本 + 查询码复制 + 查询进度 */
const LocalRecordCard: React.FC<{
  record: FeedbackLocalRecord;
  onQuery: (code: string) => void;
}> = ({ record, onQuery }) => {
  const copy = useCopy({
    successMessage: t('查询码已复制'),
    failMessage: t('复制失败'),
  });
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium truncate">{record.title}</span>
            <span className="shrink-0 px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">
              {t('本地')}
            </span>
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mb-2">
            {t(FEEDBACK_TYPE_MAP[record.type] ?? record.type)} ·{' '}
            {new Date(record.createdAt).toLocaleString()}
          </p>
          <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
            {stripHtmlTags(record.contentHtml)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            type="button"
            className="text-xs text-[var(--primary-500)] hover:underline"
            onClick={() => copy.copy(record.code, record.code)}
          >
            {copy.copiedMarker === record.code ? t('已复制') : t('查询码')}
          </button>
          <Button variant="outline" size="sm" onClick={() => onQuery(record.code)}>
            {t('查询进度')}
          </Button>
        </div>
      </div>
    </Card>
  );
};

/**
 * 我的反馈页（公开路由，未登录可访问）。
 *
 * - 未登录：仅展示本设备本地记录（提交反馈时写入 localStorage），
 *   隐藏「我的奖励」tab，提供登录入口（登录后可见云端完整记录）；
 * - 已登录：云端分页列表（我的反馈/我的奖励两个 tab）+ 顶部「本地记录」区
 *   （不在已加载云页中的本地记录，按查询码去重——如登录前匿名提交的反馈）。
 */
export const FeedbackMinePage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'feedback' | 'reward'>('feedback');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  // 本地记录：页面挂载时读取一次（提交弹窗写入后重新进入页面即可看到）
  const [localRecords] = useState<FeedbackLocalRecord[]>(getLocalFeedbackRecords);
  const [queryOpen, setQueryOpen] = useState(false);
  const [queryCode, setQueryCode] = useState<string | null>(null);
  const copy = useCopy({
    successMessage: t('查询码已复制'),
    failMessage: t('复制失败'),
  });

  const openQuery = useCallback((code: string) => {
    setQueryCode(code);
    setQueryOpen(true);
  }, []);

  const handleBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  }, [navigate]);

  // 每页条数变化：重置到第一页（新条数下深层页码无意义）
  const handlePageSizeChange = useCallback(
    (next: number) => {
      if (next === pageSize) return;
      setPageSize(next);
      setPage(1);
    },
    [pageSize]
  );

  const feedbackQuery = useQuery<{
    items: FeedbackResponseDto[];
    total: number;
  }>({
    queryKey: ['feedback-mine', page, pageSize],
    queryFn: async () => {
      const res = await feedbackControllerListMine({
        throwOnError: true,
        query: { page, pageSize },
      });
      const d = res.data as
        | { items: FeedbackResponseDto[]; total: number }
        | undefined;
      return { items: d?.items ?? [], total: d?.total ?? 0 };
    },
    enabled: isAuthenticated && tab === 'feedback',
  });

  const rewardQuery = useQuery<{ items: FeedbackRewardResponseDto[]; total: number }>({
    queryKey: ['feedback-mine-rewards'],
    queryFn: async () => {
      const res = await feedbackControllerListMineRewards({
        throwOnError: true,
      });
      const d = res.data as
        | { items: FeedbackRewardResponseDto[]; total: number }
        | undefined;
      return { items: d?.items ?? [], total: d?.total ?? 0 };
    },
    enabled: isAuthenticated && tab === 'reward',
  });

  const loading =
    tab === 'feedback' ? feedbackQuery.isLoading : rewardQuery.isLoading;
  const error =
    tab === 'feedback' ? feedbackQuery.error : rewardQuery.error;

  const handleRefresh = useCallback(() => {
    if (tab === 'feedback') feedbackQuery.refetch();
    else rewardQuery.refetch();
  }, [tab, feedbackQuery, rewardQuery]);

  const feedbackItems = feedbackQuery.data?.items ?? [];
  const rewardItems = rewardQuery.data?.items ?? [];

  // 不在已加载云页中的本地记录（按查询码去重）：云端查不到的补充区
  const cloudCodes = new Set(feedbackItems.map((f) => f.feedbackCode));
  const localOnly = localRecords.filter((r) => !cloudCodes.has(r.code));

  const header = (
    <div className="mb-4">
      <button
        type="button"
        onClick={handleBack}
        className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--primary-500)] mb-2"
      >
        <ArrowLeft size={16} />
        {t('返回')}
      </button>
      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">
        {t('我的反馈')}
      </h1>
      <p className="text-sm text-[var(--text-tertiary)]">
        {t('查看你提交的反馈处理进度与采纳奖励')}
      </p>
    </div>
  );

  // 未登录：仅本地记录 + 登录提示
  if (!isAuthenticated) {
    return (
      <div className="max-w-5xl mx-auto p-6 flex flex-col h-full overflow-hidden">
        {header}
        <Card className="p-4 flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--text-secondary)]">
            {t('本地记录仅保存在本设备，登录后可查看云端完整记录')}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(buildLoginUrl('/feedback/mine'))}
          >
            {t('登录')}
          </Button>
        </Card>
        {localRecords.length === 0 ? (
          <Card className="mt-4 p-8 text-center text-sm text-[var(--text-secondary)]">
            {t('暂无本地反馈记录')}
          </Card>
        ) : (
          <div className="mt-4 space-y-3 flex-1 overflow-y-auto">
            {localRecords.map((r) => (
              <LocalRecordCard key={r.code} record={r} onQuery={openQuery} />
            ))}
          </div>
        )}
        <FeedbackQueryModal
          isOpen={queryOpen}
          onClose={() => setQueryOpen(false)}
          initialCode={queryCode ?? undefined}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 flex flex-col h-full overflow-hidden">
      {header}

      <Tabs className="mb-4">
        <Tab
          value="feedback"
          active={tab === 'feedback'}
          onClick={() => setTab('feedback')}
        >
          {t('我的反馈')}
        </Tab>
        <Tab
          value="reward"
          active={tab === 'reward'}
          onClick={() => setTab('reward')}
        >
          {t('我的奖励')}
        </Tab>
      </Tabs>

      {error ? (
        <Card className="mt-4 p-8 text-center">
          <p className="text-red-600 text-sm mb-3">{getErrorMessage(error)}</p>
          <Button variant="secondary" onClick={handleRefresh}>
            {t('重试')}
          </Button>
        </Card>
      ) : loading ? (
        <Card className="mt-4 p-8 text-center text-sm text-[var(--text-secondary)]">
          {t('加载中...')}
        </Card>
      ) : tab === 'feedback' ? (
        <div className="mt-4 space-y-3 flex-1 overflow-y-auto">
          {localOnly.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-tertiary)]">
                {t('本地记录仅保存在本设备，登录后可查看云端完整记录')}
              </p>
              {localOnly.map((r) => (
                <LocalRecordCard key={r.code} record={r} onQuery={openQuery} />
              ))}
            </div>
          )}
          {feedbackItems.length === 0 ? (
            localOnly.length === 0 ? (
              <Card className="p-8 text-center text-sm text-[var(--text-secondary)]">
                {t('暂无反馈记录')}
              </Card>
            ) : null
          ) : (
            <>
              {feedbackItems.map((f) => (
                <Card key={f.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">
                          {f.title}
                        </span>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded text-xs ${statusColor(f.status)}`}
                        >
                          {t(FEEDBACK_STATUS_MAP[f.status] ?? f.status)}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] mb-2">
                        {t(FEEDBACK_TYPE_MAP[f.type] ?? f.type)} ·{' '}
                        {new Date(f.createdAt).toLocaleString()}
                      </p>
                      <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
                        {stripHtmlTags(f.content ?? '')}
                      </p>
                      {f.attachments?.length ? (
                        <div className="mt-2">
                          <FeedbackAttachmentList attachments={f.attachments} />
                        </div>
                      ) : null}
                      {f.adoptNote && (
                        <p className="text-sm text-green-700 mt-1">
                          {t('采纳说明')}：{f.adoptNote}
                        </p>
                      )}
                      {f.rejectReason && (
                        <p className="text-sm text-red-600 mt-1">
                          {t('驳回原因')}：{f.rejectReason}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${rewardColor(f.rewardStatus)}`}
                      >
                        {t(REWARD_STATUS_MAP[f.rewardStatus] ?? f.rewardStatus)}
                      </span>
                      <button
                        type="button"
                        className="text-xs text-[var(--primary-500)] hover:underline"
                        onClick={() => copy.copy(f.feedbackCode, f.id)}
                      >
                        {copy.copiedMarker === f.id ? t('已复制') : t('查询码')}
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
              {feedbackQuery.data && feedbackQuery.data.total > pageSize && (
                <div className="flex justify-center pt-2">
                  <Pagination
                    meta={{
                      total: feedbackQuery.data.total,
                      page,
                      limit: pageSize,
                      totalPages: Math.ceil(feedbackQuery.data.total / pageSize),
                    }}
                    onPageChange={setPage}
                    showSizeChanger
                    onPageSizeChange={handlePageSizeChange}
                    pageSizeOptions={[30, 50, 100]}
                  />
                </div>
              )}
            </>
          )}
        </div>
      ) : rewardItems.length === 0 ? (
        <Card className="mt-4 p-8 text-center text-sm text-[var(--text-secondary)]">
          {t('暂无奖励记录')}
        </Card>
      ) : (
        <div className="mt-4 space-y-3 flex-1 overflow-y-auto">
          {rewardItems.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {t('VIP{level} 会员 {days} 天', {
                      level: r.vipTierLevel,
                      days: r.durationDays,
                    })}
                  </p>
                  {r.feedbackTitle && (
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      {t('关联反馈')}：{r.feedbackTitle}
                      {r.feedbackCode ? `（${r.feedbackCode}）` : ''}
                    </p>
                  )}
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    {new Date(r.createdAt).toLocaleString()}
                    {r.issuedAt
                      ? ` · ${t('发放于')} ${new Date(r.issuedAt).toLocaleString()}`
                      : ''}
                  </p>
                  {r.remark && (
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      {r.remark}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded text-xs ${rewardColor(r.status)}`}
                >
                  {t(REWARD_STATUS_MAP[r.status] ?? r.status)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
      <FeedbackQueryModal
        isOpen={queryOpen}
        onClose={() => setQueryOpen(false)}
        initialCode={queryCode ?? undefined}
      />
    </div>
  );
};

export default FeedbackMinePage;
