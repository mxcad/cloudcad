///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

/**
 * VersionHistoryDropdown - 版本历史下拉菜单组件
 *
 * 功能：
 * - 显示历史版本图标按钮
 * - 点击后展示下拉菜单，显示版本列表
 * - 鼠标移入版本项时显示版本详情tooltip
 * - 点击版本项打开该版本
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import History from 'lucide-react/dist/esm/icons/history';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import ExternalLink from 'lucide-react/dist/esm/icons/external-link';
import { versionControlApi } from '../../services/versionControlApi';
import { Tooltip } from '../ui/Tooltip';
import type { SvnLogEntryDto } from '../../types/api-client';
import styles from './VersionHistoryDropdown.module.css';

interface VersionHistoryDropdownProps {
  /** 文件ID */
  fileId: string;
  /** 父节点ID（项目ID或文件夹ID） */
  parentId: string | null;
  /** 文件路径（SVN路径） */
  filePath: string;
  /** 项目ID */
  projectId: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 按钮尺寸 */
  size?: 'sm' | 'md';
  /** 查看版本回调（可选，默认打开新标签页） */
  onViewVersion?: (revision: number, fileId: string, parentId: string | null) => void;
}

/** 格式化日期 */
function formatDate(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes <= 1 ? '刚刚' : `${minutes}分钟前`;
    }
    return `${hours}小时前`;
  } else if (days === 1) {
    return '昨天';
  } else if (days < 7) {
    return `${days}天前`;
  }

  return d.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 格式化完整日期时间 */
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

/** 从消息中提取用户说明 */
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
  const [entries, setEntries] = useState<SvnLogEntryDto[]>([]);
  const [hoveredEntry, setHoveredEntry] = useState<SvnLogEntryDto | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // 加载版本历史
  const loadVersionHistory = useCallback(async () => {
    if (!projectId || !filePath) {
      setError('缺少必要参数');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await versionControlApi.getFileHistory(projectId, filePath, 20);
      if (response.data?.success) {
        setEntries(response.data.entries || []);
      } else {
        setError(response.data?.message || '加载版本历史失败');
      }
    } catch (err) {
      setError('加载版本历史失败');
      console.error('[VersionHistoryDropdown] 加载版本历史失败:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, filePath]);

  // 点击按钮时加载并显示下拉菜单
  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (disabled) return;

    if (!isOpen) {
      loadVersionHistory();
    }
    setIsOpen(!isOpen);
  };

  // 点击版本项
  const handleVersionClick = (e: React.MouseEvent, entry: SvnLogEntryDto) => {
    e.stopPropagation();
    e.preventDefault();

    if (onViewVersion) {
      onViewVersion(entry.revision, fileId, parentId);
    } else {
      // 默认在新标签页打开
      const url = `/cad-editor/${fileId}?nodeId=${parentId || ''}&v=${entry.revision}`;
      window.open(url, '_blank');
    }
    setIsOpen(false);
  };

  // 鼠标移入版本项
  const handleEntryHover = (e: React.MouseEvent, entry: SvnLogEntryDto) => {
    setHoveredEntry(entry);

    // 计算tooltip位置
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const dropdownRect = dropdownRef.current?.getBoundingClientRect();

    if (dropdownRect) {
      setTooltipPosition({
        top: rect.top - dropdownRect.top,
        left: dropdownRect.width + 8,
      });
    }
  };

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const isClickInButton = buttonRef.current?.contains(e.target as Node);
      const isClickInDropdown = dropdownRef.current?.contains(e.target as Node);

      if (!isClickInButton && !isClickInDropdown) {
        setIsOpen(false);
      }
    };

    // 延迟添加监听器，避免立即关闭
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 按ESC关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // 计算下拉菜单位置
  const getDropdownPosition = () => {
    if (!buttonRef.current) return { top: 0, left: 0 };
    const rect = buttonRef.current.getBoundingClientRect();
    return {
      top: rect.bottom + 4,
      left: rect.left,
    };
  };

  const position = getDropdownPosition();
  const buttonSize = size === 'sm' ? 24 : 28;

  return (
    <>
      {/* 历史版本按钮 */}
      <Tooltip content="版本历史" position="bottom" delay={100} disabled={disabled}>
        <button
          ref={buttonRef}
          onClick={handleButtonClick}
          disabled={disabled}
          className={`${styles.historyButton} ${isOpen ? styles.open : ''} ${disabled ? styles.disabled : ''}`}
          aria-label="查看版本历史"
          aria-expanded={isOpen}
          aria-haspopup="menu"
        >
          <History size={size === 'sm' ? 14 : 16} />
        </button>
      </Tooltip>

      {/* 下拉菜单 */}
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className={styles.dropdown}
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
          role="menu"
          aria-label="版本历史列表"
        >
          {/* 加载状态 */}
          {loading && (
            <div className={styles.loading}>
              <Loader2 className={styles.loadingIcon} size={16} />
              <span>加载中...</span>
            </div>
          )}

          {/* 错误状态 */}
          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          {/* 空状态 */}
          {!loading && !error && entries.length === 0 && (
            <div className={styles.empty}>
              <History size={20} className={styles.emptyIcon} />
              <span>暂无版本历史</span>
            </div>
          )}

          {/* 版本列表 */}
          {!loading && !error && entries.length > 0 && (
            <div className={styles.versionList}>
              {entries.map((entry) => {
                const displayName = entry.userName || entry.author || '系统';
                const userNote = extractUserNote(entry.message);

                return (
                  <div
                    key={entry.revision}
                    className={styles.versionItem}
                    onClick={(e) => handleVersionClick(e, entry)}
                    onMouseEnter={(e) => handleEntryHover(e, entry)}
                    onMouseLeave={() => setHoveredEntry(null)}
                    role="menuitem"
                    title={`版本 r${entry.revision}`}
                  >
                    {/* 版本号 */}
                    <span className={styles.versionNumber}>
                      r{entry.revision}
                    </span>

                    {/* 操作人 */}
                    <span className={styles.versionAuthor} title={displayName}>
                      {displayName}
                    </span>

                    {/* 时间 */}
                    <span className={styles.versionTime}>
                      {formatDate(entry.date)}
                    </span>

                    {/* 打开图标 */}
                    <ExternalLink size={12} className={styles.openIcon} />
                  </div>
                );
              })}
            </div>
          )}

          {/* 版本详情tooltip */}
          {hoveredEntry && (
            <div
              ref={tooltipRef}
              className={styles.tooltip}
              style={{
                top: `${tooltipPosition.top}px`,
                left: `${tooltipPosition.left}px`,
              }}
            >
              <div className={styles.tooltipHeader}>
                <span className={styles.tooltipTitle}>版本 r{hoveredEntry.revision}</span>
              </div>
              <div className={styles.tooltipContent}>
                <div className={styles.tooltipRow}>
                  <span className={styles.tooltipLabel}>操作人：</span>
                  <span>{hoveredEntry.userName || hoveredEntry.author || '系统'}</span>
                </div>
                <div className={styles.tooltipRow}>
                  <span className={styles.tooltipLabel}>时间：</span>
                  <span>{formatFullDate(hoveredEntry.date)}</span>
                </div>
                {extractUserNote(hoveredEntry.message) && (
                  <div className={styles.tooltipRow}>
                    <span className={styles.tooltipLabel}>备注：</span>
                    <span className={styles.tooltipNote}>
                      {extractUserNote(hoveredEntry.message)}
                    </span>
                  </div>
                )}
              </div>
              <div className={styles.tooltipFooter}>
                点击在新标签页打开此版本
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
};

export default VersionHistoryDropdown;
