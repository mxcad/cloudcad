import React from 'react';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  File,
  Clock,
  Play,
  Pause,
  RefreshCw,
  X,
  ExternalLink,
} from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { t } from '@/languages';
import { useUploadManager } from '@/hooks/useUploadManager';
import type { UploadTask } from '@/utils/uploadManager';
import { formatFileSize } from '@/components/ui/FileSize';
import { useCappedList } from './useCappedList';

/**
 * 上传任务状态标签
 */
function getUploadStatusLabel(task: UploadTask): string {
  switch (task.status) {
    case 'waiting':
      return t('等待中');
    case 'uploading':
      return task.progress >= 100
        ? t('转换中')
        : t('上传中 ' + task.progress.toFixed(0) + '%');
    case 'processing':
      return t('转换中');
    case 'done':
      return t('完成');
    case 'failed':
      return t('失败');
    case 'paused':
      return t('已暂停');
    case 'cancelled':
      return t('已取消');
    default:
      return '';
  }
}

/**
 * 上传任务状态类名
 */
function getUploadStatusClass(task: UploadTask): string {
  switch (task.status) {
    case 'done':
      return 'done';
    case 'failed':
    case 'cancelled':
      return 'failed';
    case 'paused':
      return 'paused';
    default:
      return '';
  }
}

/**
 * 上传任务状态图标
 */
function UploadTaskIcon({ task }: { task: UploadTask }) {
  switch (task.status) {
    case 'waiting':
      return <Clock size={14} />;
    case 'uploading':
      return <Loader2 size={14} />;
    case 'processing':
      return <Loader2 size={14} />;
    case 'done':
      return <CheckCircle2 size={14} />;
    case 'failed':
    case 'cancelled':
      return <AlertCircle size={14} />;
    case 'paused':
      return <Pause size={14} />;
    default:
      return <File size={14} />;
  }
}

/**
 * 上传任务行组件
 */
interface UploadRowProps {
  task: UploadTask;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  /** 取消进行中的上传（waiting/uploading/paused） */
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  /** 完成态「打开」：上传结果带 nodeId 时打开 CAD 编辑器 */
  onOpen: (task: UploadTask) => void;
}

