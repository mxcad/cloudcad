///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { SelectableTable } from '@/components/common/SelectableTable';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { useNotification } from '@/contexts/NotificationContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useFileBrowserSelection } from '@/hooks/file-browser';
import type { NoticeResponseDto } from '@/api-sdk';
import { t } from '@/languages';
import { formatDateTime } from '@/utils/dateUtils';
import { NoticeFormModal } from './components/NoticeFormModal';
import {
  NOTICE_KIND_LABELS,
  NOTICE_LEVEL_LABELS,
  NOTICE_LEVEL_TAG_VARIANTS,
  NOTICE_STATUS_LABELS,
  NOTICE_STATUS_TAG_VARIANTS,
} from './constants';
import {
  useCreateNotice,
  useNoticeList,
  usePublishNotice,
  useRetractNotice,
  useUpdateNotice,
} from './hooks/useNotices';
import { deriveNoticeStatus, type NoticeFormValues } from './types';

/**
 * 公告管理：发布 / 编辑 / 下线部署更新等系统通知。
 *
 * 发布后后端会经 Redis → SSE 实时推给所有在线客户端，30s 轮询兜底；
 * 本页只做编排，不订阅推送（否则管理端自己会弹框）。
 */
export default function NoticeCenterPage() {
  useDocumentTitle(t('通知管理'));
  const { showConfirm } = useNotification();

  const { items, loading, refetch } = useNoticeList();
  const createMutation = useCreateNotice(() => setFormOpen(false));
  const updateMutation = useUpdateNotice(() => setEditing(null));
  const publishMutation = usePublishNotice();
  const retractMutation = useRetractNotice();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NoticeResponseDto | null>(null);

  const selectableItems = useMemo(
    () => items.map((notice) => ({ id: notice.id })),
    [items]
  );
  const { selectedNodes, handleNodeSelect, handleSelectAll, selectMany } =
    useFileBrowserSelection({ nodes: selectableItems, multiple: 'always' });

  const handleCreate = (values: NoticeFormValues) => {
    createMutation.mutate(values);
  };

  const handleUpdate = (values: NoticeFormValues) => {
    if (!editing) return;
    updateMutation.mutate({ id: editing.id, values });
  };

  const handleRetract = (notice: NoticeResponseDto) => {
    void (async () => {
      const confirmed = await showConfirm({
        title: t('下线公告'),
        message: t('下线后所有用户将立即不再看到「{title}」。', {
          title: notice.title,
        }),
        type: 'warning',
        confirmText: t('下线'),
      });
      if (confirmed) retractMutation.mutate({ id: notice.id });
    })();
  };

  return (
    <div className="h-full flex flex-col overflow-hidden p-6 text-text-secondary">
      <div className="max-w-7xl mx-auto w-full flex flex-col flex-1 min-h-0">
        <div className="flex-shrink-0 flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text-primary">
            {t('通知管理')}
          </h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              onClick={() => void refetch()}
            >
              {t('刷新')}
            </Button>
            <Button size="sm" icon={Plus} onClick={() => setFormOpen(true)}>
              {t('发布公告')}
            </Button>
          </div>
        </div>

        <Card
          variant="outlined"
          padding="none"
          radius="xl"
          className="flex-1 min-h-0 flex flex-col"
        >
          <div className="flex-1 min-h-0 flex flex-col">
            <SelectableTable<NoticeResponseDto>
              rows={items}
              selectedIds={selectedNodes}
              loading={loading}
              loadingView={
                <div className="flex justify-center py-16">
                  <div
                    className="w-8 h-8 rounded-full animate-spin"
                    style={{
                      border: '3px solid var(--border-default)',
                      borderTopColor: 'var(--primary-500)',
                    }}
                  />
                </div>
              }
              emptyView={
                <div
                  className="text-center py-8 text-sm"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {t('暂无公告')}
                </div>
              }
              onToggleSelect={handleNodeSelect}
              onToggleSelectAll={handleSelectAll}
              onRubberBandSelect={selectMany}
              renderHeader={() => (
                <>
                  <th className="text-left">{t('标题')}</th>
                  <th className="text-center">{t('类型')}</th>
                  <th className="text-center">{t('级别')}</th>
                  <th className="text-center">{t('状态')}</th>
                  <th className="text-left">{t('生效开始')}</th>
                  <th className="text-left">{t('失效时间')}</th>
                  <th className="text-left">{t('发布时间')}</th>
                  <th className="text-center">{t('操作')}</th>
                </>
              )}
              renderRow={(notice) => {
                const status = deriveNoticeStatus(notice);
                return (
                  <>
                    <td className="max-w-[320px]">
                      <div
                        className="truncate font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {notice.title}
                      </div>
                      {notice.body && (
                        <div
                          className="truncate text-xs"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {notice.body}
                        </div>
                      )}
                    </td>
                    <td className="text-center">
                      <Tag size="xs">
                        {t(NOTICE_KIND_LABELS[notice.kind] ?? notice.kind)}
                      </Tag>
                    </td>
                    <td className="text-center">
                      <Tag
                        size="xs"
                        variant={
                          NOTICE_LEVEL_TAG_VARIANTS[notice.level] ?? 'info'
                        }
                      >
                        {t(NOTICE_LEVEL_LABELS[notice.level] ?? notice.level)}
                      </Tag>
                    </td>
                    <td className="text-center">
                      <Tag
                        size="xs"
                        variant={NOTICE_STATUS_TAG_VARIANTS[status]}
                        dot={status === 'active'}
                      >
                        {t(NOTICE_STATUS_LABELS[status])}
                      </Tag>
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {notice.startAt
                        ? formatDateTime(notice.startAt)
                        : t('发布即生效')}
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {notice.endAt ? (
                        formatDateTime(notice.endAt)
                      ) : (
                        <Tag variant="neutral" size="xs">
                          {t('不自动失效')}
                        </Tag>
                      )}
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {notice.publishedAt
                        ? formatDateTime(notice.publishedAt)
                        : t('未发布')}
                    </td>
                    <td className="text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        {deriveNoticeStatus(notice) === 'draft' && (
                          <Button
                            variant="ghost"
                            size="xs"
                            disabled={publishMutation.isPending}
                            onClick={(event) => {
                              event.stopPropagation();
                              publishMutation.mutate({ id: notice.id });
                            }}
                          >
                            {t('发布')}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={updateMutation.isPending}
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditing(notice);
                          }}
                        >
                          {t('编辑')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={
                            !notice.publishedAt || retractMutation.isPending
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRetract(notice);
                          }}
                        >
                          {t('下线')}
                        </Button>
                      </div>
                    </td>
                  </>
                );
              }}
            />
          </div>
        </Card>

        <div
          className="flex-shrink-0 mt-3 flex items-center gap-2 text-xs"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {t(
            '发布公告后用户最长 30 秒内收到（轮询）；未填写生效开始时间则立即弹出。'
          )}
        </div>
      </div>

      <NoticeFormModal
        isOpen={formOpen || editing !== null}
        saving={createMutation.isPending || updateMutation.isPending}
        notice={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={editing ? handleUpdate : handleCreate}
      />
    </div>
  );
}
