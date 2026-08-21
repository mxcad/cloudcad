import React, {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeftRight,
  Copy,
  Crown,
  ExternalLink,
  FileEdit,
  FilePlus,
  FolderOpen,
  FolderPlus,
  FolderX,
  History,
  Loader2,
  MapPin,
  MoveRight,
  PenLine,
  RefreshCw,
  RotateCcw,
  Settings2,
  Share2,
  Shield,
  ShieldPlus,
  ShieldX,
  Trash2,
  UserCog,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import {
  memberControllerGetProjectMembers,
  nodeControllerGetParentContext,
  projectAuditLogControllerFindByProject,
} from '@/api-sdk';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { queryKeys } from '@/lib/queryKeys';
import { AuditAction } from '@/pages/AuditLogPage/types';
import {
  formatDate,
  getActionDisplayName,
} from '@/pages/AuditLogPage/constants';
import {
  getActionDetail,
  type AuditLog,
} from '@/utils/auditActionTemplates';

interface OperationHistoryModalProps {
  isOpen: boolean;
  projectId: string;
  /** 项目名称（弹窗标题展示） */
  projectName?: string;
  onClose: () => void;
}

const PAGE_SIZE = 20;

/** 项目操作历史筛选动作子集（与后端埋点动作对齐，label 复用 AuditLogPage 动作清单） */
const PROJECT_AUDIT_ACTION_VALUES = [
  AuditAction.FILE_CREATE,
  AuditAction.FILE_UPDATE,
  AuditAction.FILE_DELETE,
  AuditAction.FILE_SHARE,
  AuditAction.FOLDER_CREATE,
  AuditAction.NODE_RENAME,
  AuditAction.NODE_MOVE,
  AuditAction.NODE_COPY,
  AuditAction.NODE_RESTORE,
  AuditAction.ADD_MEMBER,
  AuditAction.UPDATE_MEMBER,
  AuditAction.REMOVE_MEMBER,
  AuditAction.TRANSFER_OWNERSHIP,
  AuditAction.PROJECT_CREATE,
  AuditAction.PROJECT_UPDATE,
  AuditAction.PROJECT_DELETE,
  AuditAction.PROJECT_TRANSFER,
  AuditAction.ROLE_CREATE,
  AuditAction.ROLE_UPDATE,
  AuditAction.ROLE_DELETE,
];

/** 可定位到图纸/文件夹的动作（resourceId 即存在的 fileSystemNode.id，可在文件管理器中定位）。
 * 不含 FILE_DELETE：节点已删除，定位必然 404。 */
const LOCATABLE_ACTIONS: ReadonlySet<string> = new Set([
  AuditAction.FILE_CREATE,
  AuditAction.FILE_UPDATE,
  AuditAction.FILE_SHARE,
  AuditAction.FOLDER_CREATE,
  AuditAction.NODE_RENAME,
  AuditAction.NODE_MOVE,
  AuditAction.NODE_COPY,
  AuditAction.NODE_RESTORE,
]);

/** 可直接打开图纸的动作（resourceId 即 fileSystemNode.id） */
const FILE_ACTIONS: ReadonlySet<string> = new Set([
  AuditAction.FILE_CREATE,
  AuditAction.FILE_UPDATE,
  AuditAction.FILE_SHARE,
]);

/** 项目类动作：点击打开项目根目录（PROJECT_DELETE 后项目已不存在，不可打开） */
const PROJECT_OPEN_ACTIONS: ReadonlySet<string> = new Set([
  AuditAction.PROJECT_CREATE,
  AuditAction.PROJECT_UPDATE,
  AuditAction.TRANSFER_OWNERSHIP,
]);

/** 筛选下拉选项（label 与管理员审计页动作清单同源，避免双处维护） */
const PROJECT_AUDIT_ACTIONS = PROJECT_AUDIT_ACTION_VALUES.map((value) => ({
  value,
  label: getActionDisplayName(value),
}));

/** 动作图标与着色（视觉分类：新增=绿 / 修改=蓝 / 删除=红 / 分享=紫 / 成员=黄 / 项目/角色=靛） */
const ACTION_ICON: Record<
  string,
  { icon: React.ElementType; colorClass: string }
> = {
  FILE_CREATE: { icon: FilePlus, colorClass: 'text-[var(--success)]' },
  FILE_UPDATE: { icon: FileEdit, colorClass: 'text-[var(--info)]' },
  FILE_DELETE: { icon: Trash2, colorClass: 'text-[var(--error)]' },
  FILE_SHARE: { icon: Share2, colorClass: 'text-[var(--primary-600)]' },
  FOLDER_CREATE: { icon: FolderPlus, colorClass: 'text-[var(--success)]' },
  NODE_RENAME: { icon: PenLine, colorClass: 'text-[var(--info)]' },
  NODE_MOVE: { icon: MoveRight, colorClass: 'text-[var(--warning)]' },
  NODE_COPY: { icon: Copy, colorClass: 'text-[var(--primary-600)]' },
  NODE_RESTORE: { icon: RotateCcw, colorClass: 'text-[var(--success)]' },
  ADD_MEMBER: { icon: UserPlus, colorClass: 'text-[var(--warning)]' },
  UPDATE_MEMBER: { icon: UserCog, colorClass: 'text-[var(--warning)]' },
  REMOVE_MEMBER: { icon: UserMinus, colorClass: 'text-[var(--error)]' },
  TRANSFER_OWNERSHIP: { icon: Crown, colorClass: 'text-[var(--primary-600)]' },
  PROJECT_CREATE: { icon: FolderPlus, colorClass: 'text-[var(--primary-600)]' },
  PROJECT_UPDATE: { icon: Settings2, colorClass: 'text-[var(--info)]' },
  PROJECT_DELETE: { icon: FolderX, colorClass: 'text-[var(--error)]' },
  PROJECT_TRANSFER: {
    icon: ArrowLeftRight,
    colorClass: 'text-[var(--primary-600)]',
  },
  ROLE_CREATE: { icon: ShieldPlus, colorClass: 'text-[var(--success)]' },
  ROLE_UPDATE: { icon: Shield, colorClass: 'text-[var(--info)]' },
  ROLE_DELETE: { icon: ShieldX, colorClass: 'text-[var(--error)]' },
};
const getActionIcon = (action: string) =>
  ACTION_ICON[action] ?? { icon: History, colorClass: 'text-[var(--text-secondary)]' };

/** 时间分组：今天 / 昨天 / 更早 */
type TimeGroup = 'today' | 'yesterday' | 'earlier';
const TIME_GROUP_ORDER: TimeGroup[] = ['today', 'yesterday', 'earlier'];
const TIME_GROUP_LABEL: Record<TimeGroup, string> = {
  today: t('今天'),
  yesterday: t('昨天'),
  earlier: t('更早'),
};

function groupByTime(logs: AuditLog[]): Record<TimeGroup, AuditLog[]> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(todayStart.getDate() - 1);
  return logs.reduce<Record<TimeGroup, AuditLog[]>>(
    (acc, log) => {
      const date = new Date(log.createdAt);
      const key: TimeGroup =
        date >= todayStart
          ? 'today'
          : date >= yesterdayStart
            ? 'yesterday'
            : 'earlier';
      acc[key].push(log);
      return acc;
    },
    { today: [], yesterday: [], earlier: [] }
  );
}

