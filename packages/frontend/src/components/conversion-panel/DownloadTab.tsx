import React from 'react';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Download,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { t } from '@/languages';
import { useBatchDownloadStore } from '@/stores/useBatchDownloadStore';
import { useBatchDownload } from '@/hooks/file-system/useBatchDownload';
import type { BatchTask } from '@/stores/useBatchDownloadStore';
import { formatDateTime, getRelativeTime } from '@/utils/dateUtils';
import { useCappedList } from './useCappedList';

/**
 * 下载任务状态标签映射
 */
const STATUS_LABELS: Record<BatchTask['status'], string> = {
  PENDING: '排队中',
  PROCESSING: '处理中',
  COMPLETED: '完成',
  FAILED: '失败',
  CANCELLED: '已取消',
};

/**
 * 下载任务状态图标
 */
function getStatusIcon(status: BatchTask['status']) {
  const isActive = status === 'PENDING' || status === 'PROCESSING';
  const isCompleted = status === 'COMPLETED';

  if (isActive) return <Loader2 size={14} className="conv-icon spin" />;
  if (isCompleted) return <CheckCircle2 size={14} className="conv-icon" />;
  if (status === 'FAILED')
    return <AlertCircle size={14} className="conv-icon" />;
  return <XCircle size={14} className="conv-icon" />;
}

/**
 * 下载任务状态行类名
 */
function getStatusClassName(status: BatchTask['status']): string {
  const isActive = status === 'PENDING' || status === 'PROCESSING';
  const isCompleted = status === 'COMPLETED';

  if (isActive) return 'processing';
  if (isCompleted) return 'completed';
  if (status === 'FAILED') return 'failed';
  return 'cancelled';
}

/**
 * 获取任务显示名称
 */
function getTaskDisplayName(task: BatchTask): string {
  if (task.mode === 'zip') {
    return t('ZIP打包 ({count}个文件)', { count: String(task.totalCount) });
  }
  const names = task.itemNames;
  if (names && names.length > 0) {
    // 多文件 individual 任务：显示首文件 + 剩余数（「file1 +N」），避免只看到第一个文件
    const first = names[0] ?? '';
    if (names.length === 1) return first;
    return `${first} +${names.length - 1}`;
  }
  return t('逐个下载 ({count}个文件)', { count: String(task.totalCount) });
}

/** individual 任务全部文件名（tooltip 用，逗号分隔） */
function getTaskNamesTooltip(task: BatchTask): string | undefined {
  if (task.itemNames && task.itemNames.length > 0) {
    return task.itemNames.join(', ');
  }
  return undefined;
}

/**
 * 下载任务行组件
 */
interface DownloadTaskRowProps {
  task: BatchTask;
  onDownload: (task: BatchTask) => void;
  onCancel: (taskId: string) => void;
  /** 重试失败的批量下载任务（后端仅允许 FAILED 任务重试） */
  onRetry: (taskId: string) => void;
  /** 仅重试失败项（后端创建新任务，成功项不重跑；仅 FAILED 且记录了失败项时显示） */
  onRetryFailed: (taskId: string) => void;
}

