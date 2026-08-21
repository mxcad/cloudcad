import React from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import type { MxLogEntryDto } from '@/api-sdk';
import { FileSystemNode } from '../../types/filesystem';
import { History } from 'lucide-react';
import { t } from '@/languages';
import { toVersionDisplayList } from '../../utils/versionHistory';

interface VersionHistoryModalProps {
  isOpen: boolean;
  node: FileSystemNode | null;
  entries: MxLogEntryDto[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  /** 正在预热的版本号（非 null 时展示等待提示，对应行按钮 loading） */
  openingRevision: number | null;
  /** 预热失败提示（非 null 时展示错误，不打开编辑器） */
  openingVersionError: string | null;
  onClose: () => void;
  onOpenVersion: (revision: number) => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  node,
  entries,
  totalCount,
  loading,
  error,
  openingRevision,
  openingVersionError,
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
      title={t(`版本历史`) + ` - ${node?.name || t('文件')}`}
      className="max-w-md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('关闭')}
        </Button>
      }
    >
      <div className="space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2" />
            {t('加载中...')}
          </div>
        )}

        {error && (
          <div
            className="rounded-lg px-3 py-2"
            style={{
              background: 'var(--bg-error)',
              border: '1px solid var(--border-error)',
              color: 'var(--error)',
            }}
          >
            {error}
          </div>
        )}

        {/* 历史版本首次访问需后端生成 mxweb 缓存（分片下载 + 转换），可能耗时数十秒，
            预热期间给出明确等待提示，避免用户误以为卡死 */}
        {openingRevision !== null && (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{
              background: 'var(--bg-info)',
              border: '1px solid var(--border-info)',
              color: 'var(--text-secondary)',
            }}
          >
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 flex-shrink-0" />
            <span>{t('正在准备历史版本文件，首次打开需要转换，请稍候...')}</span>
          </div>
        )}

        {openingVersionError && (
          <div
            className="rounded-lg px-3 py-2"
            style={{
              background: 'var(--bg-error)',
              border: '1px solid var(--border-error)',
              color: 'var(--error)',
            }}
          >
            {openingVersionError}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div
            className="flex flex-col items-center justify-center py-8"
            style={{ color: 'var(--text-muted)' }}
          >
            <History className="w-10 h-10 mb-2 opacity-50" />
            <p>{t('暂无版本历史')}</p>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <div
            className="border rounded-lg max-h-72 overflow-y-auto"
            style={{ borderColor: 'var(--border-default)' }}
          >
            {toVersionDisplayList(entries, totalCount).map(
              ({ entry, versionIndex }, index) => {
                const displayName =
                  entry.userName || entry.author || t('系统');
                const userNote = extractUserNote(entry.message);

              return (
                <div
                  key={index}
                  className="flex items-center justify-between px-3 py-2.5 transition-colors"
                  style={
                    {
                      '--hover-bg': 'var(--bg-tertiary)',
                    } as React.CSSProperties
                  }
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = 'var(--bg-tertiary)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = 'transparent')
                  }
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* 版本号 */}
                    <span
                      className="font-mono font-medium flex-shrink-0"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      r{versionIndex}
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
                    <span
                      className="flex-shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                    >
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
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpenVersion(entry.revision)}
                    disabled={openingRevision !== null}
                    className="flex-shrink-0 ml-2 min-w-[64px]"
                    style={{ color: 'var(--primary-600)' }}
                  >
                    {openingRevision === entry.revision ? (
                      <span className="flex items-center gap-1.5">
                        <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 inline-block" />
                        {t('准备中...')}
                      </span>
                    ) : (
                      t('查看')
                    )}
                  </Button>
                </div>
              );
              },
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default VersionHistoryModal;
