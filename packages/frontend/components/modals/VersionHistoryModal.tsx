import React from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { SvnLogEntry } from '../../services/versionControlApi';
import { FileSystemNode } from '../../types/filesystem';

interface VersionHistoryModalProps {
  isOpen: boolean;
  node: FileSystemNode | null;
  entries: SvnLogEntry[];
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

  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      A: '添加',
      M: '修改',
      D: '删除',
      R: '替换',
    };
    return labels[action] || action;
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      A: 'text-green-600',
      M: 'text-blue-600',
      D: 'text-red-600',
      R: 'text-orange-600',
    };
    return colors[action] || 'text-slate-600';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`版本历史 - ${node?.name || '文件'}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {loading && (
          <div className="text-center py-8 text-slate-500">加载中...</div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="text-center py-8 text-slate-500">暂无版本历史</div>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {entries.map((entry) => (
              <div
                key={entry.revision}
                className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                      r{entry.revision}
                    </span>
                    <span className="text-sm text-slate-600">
                      {entry.userName || entry.author || '未知用户'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {formatDate(entry.date)}
                  </span>
                </div>

                {entry.message && (
                  <div className="text-sm text-slate-700 mb-2">
                    {entry.message}
                  </div>
                )}

                {/* 不显示 paths 列表，对单个文件版本历史来说意义不大 */}

                <div className="mt-3 pt-3 border-t border-slate-100">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onOpenVersion(entry.revision)}
                  >
                    在编辑器中打开
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default VersionHistoryModal;