import React from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import type { SvnLogEntryDto } from '@/api-sdk';
import { FileSystemNode } from '../../types/filesystem';
import { History } from 'lucide-react';

interface VersionHistoryModalProps {
  isOpen: boolean;
  node: FileSystemNode | null;
  entries: SvnLogEntryDto[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onOpenVersion: (revision: number) => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  node,
  entries,
  loading,
  error,
  onClose,
  onOpenVersion,
}) => {
  const formatDate = (date: string | Date) => {
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
  };

  // 从消息中提取用户说明
  const extractUserNote = (message: string): string | null => {
    const saveMatch = message.match(/^Save:\s*.+?\s*-\s*(.+)$/i);
    if (saveMatch) {
      return saveMatch[1]?.trim() ?? null;
    }
    return null;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`版本历史 - ${node?.name || '文件'}`}
      className="max-w-md"
      footer={
        <Button variant="ghost" onClick={onClose}>
          关闭
        </Button>
      }
    >
      <div className="space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2" />
            加载中...
          </div>
        )}

        {error && (
          <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-error)', border: '1px solid var(--border-error)', color: 'var(--error)' }}>
            {error}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8" style={{ color: 'var(--text-muted)' }}>
            <History className="w-10 h-10 mb-2 opacity-50" />
            <p>暂无版本历史</p>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className="border rounded-lg max-h-72 overflow-y-auto" style={{ borderColor: 'var(--border-default)' }}>
            {entries.map((entry) => {
              const displayName = entry.userName || entry.author || '系统';
              const userNote = extractUserNote(entry.message);

              return (
                <div
                  key={entry.revision}
                  className="flex items-center justify-between px-3 py-2.5 transition-colors"
                  style={{ '--hover-bg': 'var(--bg-tertiary)' } as React.CSSProperties}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* 版本号 */}
                    <span className="font-mono font-medium flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                      r{entry.revision}
                    </span>

                    {/* 操作人 */}
                    <span
                      className="truncate max-w-[100px]"
                      style={{ color: 'var(--text-secondary)' }}
                      title={displayName}
                    >
                      {displayName}
                    </span>

                    {/* 时间 */}
                    <span className="flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {formatDate(entry.date)}
                    </span>

                    {/* 用户说明 */}
                    {userNote && (
                      <span
                        className="truncate flex-1"
                        style={{ color: 'var(--text-tertiary)' }}
                        title={userNote}
                      >
                        · {userNote}
                      </span>
                    )}
                  </div>

                  {/* 查看按钮 */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenVersion(entry.revision)}
                    className="flex-shrink-0 ml-2"
                    style={{ color: 'var(--primary-600)' }}
                  >
                    查看
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default VersionHistoryModal;
