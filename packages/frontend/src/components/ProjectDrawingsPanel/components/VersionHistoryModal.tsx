///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { createPortal } from 'react-dom';
import type { VersionHistoryEntry } from '@/components/ProjectDrawingsPanel/hooks/useVersionHistory';

interface VersionHistoryModalProps {
  show: boolean;
  nodeName: string;
  entries: VersionHistoryEntry[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onOpenVersion: (revision: number) => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  show,
  nodeName,
  entries,
  loading,
  error,
  onClose,
  onOpenVersion,
}) => {
  if (!show) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 10000, background: 'var(--bg-overlay)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-xl shadow-lg"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          maxHeight: '80vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-6 py-4 border-b"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <h3
            className="text-lg font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            版本历史 - {nodeName}
          </h3>
        </div>
        <div
          className="p-6 overflow-y-auto"
          style={{ maxHeight: '60vh' }}
        >
          {loading ? (
            <div
              className="text-center py-8"
              style={{ color: 'var(--text-muted)' }}
            >
              加载中...
            </div>
          ) : error ? (
            <div
              className="text-center py-8"
              style={{ color: 'var(--error)' }}
            >
              {error}
            </div>
          ) : entries.length === 0 ? (
            <div
              className="text-center py-8"
              style={{ color: 'var(--text-muted)' }}
            >
              暂无版本历史
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.revision}
                  className="p-3 rounded-lg cursor-pointer transition-colors hover:opacity-80"
                  style={{ background: 'var(--bg-tertiary)' }}
                  onClick={() => onOpenVersion(entry.revision)}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <span
                      className="text-sm font-medium"
                      style={{ color: 'var(--primary-500)' }}
                    >
                      v{entry.revision}
                    </span>
                    <span
                      className="text-sm"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {entry.author}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {entry.date}
                    </span>
                  </div>
                  <div
                    className="text-sm"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {entry.message}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div
          className="px-6 py-4 border-t flex justify-end"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border transition-colors"
            style={{
              borderColor: 'var(--border-default)',
              color: 'var(--text-secondary)',
            }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
