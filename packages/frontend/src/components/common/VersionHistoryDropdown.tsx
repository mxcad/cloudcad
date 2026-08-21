/////////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
/////////////////////////////////////////////////////////////////////////////////

import React, { useState, useRef, useCallback } from 'react';
import { History, Loader2, ExternalLink } from 'lucide-react';
import {
  versionControlControllerGetFileHistory,
  MxLogEntryDto,
} from '@/api-sdk';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { Tooltip } from '../ui/Tooltip';
import { Menu } from '../ui/Menu';
import { toVersionDisplayList } from '@/utils/versionHistory';

import styles from './VersionHistoryDropdown.module.css';

interface VersionHistoryDropdownProps {
  fileId: string;
  parentId: string | null;
  filePath: string;
  projectId: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  onViewVersion?: (
    revision: number,
    fileId: string,
    parentId: string | null
  ) => void;
}

function formatDate(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes <= 1 ? t('刚刚') : t(`${minutes}分钟前`);
    }
    return t(`${hours}小时前`);
  } else if (days === 1) {
    return t('昨天');
  } else if (days < 7) {
    return t(`${days}天前`);
  }

  return d.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFullDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function extractUserNote(message: string): string | null {
  if (!message) return null;
  const saveMatch = message.match(/^Save:\s*.+?\s*-\s*(.+)$/i);
  if (saveMatch) {
    return saveMatch[1]?.trim() ?? null;
  }
  return message.trim() || null;
}

export const VersionHistoryDropdown: React.FC<VersionHistoryDropdownProps> = ({
  fileId,
  parentId,
  filePath,
  projectId,
  disabled = false,
  size = 'sm',
  onViewVersion,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<MxLogEntryDto[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hoveredEntry, setHoveredEntry] = useState<MxLogEntryDto | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);

  const loadVersionHistory = useCallback(async () => {
    if (!projectId || !filePath) {
      setError(t('缺少必要参数'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await versionControlControllerGetFileHistory({
        query: { projectId, filePath, limit: 20 },
      });
      if (response.data && !response.error) {
        setEntries(response.data?.entries || []);
        setTotalCount(
          response.data?.totalCount ?? response.data?.entries?.length ?? 0
        );
      } else {
        // 注意：不能用 String(response.error)——error 是对象/Error，序列化会显示
        // "[object Object]" 或 "Error: xxx"，必须提取 message
        setError(getErrorMessage(response.error) || t('加载版本历史失败'));
      }
    } catch (err) {
      setError(getErrorMessage(err) || t('加载版本历史失败'));
      console.error('[VersionHistoryDropdown]', t('加载版本历史失败'), err);
    } finally {
      setLoading(false);
    }
  }, [projectId, filePath]);

  const handleVersionClick = (entry: MxLogEntryDto) => {
    if (onViewVersion) {
      onViewVersion(entry.revision, fileId, parentId);
    } else {
      const url = `/cad-editor/${fileId}?nodeId=${parentId || ''}&v=${entry.revision}&back=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      window.open(url, '_blank');
    }
    setIsOpen(false);
  };

  const buttonSize = size === 'sm' ? 24 : 28;

  return (
    <>
      <Menu
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) setHoveredEntry(null);
          if (open && !loading && entries.length === 0) {
            loadVersionHistory();
          }
        }}
      >
        <Tooltip
          content={t('版本历史')}
          position="bottom"
          delay={100}
          disabled={disabled}
        >
          <Menu.Trigger>
            <button
              ref={buttonRef}
              disabled={disabled}
              onClick={(e) => e.stopPropagation()}
              className={`${styles.historyButton} ${isOpen ? styles.open : ''} ${disabled ? styles.disabled : ''}`}
              aria-label={t('查看版本历史')}
              aria-expanded={isOpen}
              aria-haspopup="menu"
            >
              <History size={size === 'sm' ? 14 : 16} />
            </button>
          </Menu.Trigger>
        </Tooltip>

        <Menu.Content
          align="start"
          side="bottom"
          sideOffset={4}
          className="min-w-[200px] max-w-[280px]"
        >
          {loading && (
            <Menu.Loading>
              <Loader2 className={styles.loadingIcon} size={16} />
              <span>{t('加载中...')}</span>
            </Menu.Loading>
          )}

          {error && !loading && <Menu.Error>{error}</Menu.Error>}

          {!loading && !error && entries.length === 0 && (
            <Menu.Empty>
              <History size={20} className={styles.emptyIcon} />
              <span>{t('暂无版本历史')}</span>
            </Menu.Empty>
          )}

          {!loading && !error && entries.length > 0 && (
            <div className={styles.versionList}>
              {toVersionDisplayList(entries, totalCount).map(
                ({ entry, versionIndex }, index) => {
                  const displayName =
                    entry.userName || entry.author || t('系统');
                  const userNote = extractUserNote(entry.message);

                  return (
                    <Menu.Item
                      key={index}
                      variant="info"
                      onClick={() => handleVersionClick(entry)}
                      className="relative"
                    >
                      <div
                        className="flex items-center gap-2 w-full"
                        onMouseEnter={() => setHoveredEntry(entry)}
                        onMouseLeave={() => setHoveredEntry(null)}
                      >
                        <span className={styles.versionNumber}>
                          r{versionIndex}
                        </span>
                        <span
                          className={styles.versionAuthor}
                          title={displayName}
                        >
                          {displayName}
                        </span>
                        <span className={styles.versionTime}>
                          {formatDate(entry.date)}
                        </span>
                        <ExternalLink size={12} className={styles.openIcon} />
                      </div>

                      {hoveredEntry === entry && (
                        <div
                          className={styles.tooltip}
                          style={{
                            top: '0',
                            left: '100%',
                            marginLeft: '8px',
                          }}
                        >
                          <div className={styles.tooltipHeader}>
                            <span className={styles.tooltipTitle}>
                              {t('版本 r{v}', {
                                v: String(versionIndex),
                              })}
                            </span>
                          </div>
                          <div className={styles.tooltipContent}>
                            <div className={styles.tooltipRow}>
                              <span className={styles.tooltipLabel}>
                                {t('操作人：')}
                              </span>
                              <span>
                                {hoveredEntry.userName ||
                                  hoveredEntry.author ||
                                  t('系统')}
                              </span>
                            </div>
                            <div className={styles.tooltipRow}>
                              <span className={styles.tooltipLabel}>
                                {t('时间：')}
                              </span>
                              <span>{formatFullDate(hoveredEntry.date)}</span>
                            </div>
                            {extractUserNote(hoveredEntry.message) && (
                              <div className={styles.tooltipRow}>
                                <span className={styles.tooltipLabel}>
                                  {t('备注：')}
                                </span>
                                <span className={styles.tooltipNote}>
                                  {extractUserNote(hoveredEntry.message)}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className={styles.tooltipFooter}>
                            {t('点击在新标签页打开此版本')}
                          </div>
                        </div>
                      )}
                    </Menu.Item>
                  );
                }
              )}
            </div>
          )}
        </Menu.Content>
      </Menu>
    </>
  );
};

export default VersionHistoryDropdown;
