import React from 'react';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Upload,
  File,
  Clock,
  Play,
  Pause,
  RefreshCw,
  X,
  ExternalLink,
} from 'lucide-react';
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
  onRequeueFile: (taskId: string) => void;
  /** 完成态「打开」：上传结果带 nodeId 时打开 CAD 编辑器 */
  onOpen: (task: UploadTask) => void;
}

function UploadRow({
  task,
  onPause,
  onResume,
  onRemove,
  onRetry,
  onRequeueFile,
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
          <button
            title={t('暂停')}
            onClick={(e) => {
              e.stopPropagation();
              onPause(task.id);
            }}
          >
            <Pause size={12} />
          </button>
        )}
        {task.status === 'uploading' && (
          <button
            className="remove"
            title={t('取消上传')}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(task.id);
            }}
          >
            <X size={12} />
          </button>
        )}
        {task.status === 'paused' && (
          <button
            title={t('恢复')}
            onClick={(e) => {
              e.stopPropagation();
              onResume(task.id);
            }}
          >
            <Play size={12} />
          </button>
        )}
        {/* 完成态「打开」：上传结果带 nodeId（转换产物）→ 新标签页打开 CAD 编辑器 */}
        {task.status === 'done' && task.result?.nodeId && (
          <button
            title={t('打开')}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(task);
            }}
          >
            <ExternalLink size={12} />
          </button>
        )}
        {/* 有 File 对象的失败任务可直接重试；从历史恢复的失败任务无 File 对象，须先重新选择文件 */}
        {task.status === 'failed' &&
          (task.file ? (
            <button
              className="retry"
              title={t('重试')}
              onClick={(e) => {
                e.stopPropagation();
                onRetry(task.id);
              }}
            >
              <RefreshCw size={12} />
            </button>
          ) : (
            <button
              className="retry"
              title={t('重新选择文件')}
              onClick={(e) => {
                e.stopPropagation();
                onRequeueFile(task.id);
              }}
            >
              <File size={12} />
            </button>
          ))}
      </div>
    </div>
  );
}

/**
 * 上传 Tab 组件
 *
 * 常显：无任务时显示空态；历史任务（done/failed）由 UploadManager 从
 * localStorage 恢复，刷新后仍可见。
 * 行内仅提供「暂停/恢复/取消上传/打开/重试/重新选择文件」等活体操作；
 * 完成/失败记录为临时日志（localStorage 上限 50 条，超出挤掉最旧），不提供删除 / 清空。
 */
interface UploadTabProps {
  uploadActiveCount: number;
  search: string;
  /** 完成态「打开」：上传结果带 nodeId 时打开 CAD 编辑器 */
  onOpen: (task: UploadTask) => void;
}

export const UploadTab: React.FC<UploadTabProps> = ({
  uploadActiveCount,
  search,
  onOpen,
}) => {
  const {
    tasks: uploadTasks,
    stats: uploadStats,
    pauseTask: pauseUpload,
    resumeTask: resumeUpload,
    removeTask: removeUpload,
    retryTask: retryUpload,
    requeueTask: requeueUpload,
    pauseAll: pauseAllUpload,
    resumeAll: resumeAllUpload,
  } = useUploadManager({ maxConcurrent: 3 });

  // 从历史恢复的失败任务无 File 对象：点「重新选择文件」后由此隐藏 input 取新文件重新入队
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const pendingRequeueIdRef = React.useRef<string | null>(null);

  const handleRequeueFile = (taskId: string) => {
    pendingRequeueIdRef.current = taskId;
    fileInputRef.current?.click();
  };

  const handleRequeueFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    const taskId = pendingRequeueIdRef.current;
    pendingRequeueIdRef.current = null;
    e.target.value = '';
    if (file && taskId) requeueUpload(taskId, file);
  };

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
      <div className="conversion-section-header">
        <span className="conversion-section-title">
          <Upload size={13} />
          {t('上传')}
          {uploadActiveCount > 0 && (
            <span className="conv-badge">{uploadActiveCount}</span>
          )}
        </span>
        <div className="conversion-section-actions">
          {uploadStats.uploading + uploadStats.waiting > 0 && (
            <button title={t('全部暂停')} onClick={pauseAllUpload}>
              <Pause size={13} />
            </button>
          )}
          {uploadStats.paused > 0 && (
            <button title={t('全部恢复')} onClick={resumeAllUpload}>
              <Play size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="upload-task-list">
        {visible.map((task) => (
          <UploadRow
            key={task.id}
            task={task}
            onPause={pauseUpload}
            onResume={resumeUpload}
            onRemove={removeUpload}
            onRetry={retryUpload}
            onRequeueFile={handleRequeueFile}
            onOpen={onOpen}
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
      </div>
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleRequeueFileChange}
      />
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
