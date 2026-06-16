///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload,
  File,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  Play,
  Pause,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { Z_LAYERS } from '../../constants/layers';
import { useUploadManager } from '../../hooks/useUploadManager';
import type { UploadTask } from '../../utils/uploadManager';
import './UploadPanel.css';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getStatusLabel(task: UploadTask): string {
  switch (task.status) {
    case 'waiting':
      return '等待中';
    case 'uploading':
      return task.progress >= 100 ? '转换中' : `上传中 ${task.progress.toFixed(0)}%`;
    case 'processing':
      return '转换中';
    case 'done':
      return '完成';
    case 'failed':
      return '失败';
    case 'paused':
      return '已暂停';
    case 'cancelled':
      return '已取消';
    default:
      return '';
  }
}

function getStatusClass(task: UploadTask): string {
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

function TaskIcon({ task }: { task: UploadTask }) {
  switch (task.status) {
    case 'waiting':
      return <Clock size={14} />;
    case 'uploading':
      return <Upload size={14} />;
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

// ==================== UploadPanel ====================

export function UploadPanel() {
  const {
    tasks,
    stats,
    pauseTask,
    resumeTask,
    removeTask,
    retryTask,
    pauseAll,
    resumeAll,
    clearCompleted,
  } = useUploadManager({ maxConcurrent: 3 });

  const [expanded, setExpanded] = useState(false);
  const prevTotalRef = useRef(0);

  // Auto-expand when new files added
  useEffect(() => {
    if (stats.total > prevTotalRef.current && stats.total > 0) {
      setExpanded(true);
    }
    prevTotalRef.current = stats.total;
  }, [stats.total]);

  // Auto-collapse when all done (after delay)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (expanded && stats.done + stats.failed === stats.total && stats.total > 0) {
      timeout = setTimeout(() => setExpanded(false), 3000);
    }
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [expanded, stats.done, stats.failed, stats.total]);

  const hasActive = stats.uploading + stats.waiting + stats.paused > 0;

  if (stats.total === 0) return null;

  const activeCount = stats.uploading + stats.waiting;

  return createPortal(
    <div className="upload-panel-portal" style={{ zIndex: Z_LAYERS.UPLOAD_PANEL }}>
      {expanded ? (
        <div className="upload-panel">
          {/* Header */}
          <div className="upload-panel-header">
            <span className="upload-panel-title">
              <Upload size={14} />
              上传队列
              {activeCount > 0 && (
                <span className="count-badge">{activeCount}</span>
              )}
            </span>
            <div className="upload-panel-actions">
              {hasActive && (
                <button
                  title="全部暂停"
                  onClick={pauseAll}
                >
                  <Pause size={14} />
                </button>
              )}
              {stats.paused > 0 && (
                <button
                  title="全部恢复"
                  onClick={resumeAll}
                >
                  <Play size={14} />
                </button>
              )}
              <button
                title="收起"
                onClick={() => setExpanded(false)}
              >
                <ChevronDown size={14} />
              </button>
            </div>
          </div>

          {/* Task List */}
          <div className="upload-panel-body">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onPause={pauseTask}
                onResume={resumeTask}
                onRemove={removeTask}
                onRetry={retryTask}
              />
            ))}
            {tasks.length === 0 && <></>}
          </div>

          {/* Footer */}
          <div className="upload-panel-footer">
            <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
              完成 {stats.done}/{stats.total}
              {stats.failed > 0 && ` · 失败 ${stats.failed}`}
            </span>
            {(stats.done > 0 || stats.failed > 0) && (
              <button onClick={clearCompleted}>清除已完成</button>
            )}
          </div>
        </div>
      ) : (
        <div
          className="upload-panel-collapsed"
          onClick={() => setExpanded(true)}
          title="展开上传队列"
        >
          {hasActive ? (
            <Upload size={18} style={{ color: 'var(--info)' }} />
          ) : (
            <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
          )}
          {activeCount > 0 && <span className="badge">{activeCount}</span>}
        </div>
      )}
    </div>,
    document.body
  );
}

// ==================== TaskRow ====================

interface TaskRowProps {
  task: UploadTask;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

function TaskRow({ task, onPause, onResume, onRemove, onRetry }: TaskRowProps) {
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
        <TaskIcon task={task} />
      </div>

      <div className="upload-task-info">
        <span className="upload-task-name" title={task.fileName}>
          {task.fileName}
        </span>
        <span className="upload-task-size">{formatFileSize(task.fileSize)}</span>
        {showProgress && (
          <div className="upload-task-progress">
            <div
              className={`upload-task-progress-bar ${progressBarClass}`}
              style={{ width: `${task.progress}%` }}
            />
          </div>
        )}
        {task.error && (
          <span
            className="upload-task-status failed"
            title={task.error}
          >
            {task.error.length > 40 ? task.error.slice(0, 40) + '...' : task.error}
          </span>
        )}
      </div>

      <span className={`upload-task-status ${getStatusClass(task)}`}>
        {getStatusLabel(task)}
      </span>

      <div className="upload-task-actions">
        {task.status === 'waiting' && (
          <>
            <button
              title="暂停"
              onClick={(e) => {
                e.stopPropagation();
                onPause(task.id);
              }}
            >
              <Pause size={12} />
            </button>
            <button
              className="remove"
              title="删除"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(task.id);
              }}
            >
              <X size={12} />
            </button>
          </>
        )}
        {task.status === 'paused' && (
          <>
            <button
              title="继续"
              onClick={(e) => {
                e.stopPropagation();
                onResume(task.id);
              }}
            >
              <Play size={12} />
            </button>
            <button
              className="remove"
              title="删除"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(task.id);
              }}
            >
              <X size={12} />
            </button>
          </>
        )}
        {task.status === 'uploading' && (
          <button
            className="remove"
            title="取消上传"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(task.id);
            }}
          >
            <X size={12} />
          </button>
        )}
        {(task.status === 'done' || task.status === 'failed') && (
          <button
            className="remove"
            title="从列表移除"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(task.id);
            }}
          >
            <X size={12} />
          </button>
        )}
        {task.status === 'failed' && (
          <button
            className="retry"
            title="重试"
            onClick={(e) => {
              e.stopPropagation();
              onRetry(task.id);
            }}
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

export default UploadPanel;
