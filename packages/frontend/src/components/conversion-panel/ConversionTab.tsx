import React from 'react';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  X,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { t } from '@/languages';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatDateTime, getRelativeTime } from '@/utils/dateUtils';
import type {
  ConversionTask,
  ConversionTaskStatus,
} from '@/stores/conversionQueueStore';

/**
 * 转换任务状态元信息（标签 + 图标 + 行类名）
 */
const STATUS_META: Record<
  ConversionTaskStatus,
  { label: string; icon: React.ReactNode; className: string }
> = {
  pending: {
    label: t('排队中'),
    icon: <Loader2 size={14} className="conv-icon" />,
    className: 'pending',
  },
  processing: {
    label: t('转换中'),
    icon: <Loader2 size={14} className="conv-icon spin" />,
    className: 'processing',
  },
  completed: {
    label: t('完成'),
    icon: <CheckCircle2 size={14} className="conv-icon" />,
    className: 'completed',
  },
  failed: {
    label: t('转换失败'),
    icon: <AlertCircle size={14} className="conv-icon" />,
    className: 'failed',
  },
  cancelled: {
    label: t('已取消'),
    icon: <XCircle size={14} className="conv-icon" />,
    className: 'cancelled',
  },
};

/**
 * 转换 Tab 组件
 *
 * 云端 + 本地结合列表：live 任务（active + failed + 本地）在前，云端已完成历史在后（分页滚动加载）。
 * 行内提供「打开」（完成且关联节点）、「取消」（排队中的云端任务）与「重试」（失败的云端任务）：
 * 本地记录是临时日志（自动过期），云端记录是文件本身（从文件浏览器管理），均不提供删除。
 */
interface ConversionTabProps {
  filteredTasks: ConversionTask[];
  filteredHistory: ConversionTask[];
  /** 搜索关键字：有搜索词且过滤后无行时显示「无匹配结果」而非「暂无转换任务」 */
  search: string;
  onOpen: (task: ConversionTask) => void;
  onCancel: (task: ConversionTask) => void;
  /** 重试失败的转换（原地重新排队，不重新上传、不占配额、无次数上限） */
  onRetry: (task: ConversionTask) => void;
  historyLoading: boolean;
  historyHasMore: boolean;
  historyCount: number;
}

export const ConversionTab: React.FC<ConversionTabProps> = ({
  filteredTasks,
  filteredHistory,
  search,
  onOpen,
  onCancel,
  onRetry,
  historyLoading,
  historyHasMore,
  historyCount,
}) => {
  return (
    <>
      {/* 空态按本 tab 自身行数判断（与下载/上传 tab 同款语义，不受其他 tab 任务数影响）；
          搜索过滤掉全部行时显示「无匹配结果」 */}
      {filteredTasks.length === 0 && filteredHistory.length === 0 && (
        <div className="conversion-empty">
          {search ? t('无匹配结果') : t('暂无转换任务')}
        </div>
      )}
      {filteredTasks.map((task) => {
        const meta = STATUS_META[task.status];
        const canCancel =
          task.status === 'pending' &&
          task.source === 'cloud' &&
          !!task.taskId;
        const canOpen = task.status === 'completed' && !!task.nodeId;
        // 内容性永久失败（content-error）：同一输入重试注定再失败，不提供重试入口；
        // 其余失败（环境性可重试）才显示重试。失败性质由后端结构化下发（errorCategory）。
        const isContentError = task.errorCategory === 'content-error';
        const canRetry =
          !isContentError &&
          task.status === 'failed' &&
          task.source === 'cloud' &&
          !!task.taskId;
        return (
          <div key={task.id} className={`conversion-row ${meta.className}`}>
            <div className="conversion-row-main">
              {meta.icon}
              <div className="conversion-row-text">
                <span className="conversion-row-name" title={task.name}>
                  {task.name}
                </span>
                <span
                  className={`conversion-row-status ${meta.className}`}
                  title={
                    isContentError
                      ? t('该文件转换失败，请检查文件内容')
                      : undefined
                  }
                >
                  {meta.label}
                  {task.status === 'processing' &&
                    typeof task.progress === 'number' &&
                    ` ${Math.round(task.progress)}%`}
                  {/* S6-5：排队中任务显示排队位置（「第 N 位」），仅 queuePosition 有意义时 */}
                  {task.status === 'pending' &&
                    typeof task.queuePosition === 'number' &&
                    ` ${t('第 {n} 位', { n: task.queuePosition })}`}
                  {task.source === 'local' && ` · ${t('本地')}`}
                  {/* 相对时间：让用户判断记录新鲜度（进行中=已耗时，历史=转换时刻） */}
                  <span
                    className="conversion-row-time"
                    title={formatDateTime(task.createdAt)}
                  >
                    {' · '}
                    {getRelativeTime(task.createdAt)}
                  </span>
                </span>
              </div>
            </div>
            <div className="conversion-row-actions">
              {canCancel && (
                <Tooltip content={t('取消')}>
                  <button aria-label={t('取消')} onClick={() => onCancel(task)}>
                    <X size={13} />
                  </button>
                </Tooltip>
              )}
              {canRetry && (
                <Tooltip content={t('重试转换')}>
                  <button
                    aria-label={t('重试转换')}
                    onClick={() => onRetry(task)}
                  >
                    <RotateCcw size={13} />
                  </button>
                </Tooltip>
              )}
              {canOpen && (
                <Tooltip content={t('打开')}>
                  <button aria-label={t('打开')} onClick={() => onOpen(task)}>
                    <ExternalLink size={13} />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        );
      })}
      {/* 有 live 任务且有历史时，插入「历史记录」分隔条，帮助用户区分当前任务与历史 */}
      {filteredTasks.length > 0 && filteredHistory.length > 0 && (
        <div className="conversion-divider">
          <span>{t('历史记录')}</span>
        </div>
      )}
      {filteredHistory.map((task) => {
        const meta = STATUS_META[task.status];
        const canOpen = task.status === 'completed' && !!task.nodeId;
        return (
          <div
            key={`history-${task.id}`}
            className={`conversion-row ${meta.className}`}
          >
            <div className="conversion-row-main">
              {meta.icon}
              <div className="conversion-row-text">
                <span className="conversion-row-name" title={task.name}>
                  {task.name}
                </span>
                <span className={`conversion-row-status ${meta.className}`}>
                  {meta.label}
                  {task.source === 'local' && ` · ${t('本地')}`}
                  {/* 相对时间：历史列表核心上下文（何时转换），弱化样式提示转换时刻 */}
                  <span
                    className="conversion-row-time"
                    title={formatDateTime(task.createdAt)}
                  >
                    {' · '}
                    {getRelativeTime(task.createdAt)}
                  </span>
                </span>
              </div>
            </div>
            <div className="conversion-row-actions">
              {canOpen && (
                <Tooltip content={t('打开')}>
                  <button aria-label={t('打开')} onClick={() => onOpen(task)}>
                    <ExternalLink size={13} />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        );
      })}

      {/* 滚动加载更多 / 加载状态（#476） */}
      {historyLoading ? (
        <div className="conversion-loadmore">
          <Loader2 size={13} className="conv-icon spin" />
          {t('加载中...')}
        </div>
      ) : historyHasMore && filteredHistory.length > 0 ? (
        <div className="conversion-loadmore">{t('加载更多...')}</div>
      ) : !historyHasMore && historyCount > 0 ? (
        <div className="conversion-loadmore">{t('没有更多')}</div>
      ) : null}
    </>
  );
};