function UploadRow({
  task,
  onPause,
  onResume,
  onRemove,
  onRetry,
  onOpen,
}: UploadRowProps) {
  const progressBarClass =
    task.status === 'processing'
      ? 'processing'
      : task.status === 'done'
        ? 'done'
        : task.status === 'failed' || task.status === 'cancelled'
          ? 'failed'
          : task.status === 'paused'
            ? 'paused'
            : 'uploading';

  const showProgress =
    task.status === 'uploading' ||
    task.status === 'processing' ||
    (task.status === 'done' && task.progress >= 100) ||
    (task.status === 'failed' && task.progress > 0) ||
    (task.status === 'paused' && task.progress > 0);

  return (
    <div className="upload-task-item">
      <div className={`upload-task-icon ${task.status}`}>
        <UploadTaskIcon task={task} />
      </div>

      <div className="upload-task-info">
        <span className="upload-task-name" title={task.fileName}>
          {task.fileName}
        </span>
        <span className="upload-task-size">
          {formatFileSize(task.fileSize)}
        </span>
        {showProgress && (
          <div className="upload-task-progress">
            <div
              className={`upload-task-progress-bar ${progressBarClass}`}
              style={{ width: `${task.progress}%` }}
            />
          </div>
        )}
        {task.error && (
          <span className="upload-task-status failed" title={task.error}>
            {task.error.length > 40
              ? task.error.slice(0, 40) + '...'
              : task.error}
          </span>
        )}
      </div>

      <span className={`upload-task-status ${getUploadStatusClass(task)}`}>
        {getUploadStatusLabel(task)}
      </span>

      <div className="upload-task-actions">
        {task.status === 'waiting' && (
          <Tooltip content={t('暂停')}>
            <button
              aria-label={t('暂停')}
              onClick={(e) => {
                e.stopPropagation();
                onPause(task.id);
              }}
            >
              <Pause size={12} />
            </button>
          </Tooltip>
        )}
        {task.status === 'uploading' && (
          <Tooltip content={t('取消上传')}>
            <button
              className="remove"
              aria-label={t('取消上传')}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(task.id);
              }}
            >
              <X size={12} />
            </button>
          </Tooltip>
        )}
        {task.status === 'paused' && (
          <Tooltip content={t('恢复')}>
            <button
              aria-label={t('恢复')}
              onClick={(e) => {
                e.stopPropagation();
                onResume(task.id);
              }}
            >
              <Play size={12} />
            </button>
          </Tooltip>
        )}
        {/* 完成态「打开」：上传结果带 nodeId（转换产物）→ 新标签页打开 CAD 编辑器 */}
        {task.status === 'done' && task.result?.nodeId && (
          <Tooltip content={t('打开')}>
            <button
              aria-label={t('打开')}
              onClick={(e) => {
                e.stopPropagation();
                onOpen(task);
              }}
            >
              <ExternalLink size={12} />
            </button>
          </Tooltip>
        )}
        {/* 失败任务仅在有 File 对象时可重试；从历史恢复的失败任务无 File 对象，不提供重试入口 */}
        {task.status === 'failed' && task.file && (
          <Tooltip content={t('重试')}>
            <button
              className="retry"
              aria-label={t('重试')}
              onClick={(e) => {
                e.stopPropagation();
                onRetry(task.id);
              }}
            >
              <RefreshCw size={12} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/**
 * 上传 Tab 组件
 *
 * 常显：无任务时显示空态；历史任务（done/failed）由 UploadManager 从
 * localStorage 恢复，刷新后仍可见。
 * 行内仅提供「暂停/恢复/取消上传/打开/重试」等活体操作；
 * 完成/失败记录为临时日志（localStorage 上限 50 条，超出挤掉最旧），不提供删除 / 清空。
 * 区块自身不渲染「上传」标题栏：面板 tab 已标注当前分区，再渲一次标题是重复信息。
 */
interface UploadTabProps {
  search: string;
  /** 完成态「打开」：上传结果带 nodeId 时打开 CAD 编辑器 */
  onOpen: (task: UploadTask) => void;
}

export const UploadTab: React.FC<UploadTabProps> = ({ search, onOpen }) => {
  const {
    tasks: uploadTasks,
    stats: uploadStats,
    pauseTask: pauseUpload,
    resumeTask: resumeUpload,
    removeTask: removeUpload,
    retryTask: retryUpload,
  } = useUploadManager({ maxConcurrent: 3 });

  const filteredTasks = uploadTasks.filter((task) => {
    if (!search) return true;
    return task.fileName.toLowerCase().includes(search.toLowerCase());
  });

  // 轻量 cap（P2-9）：进行中/暂停任务恒可见（需可继续操作），其余限制初始渲染量
  const { visible, hiddenCount, loadMore } = useCappedList(
    filteredTasks,
    search,
    (task) =>
      task.status === 'waiting' ||
      task.status === 'uploading' ||
      task.status === 'processing' ||
      task.status === 'paused'
  );

  if (uploadTasks.length === 0) {
    return (
      <div className="conversion-upload-section">
        <div className="conversion-empty">{t('暂无上传任务')}</div>
      </div>
    );
  }

  if (filteredTasks.length === 0) {
    return (
      <div className="conversion-upload-section">
        <div className="conversion-empty">{t('无匹配结果')}</div>
      </div>
    );
  }

  return (
    <div className="conversion-upload-section">
      <div className="upload-task-list">
        {visible.map((task) => (
          <UploadRow
            key={task.id}
            task={task}
            onPause={pauseUpload}
            onResume={resumeUpload}
            onRemove={removeUpload}
            onRetry={retryUpload}
            onOpen={onOpen}
          />
        ))}
        {hiddenCount > 0 && (
          <button className="conversion-load-more" onClick={loadMore}>
            {t('加载更多（剩余 {count} 项）', { count: String(hiddenCount) })}
          </button>
        )}
      </div>
      <div className="conversion-upload-footer">
        <span className="conversion-upload-summary">
          {t('完成 {done}/{total}', {
            done: String(uploadStats.done),
            total: String(uploadStats.total),
          })}
          {uploadStats.failed > 0 &&
            t(' · 失败 {count}', { count: String(uploadStats.failed) })}
        </span>
      </div>
    </div>
  );
};