const DownloadTaskRow: React.FC<DownloadTaskRowProps> = ({
  task,
  onDownload,
  onCancel,
  onRetry,
  onRetryFailed,
}) => {
  const isActive = task.status === 'PENDING' || task.status === 'PROCESSING';
  const isCompleted = task.status === 'COMPLETED';
  const statusLabel = STATUS_LABELS[task.status];
  const statusClassName = getStatusClassName(task.status);
  const displayName = getTaskDisplayName(task);

  return (
    <div
      className={`conversion-row conversion-row-download ${statusClassName}`}
    >
      <div className="conversion-row-main">
        {getStatusIcon(task.status)}
        <div className="conversion-row-text">
          <span
            className="conversion-row-name"
            title={getTaskNamesTooltip(task) ?? displayName}
          >
            {displayName}
          </span>
          <span className="conversion-row-status">
            <span className="conv-badge conv-badge-download">
              {task.mode === 'individual' ? t('下载') : t('ZIP')}
            </span>
            {statusLabel}
            {isActive && (
              <>
                {task.mode === 'zip'
                  ? ` ${task.completedCount}/${task.totalCount}`
                  : ` ${task.completedCount}/${task.totalCount} ${t('个文件')}`}
              </>
            )}
            {/* 相对时间：与转换 tab 同款弱化样式，提示任务创建时刻 */}
            {task.createdAt && (
              <span
                className="conversion-row-time"
                title={formatDateTime(task.createdAt)}
              >
                {' · '}
                {getRelativeTime(task.createdAt)}
              </span>
            )}
          </span>
        </div>
      </div>
      <div className="conversion-row-actions">
        {isCompleted && (
          <button
            title={task.mode === 'individual' ? t('下载') : t('下载ZIP')}
            onClick={() => onDownload(task)}
          >
            <Download size={13} />
          </button>
        )}
        {isActive && task.status === 'PENDING' && (
          <button title={t('取消')} onClick={() => onCancel(task.taskId)}>
            <XCircle size={13} />
          </button>
        )}
        {task.status === 'FAILED' && (
          <button title={t('重试')} onClick={() => onRetry(task.taskId)}>
            <RefreshCw size={13} />
          </button>
        )}
        {task.status === 'FAILED' &&
          task.errors &&
          task.errors.length > 0 && (
            <button
              title={t('仅重试失败项')}
              onClick={() => onRetryFailed(task.taskId)}
            >
              <RotateCcw size={13} />
            </button>
          )}
      </div>
    </div>
  );
};

/**
 * 下载 Tab 组件
 *
 * 行内仅提供「下载」（完成）/「取消」（排队中）/「重试」（失败）/「仅重试失败项」；
 * 任务记录由后端 cron 自动过期，不提供手动删除 / 清空。
 * 搜索按首个条目名过滤（与转换 tab 的 matchName 同款语义，#476）。
 */
interface DownloadTabProps {
  /** 搜索关键字（过滤下载列表，与转换 tab 搜索框共用） */
  search: string;
  /** 重试失败的批量下载任务（面板持有 hook 回调，与 UploadTab onOpen 同款模式） */
  onRetry: (taskId: string) => void;
  /** 仅重试失败项（后端创建新任务，成功项不重跑） */
  onRetryFailed: (taskId: string) => void;
}

export const DownloadTab: React.FC<DownloadTabProps> = ({
  search,
  onRetry,
  onRetryFailed,
}) => {
  const { tasks: downloadTasks } = useBatchDownloadStore();
  const { downloadAllItems, downloadZip, cancelTask } = useBatchDownload();

  const filteredTasks = downloadTasks.filter((task) => {
    if (!search) return true;
    const q = search.toLowerCase();
    // 匹配全部条目名（多文件任务可搜任意文件名；无条目名时回退显示名）
    const names =
      task.itemNames && task.itemNames.length > 0
        ? task.itemNames
        : [getTaskDisplayName(task)];
    return names.some((name) => name.toLowerCase().includes(q));
  });

  // 轻量 cap（P2-9）：进行中任务恒可见，其余限制初始渲染量，超出部分「加载更多」
  const { visible, hiddenCount, loadMore } = useCappedList(
    filteredTasks,
    search,
    (task) => task.status === 'PENDING' || task.status === 'PROCESSING'
  );

  const handleDownload = (task: BatchTask) => {
    if (task.mode === 'individual') {
      downloadAllItems(task);
    } else {
      downloadZip(task);
    }
  };

  if (downloadTasks.length === 0) {
    return <div className="conversion-empty">{t('暂无下载任务')}</div>;
  }
  if (filteredTasks.length === 0) {
    return <div className="conversion-empty">{t('无匹配结果')}</div>;
  }

  return (
    <>
      {visible.map((task) => (
        <DownloadTaskRow
          key={`dl-${task.taskId}`}
          task={task}
          onDownload={handleDownload}
          onCancel={cancelTask}
          onRetry={onRetry}
          onRetryFailed={onRetryFailed}
        />
      ))}
      {hiddenCount > 0 && (
        <button
          className="conversion-load-more"
          onClick={loadMore}
          title={t('加载更多（剩余 {count} 项）', { count: String(hiddenCount) })}
        >
          {t('加载更多（剩余 {count} 项）', { count: String(hiddenCount) })}
        </button>
      )}
    </>
  );
};
