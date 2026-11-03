import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { t } from '@/languages';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getErrorMessage } from '@/utils/errorHandler';
import {
  feedbackControllerQueryByCode,
  feedbackControllerListMine,
} from '@/api-sdk';
import type { FeedbackQueryResultDto, FeedbackResponseDto } from '@/api-sdk';
import { RichContentView, stripHtmlTags } from '@/components/richtext';
import { useAuth } from '@/contexts/AuthContext';
import {
  FEEDBACK_TYPE_MAP,
  FEEDBACK_STATUS_MAP,
  REWARD_STATUS_MAP,
} from '@/constants/feedback';
import {
  getLocalFeedbackRecords,
  type FeedbackLocalRecord,
} from '@/lib/feedbackLocalRecords';

/**
 * 反馈进度查询面板（凭查询码 + 可选联系方式，查询码非必填）。
 *
 * 打开即展示「我的反馈记录」：本设备本地记录（localStorage）+ 已登录时的云端
 * 记录（listMine），点击任意一条即可直达进度，无需手输查询码；手动查询表单仍
 * 保留（凭码 + 联系方式）供查询非本机/他人分享的查询码。
 *
 * 被「匿名查询页」与「提交反馈弹窗 → 查询进度」共用：两处查询语义完全一致。
 * 反馈内容为富文本 HTML（含行内图片/附件卡片），经 RichContentView 白名单净化 +
 * 按附件 id 水合真实资源后渲染。
 */
interface FeedbackQueryPanelProps {
  /** 预填查询码（如提交成功视图「查询进度」入口带码打开） */
  initialCode?: string;
}

/** 云端列表项（FeedbackResponseDto）→ 查询结果卡片形状（FeedbackQueryResultDto） */
function toQueryResult(f: FeedbackResponseDto): FeedbackQueryResultDto {
  return {
    feedbackCode: f.feedbackCode,
    type: f.type,
    status: f.status,
    title: f.title,
    content: f.content,
    rewardStatus: f.rewardStatus,
    claimRequired: f.claimRequired,
    adoptNote: f.adoptNote ?? null,
    rejectReason: f.rejectReason ?? null,
    attachments: f.attachments ?? [],
    createdAt: f.createdAt,
  };
}