/** 操作者显示名（优先昵称，其次用户名，最后 email） */
function actorDisplayName(log: AuditLog): string {
  return log.user?.nickname || log.user?.username || log.user?.email || '-';
}

export const OperationHistoryModal: React.FC<OperationHistoryModalProps> = ({
  isOpen,
  projectId,
  projectName,
  onClose,
}) => {
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [action, setAction] = useState('');
  const [memberId, setMemberId] = useState('');
  const [search, setSearch] = useState('');
  // 搜索防抖：输入不暂停请求不发出（useDeferredValue 延迟 queryKey 联动）
  const deferredSearch = useDeferredValue(search);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPage(1);
  }, [projectId]);

  /** 任一筛选变化时回到第一页并滚回顶部 */
  const handleFilterChange =
    (setter: (v: string) => void) => (value: string) => {
      setter(value);
      setPage(1);
      listRef.current?.scrollTo({ top: 0 });
    };
  const handleStartDateChange = handleFilterChange(setStartDate);
  const handleEndDateChange = handleFilterChange(setEndDate);
  const handleActionChange = handleFilterChange(setAction);
  const handleMemberChange = handleFilterChange(setMemberId);
  const handleResetFilter = () => {
    setStartDate('');
    setEndDate('');
    setAction('');
    setMemberId('');
    setSearch('');
    setPage(1);
    listRef.current?.scrollTo({ top: 0 });
  };

  // 项目成员列表（操作人筛选数据源）
  const {
    data: members = [],
    isLoading: membersLoading,
  } = useQuery({
    queryKey: ['projectMembers', projectId],
    queryFn: async () => {
      const result = await memberControllerGetProjectMembers({
        path: { projectId },
      });
      if (result.error) throw result.error;
      const raw = (result.data ?? []) as Array<{
        id: string;
        nickname?: string | null;
        username?: string;
        email?: string;
      }>;
      return raw;
    },
    enabled: isOpen && !!projectId,
  });

  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        value: m.id,
        label: m.nickname || m.username || m.email || m.id,
      })),
    [members]
  );

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: queryKeys.auditLog.project(projectId, page, {
      startDate,
      endDate,
      ...(action ? { action } : {}),
      ...(memberId ? { userId: memberId } : {}),
      ...(deferredSearch.trim() ? { search: deferredSearch.trim() } : {}),
    }),
    queryFn: async () => {
      const result = await projectAuditLogControllerFindByProject({
        path: { projectId },
        query: {
          page: String(page),
          limit: String(PAGE_SIZE),
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
          ...(action ? { action } : {}),
          ...(memberId ? { userId: memberId } : {}),
          ...(deferredSearch.trim() ? { search: deferredSearch.trim() } : {}),
        },
      });
      if (result.error) throw result.error;
      const raw = (result.data ?? {}) as {
        logs?: AuditLog[];
        total?: number;
      };
      return { logs: raw.logs ?? [], total: raw.total ?? 0 };
    },
    enabled: isOpen && !!projectId,
    placeholderData: (prev) => prev,
  });

  /**
   * 打开节点所在位置（新标签页）：查父目录页码后跳转文件管理器并高亮定位该节点
   * （复用搜索结果"打开所在位置"的 highlight 机制）。失败兜底打开项目根目录。
   */
  const handleOpenLocation = async (log: AuditLog) => {
    if (!log.resourceId || !log.projectId) return;
    try {
      const result = await nodeControllerGetParentContext({
        path: { nodeId: log.resourceId },
        query: { pageSize: 30 },
      });
      if (result.error || !result.data) throw new Error('parent-context 失败');
      const ctx = result.data as { parentId?: string; pageNumber?: number };
      if (!ctx.parentId) throw new Error('parent-context 无父目录');
      window.open(
        `/projects/${log.projectId}/files/${ctx.parentId}?highlight=${log.resourceId}&page=${ctx.pageNumber ?? 1}`,
        '_blank',
        'noopener'
      );
    } catch {
      window.open(`/projects/${log.projectId}/files`, '_blank', 'noopener');
    }
  };

  /** 打开项目根目录（新标签页） */
  const handleOpenProject = (log: AuditLog) => {
    if (!log.projectId) return;
    window.open(`/projects/${log.projectId}/files`, '_blank', 'noopener');
  };

  /** 打开图纸（新标签页）：/cad-editor/:fileId 路由 */
  const handleOpenDrawing = (log: AuditLog) => {
    const url = `/cad-editor/${log.resourceId}?nodeId=${log.projectId ?? ''}`;
    window.open(url, '_blank', 'noopener');
  };

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const grouped = useMemo(() => groupByTime(logs), [logs]);
  const hasAnyLogs = logs.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2 min-w-0">
          <History className="w-4 h-4 shrink-0" />
          <span className="truncate">
            {projectName ? `${projectName} · ${t('操作历史')}` : t('操作历史')}
          </span>
        </span>
      }
      size="lg"
    >
      <div className="flex flex-col gap-3 min-h-[360px] max-h-[62vh]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-[var(--text-secondary)] truncate">
            {t('项目动态：成员变更、文件操作与分享记录')}
          </span>
          <span className="text-xs text-[var(--text-tertiary)] shrink-0">
            {t('共 {count} 条记录', { count: String(total) })}
          </span>
        </div>

        {/* 筛选区：两行紧凑布局 */}
        <div
          className="flex flex-col gap-2 rounded-lg border border-[var(--border-default)] p-2.5"
          data-tour="operation-history-filter"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <Select
                size="sm"
                value={action}
                onChange={handleActionChange}
                options={PROJECT_AUDIT_ACTIONS}
                placeholder={t('全部')}
                clearable
              />
            </div>
            <div className="w-40">
              <Select
                size="sm"
                value={memberId}
                onChange={handleMemberChange}
                options={memberOptions}
                placeholder={t('全部成员')}
                clearable
                searchable
                loading={membersLoading}
              />
            </div>
            <div className="min-w-[180px] flex-1 max-w-[260px]">
              <Input
                size="sm"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={t('搜索图纸名称')}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-36">
              <DatePicker
                size="sm"
                value={startDate ? `${startDate}T00:00:00` : undefined}
                onChange={(v) => handleStartDateChange(v ? v.slice(0, 10) : '')}
                placeholder={t('开始日期')}
              />
            </div>
            <div className="w-36">
              <DatePicker
                size="sm"
                value={endDate ? `${endDate}T00:00:00` : undefined}
                onChange={(v) => handleEndDateChange(v ? v.slice(0, 10) : '')}
                placeholder={t('结束日期')}
                minDate={startDate || undefined}
              />
            </div>
            <div className="flex-1" />
            {(startDate || endDate || action || memberId || search) && (
              <Button variant="ghost" size="sm" onClick={handleResetFilter}>
                {t('重置筛选')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`}
              />
              {t('刷新')}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--text-secondary)]" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 justify-center py-16 text-[var(--error)]">
            <AlertCircle className="w-5 h-5" />
            {getErrorMessage(error) || t('加载操作历史失败')}
          </div>
        ) : !hasAnyLogs ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-[var(--text-secondary)]">
            <FolderOpen className="w-8 h-8" />
            <span>{t('暂无操作记录')}</span>
          </div>
        ) : (
          <div
            ref={listRef}
            className="flex flex-col gap-3 overflow-y-auto pr-1"
            data-tour="operation-history-list"
          >
            {TIME_GROUP_ORDER.map((group) => {
              const groupLogs = grouped[group];
              if (groupLogs.length === 0) return null;
              return (
                <div key={group} className="flex flex-col gap-1">
                  <div className="text-xs font-medium text-[var(--text-tertiary)] px-1">
                    {TIME_GROUP_LABEL[group]}
                    <span className="ml-1 opacity-60">{groupLogs.length}</span>
                  </div>
                  {groupLogs.map((log) => {
                    const locatable =
                      LOCATABLE_ACTIONS.has(log.action) &&
                      !!log.resourceId &&
                      !!log.projectId;
                    const projectOpen =
                      PROJECT_OPEN_ACTIONS.has(log.action) && !!log.projectId;
                    const clickable = locatable || projectOpen;
                    const openDrawing =
                      FILE_ACTIONS.has(log.action) && !!log.resourceId;
                    const onClick = clickable
                      ? () =>
                          locatable
                            ? handleOpenLocation(log)
                            : handleOpenProject(log)
                      : undefined;
                    const { icon: ActionIcon, colorClass } = getActionIcon(
                      log.action
                    );
                    return (
                      <div
                        key={log.id}
                        role={clickable ? 'button' : undefined}
                        tabIndex={clickable ? 0 : undefined}
                        onClick={onClick}
                        onKeyDown={
                          clickable
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  onClick?.();
                                }
                              }
                            : undefined
                        }
                        className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 bg-[var(--bg-tertiary)] text-sm transition-colors ${
                          clickable
                            ? 'cursor-pointer hover:bg-[var(--bg-secondary)] group'
                            : ''
                        }`}
                      >
                        <Tooltip
                          content={`${actorDisplayName(log)}${
                            log.user?.email
                              ? ` · ${log.user.email}`
                              : ''
                          }`}
                          position="top"
                        >
                          <UserAvatar
                            name={actorDisplayName(log)}
                            size={28}
                            className="shrink-0 mt-0.5"
                          />
                        </Tooltip>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[var(--text-primary)] truncate">
                              {actorDisplayName(log)}
                            </span>
                            <span className="shrink-0 inline-flex items-center gap-1">
                              <ActionIcon
                                className={`w-3.5 h-3.5 ${colorClass}`}
                              />
                              <span className="text-xs text-[var(--text-secondary)]">
                                {getActionDisplayName(log.action)}
                              </span>
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-[var(--text-secondary)]">
                            {getActionDetail(log)}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                            <span>{formatDate(log.createdAt)}</span>
                            {clickable && (
                              <span className="inline-flex items-center gap-0.5 text-[var(--primary-600)] opacity-0 group-hover:opacity-100 transition-opacity">
                                <MapPin className="w-3 h-3" />
                                {locatable ? t('打开所在位置') : t('打开项目')}
                              </span>
                            )}
                          </div>
                        </div>
                        {openDrawing && (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="shrink-0 self-center"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDrawing(log);
                            }}
                            title={t('打开图纸')}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            {t('打开图纸')}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center pt-2">
            <Pagination
              meta={{ total, page, limit: PAGE_SIZE, totalPages }}
              onPageChange={(p) => {
                setPage(p);
                listRef.current?.scrollTo({ top: 0 });
              }}
              simple
            />
          </div>
        )}
      </div>
    </Modal>
  );
};
