/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

import { useEffect, useState } from 'react';
import { Copy, RefreshCw, Search, ShieldBan, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { t } from '@/languages';
import { globalShowToast } from '@/utils/notificationEvents';
import {
  SECURITY_ATTEMPT_PAGE_SIZE,
  SECURITY_ATTEMPT_REASON_META,
} from './constants';
import {
  useBlacklistSecurityAttempt,
  useSecurityAccessAttemptList,
  useWhitelistSecurityAttempt,
} from './hooks/useSecurityAccessAttempt';
import type { SecurityAccessAttemptAggregate } from './types';

/** 复制文本到剪贴板 */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    globalShowToast(t('复制成功'), 'success');
  } catch {
    globalShowToast(t('复制失败'), 'error');
  }
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}

/**
 * @param embedded 嵌入 IP 访问控制 Tab 时为 true：隐藏独立页头与外边距
 * （标题由外层 Tab 承担，「管理员登录被拒记录」标签保留在工具栏行内）
 */
export default function SecurityAccessAttemptPage({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  useDocumentTitle(t('高危访问尝试'), embedded);

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');

  // 输入防抖 500ms 后生效
  useEffect(() => {
    const timer = setTimeout(() => {
      setKeyword(searchInput.trim());
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { items, total, loading, refetch } = useSecurityAccessAttemptList(
    page,
    keyword
  );
  const whitelistMutation = useWhitelistSecurityAttempt();
  const blacklistMutation = useBlacklistSecurityAttempt();

  const totalPages = Math.ceil(total / SECURITY_ATTEMPT_PAGE_SIZE);

  const handleWhitelist = (item: SecurityAccessAttemptAggregate) => {
    if (item.inWhitelist) {
      globalShowToast(t('该 IP 已在白名单中'), 'info');
      return;
    }
    if (
      window.confirm(
        t('确定将该 IP（{ip}）加入管理员白名单？', { ip: item.ip })
      )
    ) {
      whitelistMutation.mutate(item.ip);
    }
  };

  const handleBlacklist = (item: SecurityAccessAttemptAggregate) => {
    if (item.inBlacklist) {
      globalShowToast(t('该 IP 已在黑名单中'), 'info');
      return;
    }
    if (
      window.confirm(
        t('确定将该 IP（{ip}）加入黑名单？', { ip: item.ip })
      )
    ) {
      blacklistMutation.mutate(item.ip);
    }
  };

  // 分页
  const goToPage = (next: number) => {
    if (next < 1 || next > totalPages) return;
    setPage(next);
  };

  return (
    <div
      className={
        embedded
          ? 'h-full flex flex-col overflow-hidden text-text-secondary'
          : 'h-full flex flex-col overflow-hidden p-6 text-text-secondary'
      }
    >
      <div
        className={
          embedded
            ? 'w-full flex flex-col flex-1 min-h-0'
            : 'max-w-7xl mx-auto w-full flex flex-col flex-1 min-h-0'
        }
      >
        <div
          className={
            embedded
              ? 'flex-shrink-0 flex items-center justify-between mb-4'
              : 'flex-shrink-0 flex items-center justify-between mb-6'
          }
        >
          <div className="flex items-center gap-2">
            {!embedded && (
              <h1 className="text-2xl font-bold text-text-primary">
                {t('高危访问尝试')}
              </h1>
            )}
            <Tag variant="error" size="xs">
              {t('管理员登录被拒记录')}
            </Tag>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-tertiary)' }}
              />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('搜索 IP/账号')}
                className="pl-9 pr-8 w-64"
                size="md"
              />
              {searchInput && (
                <button
                  type="button"
                  aria-label={t('清空搜索')}
                  title={t('清空搜索')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ color: 'var(--text-tertiary)' }}
                  onClick={() => setSearchInput('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              onClick={() => void refetch()}
            />
          </div>
        </div>

        <Card
          variant="outlined"
          padding="none"
          radius="xl"
          className="flex-1 min-h-0 flex flex-col"
        >
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
          ) : items.length === 0 ? (
            <div
              className="text-center py-8 text-sm"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {t('暂无高危访问尝试')}
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-left"
                    style={{ borderBottom: '1px solid var(--border-default)' }}
                  >
                    <th className="px-4 py-3">{t('IP')}</th>
                    <th className="px-4 py-3 text-center">{t('次数')}</th>
                    <th className="px-4 py-3">{t('拒绝原因')}</th>
                    <th className="px-4 py-3">{t('最近账号')}</th>
                    <th className="px-4 py-3">{t('最近尝试')}</th>
                    <th className="px-4 py-3 text-center">{t('当前状态')}</th>
                    <th className="px-4 py-3 text-center">{t('操作')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.ip}
                      className="align-middle"
                      style={{ borderBottom: '1px solid var(--border-default)' }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs break-all">
                            {item.ip}
                          </span>
                          <button
                            type="button"
                            aria-label={t('复制 IP')}
                            title={t('复制 IP')}
                            className="shrink-0 cursor-pointer"
                            style={{ color: 'var(--text-tertiary)' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              void copyToClipboard(item.ip);
                            }}
                          >
                            <Copy size={13} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Tag variant="warning" size="xs">
                          {item.count}
                        </Tag>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(item.reasons).map(
                            ([reason, count]) => {
                              const meta = SECURITY_ATTEMPT_REASON_META[reason];
                              return (
                                <Tag
                                  key={reason}
                                  variant={meta?.variant ?? 'neutral'}
                                  size="xs"
                                >
                                  {meta?.label ?? reason}
                                  {count > 1 ? ` ×${count}` : ''}
                                </Tag>
                              );
                            }
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs max-w-[180px] truncate">
                        {item.account ?? t('—')}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {formatTime(item.lastSeen)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center gap-1">
                          {item.inWhitelist && (
                            <Tag variant="success" size="xs">
                              {t('白名单')}
                            </Tag>
                          )}
                          {item.inBlacklist && (
                            <Tag variant="error" size="xs">
                              {t('黑名单')}
                            </Tag>
                          )}
                          {!item.inWhitelist && !item.inBlacklist && (
                            <span
                              className="text-xs"
                              style={{ color: 'var(--text-tertiary)' }}
                            >
                              {t('未处理')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={ShieldCheck}
                            disabled={item.inWhitelist || whitelistMutation.isPending}
                            onClick={() => handleWhitelist(item)}
                          >
                            {t('加白')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={ShieldBan}
                            disabled={item.inBlacklist || blacklistMutation.isPending}
                            onClick={() => handleBlacklist(item)}
                          >
                            {t('拉黑')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 分页 */}
          <div
            className="flex-shrink-0 flex items-center justify-between px-4 py-3 text-xs"
            style={{ borderTop: '1px solid var(--border-default)' }}
          >
            <span style={{ color: 'var(--text-tertiary)' }}>
              {t('共 {total} 个 IP', { total: String(total) })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="xs"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
              >
                {t('上一页')}
              </Button>
              <span>
                {page} / {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="xs"
                disabled={page >= totalPages}
                onClick={() => goToPage(page + 1)}
              >
                {t('下一页')}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