/** 状态徽标底色（对齐 FeedbackMinePage） */
function statusPill(status: string): string {
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

export const FeedbackQueryPanel: React.FC<FeedbackQueryPanelProps> = ({
  initialCode,
}) => {
  const { isAuthenticated } = useAuth();
  const [code, setCode] = useState(initialCode?.toUpperCase() ?? '');
  const [contact, setContact] = useState('');
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FeedbackQueryResultDto | null>(null);
  // 本地记录：挂载时读取一次（提交弹窗写入后重新打开面板即可见）
  const [localRecords] = useState<FeedbackLocalRecord[]>(getLocalFeedbackRecords);
  // 云端记录：已登录时拉取（挂载一次；面板每次打开重挂载刷新）
  const [cloudRecords, setCloudRecords] = useState<FeedbackResponseDto[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  // 本地记录凭码查询失败时的本地预览兜底（云端暂查不到，如登录前匿名提交）
  const [localPreview, setLocalPreview] = useState<FeedbackLocalRecord | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setCloudLoading(true);
    setCloudError(null);
    feedbackControllerListMine({
      throwOnError: true,
      query: { page: 1, pageSize: 50 },
    })
      .then((res) => {
        if (cancelled) return;
        const d = res.data as { items?: FeedbackResponseDto[] } | undefined;
        setCloudRecords(d?.items ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setCloudError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setCloudLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const cloudCodes = useMemo(
    () => new Set(cloudRecords.map((f) => f.feedbackCode)),
    [cloudRecords]
  );
  // 不在已加载云列表中的本地记录（按查询码去重）：云端查不到的补充区
  const localOnly = useMemo(
    () => localRecords.filter((r) => !cloudCodes.has(r.code)),
    [localRecords, cloudCodes]
  );
  const hasRecords = cloudLoading || cloudRecords.length > 0 || localOnly.length > 0;

  const handleQuery = useCallback(async () => {
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      setError(t('请输入查询码'));
      return;
    }
    setError(null);
    setLocalPreview(null);
    setQuerying(true);
    try {
      const res = await feedbackControllerQueryByCode({
        throwOnError: true,
        path: { code: trimmedCode },
        query: { contact: contact.trim() || undefined },
      });
      setResult(res.data as FeedbackQueryResultDto);
    } catch (err) {
      setResult(null);
      setError(getErrorMessage(err));
    } finally {
      setQuerying(false);
    }
  }, [code, contact]);

  /** 点击云端记录：列表数据已含状态/奖励，直接渲染详情（无需再查询） */
  const handleSelectCloud = useCallback((f: FeedbackResponseDto) => {
    setError(null);
    setLocalPreview(null);
    setResult(toQueryResult(f));
    setCode(f.feedbackCode);
  }, []);

  /** 点击本地记录：凭码 + 已存联系方式查询云端进度；失败降级本地预览 */
  const handleSelectLocal = useCallback(
    async (r: FeedbackLocalRecord) => {
      setError(null);
      setResult(null);
      setLocalPreview(null);
      setCode(r.code);
      setContact(r.contact ?? '');
      setQuerying(true);
      try {
        const res = await feedbackControllerQueryByCode({
          throwOnError: true,
          path: { code: r.code },
          query: { contact: r.contact || undefined },
        });
        setResult(res.data as FeedbackQueryResultDto);
      } catch {
        setLocalPreview(r);
      } finally {
        setQuerying(false);
      }
    },
    []
  );

  return (
    <div className="space-y-4">
      {hasRecords && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('我的反馈')}</p>
          {cloudError && (
            <p className="text-xs text-red-600">{cloudError}</p>
          )}
          {cloudLoading && (
            <p className="text-xs text-[var(--text-secondary)]">
              {t('加载中...')}
            </p>
          )}
          {!cloudLoading && cloudRecords.length === 0 && localOnly.length === 0 && (
            <p className="text-xs text-[var(--text-secondary)]">
              {t('暂无反馈记录')}
            </p>
          )}
          <div className="max-h-[38vh] overflow-y-auto space-y-2 pr-1">
            {cloudRecords.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => handleSelectCloud(f)}
                className="w-full text-left rounded-lg border border-[var(--border-default)] p-3 hover:border-[var(--primary-500)] transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium truncate">{f.title}</span>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded text-xs ${statusPill(f.status)}`}
                  >
                    {t(FEEDBACK_STATUS_MAP[f.status] ?? f.status)}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mb-1">
                  {t(FEEDBACK_TYPE_MAP[f.type] ?? f.type)} ·{' '}
                  {new Date(f.createdAt).toLocaleString()}
                </p>
                <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
                  {stripHtmlTags(f.content ?? '')}
                </p>
              </button>
            ))}
            {localOnly.map((r) => (
              <button
                key={r.code}
                type="button"
                onClick={() => handleSelectLocal(r)}
                className="w-full text-left rounded-lg border border-[var(--border-default)] p-3 hover:border-[var(--primary-500)] transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium truncate">{r.title}</span>
                  <span className="shrink-0 px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">
                    {t('本地')}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mb-1">
                  {t(FEEDBACK_TYPE_MAP[r.type] ?? r.type)} ·{' '}
                  {new Date(r.createdAt).toLocaleString()}
                </p>
                <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
                  {stripHtmlTags(r.contentHtml)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium">{t('查询码')}</label>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t('请输入提交时获得的查询码')}
          disabled={querying}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleQuery();
          }}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">
          {t('联系方式（选填）')}
        </label>
        <Input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={t('提交时填写过联系方式则需匹配')}
          maxLength={100}
          disabled={querying}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleQuery();
          }}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button className="w-full" onClick={handleQuery} loading={querying} icon={Search}>
        {t('查询')}
      </Button>

      {result && (
        <div className="mt-4 rounded-lg border border-[var(--border-default)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">{t('状态')}</span>
            <span className="text-sm font-medium">
              {t(FEEDBACK_STATUS_MAP[result.status] ?? result.status)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">{t('类型')}</span>
            <span className="text-sm">
              {t(FEEDBACK_TYPE_MAP[result.type] ?? result.type)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">{t('标题')}</span>
            <span className="text-sm text-right max-w-[60%]">{result.title}</span>
          </div>
          {result.content && (
            <div className="text-sm">
              <span className="text-[var(--text-secondary)] mr-2">{t('反馈内容')}</span>
              <div className="mt-1 text-[var(--text-primary)]">
                <RichContentView
                  html={result.content}
                  attachmentsById={Object.fromEntries(
                    (result.attachments ?? []).map((a) => [a.id, a])
                  )}
                />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">{t('奖励')}</span>
            <span className="text-sm">
              {t(REWARD_STATUS_MAP[result.rewardStatus] ?? result.rewardStatus)}
            </span>
          </div>
          {result.adoptNote && (
            <div className="text-sm">
              <span className="text-[var(--text-secondary)] mr-2">{t('采纳说明')}</span>
              <span>{result.adoptNote}</span>
            </div>
          )}
          {result.rejectReason && (
            <div className="text-sm">
              <span className="text-[var(--text-secondary)] mr-2">{t('驳回原因')}</span>
              <span>{result.rejectReason}</span>
            </div>
          )}
          {result.claimRequired && (
            <p className="text-sm text-[var(--warning, #b45309)]">
              {t(
                '奖励已就绪但不能匿名领取：请凭查询码联系客服注册或绑定账号后发放。'
              )}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">{t('提交时间')}</span>
            <span className="text-sm">{new Date(result.createdAt).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* 本地记录凭码查询失败兜底：云端暂查不到时仅展示本地预览 */}
      {!result && localPreview && (
        <div className="mt-4 rounded-lg border border-[var(--border-default)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">{t('类型')}</span>
            <span className="text-sm">
              {t(FEEDBACK_TYPE_MAP[localPreview.type] ?? localPreview.type)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">{t('标题')}</span>
            <span className="text-sm text-right max-w-[60%]">{localPreview.title}</span>
          </div>
          <div className="text-sm">
            <span className="text-[var(--text-secondary)] mr-2">{t('反馈内容')}</span>
            <div className="mt-1 text-[var(--text-primary)]">
              {stripHtmlTags(localPreview.contentHtml)}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">{t('提交时间')}</span>
            <span className="text-sm">
              {new Date(localPreview.createdAt).toLocaleString()}
            </span>
          </div>
          <p className="text-sm text-[var(--warning, #b45309)]">
            {t('本地记录仅保存在本设备，登录后可查看云端完整记录')}
          </p>
        </div>
      )}
    </div>
  );
};
