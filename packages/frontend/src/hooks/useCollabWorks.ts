import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { nodeControllerGetNode, projectControllerGetProjects } from '@/api-sdk';
import {
  encodeUserData,
  parseWorkData,
  deduplicateWorkUsers,
} from '../types/collaboration';
import type { Work, CollaborateWorkDataV3 } from '../types/collaboration';
import { getCooperate } from '../services/mxcadManager';
import {
  FETCH_WORKS_TIMEOUT,
  POLL_INTERVAL,
  PROJECT_IDS_CACHE_TTL,
} from '@/constants/timeouts';
import { useCADEditorStore } from '../stores/useCADEditorStore';
import { refreshFileName } from '../services/mxcadManager';
import {
  patchSession,
  patchSessionFlags,
  subscribe,
} from '../services/drawingSession';
import { CAD_EVENTS } from '@/constants/events';
import { queryKeys } from '@/lib/queryKeys';
import { t } from '@/languages';

/**
 * work_data V3 语义判据：V3 才有 sourceType/fileHash，V1/V2 与无源头的
 * （null/未知版本）统一视作云图路径，所以「本地」判据必须同时带 v === 3。
 * drawingName 也只存在于 V3；drawingId 两个版本都有。
 */
type WorkData = ReturnType<typeof parseWorkData>;

function isLocalWorkData(
  data: WorkData | null | undefined
): data is Extract<WorkData, { v: 3 }> {
  return !!data && data.v === 3 && data.sourceType === 'local';
}

/** 本地协同无 drawingId（空串），按内容 MD5 判断是否当前图纸 */
function matchesCurrentDrawing(
  data: WorkData | null,
  currentFileHashValue: string | null | undefined,
  currentFileIdValue: string | null | undefined
): boolean {
  if (!data) return false;
  if (isLocalWorkData(data)) {
    return currentFileHashValue ? data.fileHash === currentFileHashValue : false;
  }
  return data.drawingId === currentFileIdValue;
}

/** 图纸聚合键：本地=fileHash，云图/项目等=drawingId */
function drawingGroupKey(data: WorkData | null | undefined): string {
  if (data?.v === 3 && data.sourceType === 'local') {
    return data.fileHash || '';
  }
  return data?.drawingId || '';
}

/** 协同来源类型：V3 才有，其余为 null */
function workSourceType(data: WorkData | null | undefined) {
  return data && data.v === 3 ? data.sourceType : null;
}

/**
 * 展示名：云图/项目走 nodeId 缓存，本地取 work_data.drawingName。
 * 缓存缺失时 drawingName 才当兜底——缓存过期时优先显示刷新后的真名。
 */
function resolveWorkDisplayName(
  data: WorkData | null | undefined,
  fileNameCache: Record<string, string>
): string {
  return (
    (data?.drawingId && fileNameCache[data.drawingId]
      ? fileNameCache[data.drawingId]
      : data && data.v === 3
        ? data.drawingName
        : undefined) || t('未知图纸')
  );
}

/** 「我的项目」口径：排除本地/个人/分享来源，且必须挂在某个项目下 */
function isMyProjectWork(
  data: WorkData | null,
  myWorkIds: Set<number>,
  myProjectIds: string[],
  workId: number
): boolean {
  if (myWorkIds.has(workId)) return false;
  if (!data) return false;
  if (
    data.v === 3 &&
    (data.sourceType === 'local' ||
      data.sourceType === 'my' ||
      data.sourceType === 'share')
  ) {
    return false;
  }
  if (!data.projectId) return false;
  return myProjectIds.includes(data.projectId);
}

/**
 * 列表条目装配（myWorks / projectWorks 共用）。
 * 无 projectId 时的项目名两个列表口径不同（我的=个人空间，我的项目=空串），
 * 由 emptyProjectName 区分。
 */
function buildWorkListItem(
  work: Work,
  data: WorkData | null,
  ctx: {
    currentWorkId: number | null;
    projectNameCache: Record<string, string>;
    fileNameCache: Record<string, string>;
    emptyProjectName: string;
    isSameCurrentDrawing: (data: WorkData | null) => boolean;
  }
): WorkListItem {
  const { projectNameCache, emptyProjectName } = ctx;
  return {
    work,
    projectName: data?.projectId
      ? (projectNameCache[data.projectId] ?? emptyProjectName)
      : emptyProjectName,
    drawingName: resolveWorkDisplayName(data, ctx.fileNameCache),
    isCurrentFile: ctx.isSameCurrentDrawing(data),
    isJoined: ctx.currentWorkId === work.work_id,
    onlineCount: work.link_user_ids.length,
    sourceType: workSourceType(data),
    drawingKey: drawingGroupKey(data),
  };
}

interface ProjectCacheEntry {
  id: string;
  name: string;
}

export interface WorkListItem {
  work: Work;
  projectName: string;
  drawingName: string;
  isCurrentFile: boolean;
  isJoined: boolean;
  onlineCount: number;
  /** 协同来源类型（local=本地图纸，其余为云图/项目/库/分享） */
  sourceType: CollaborateWorkDataV3['sourceType'] | null;
  /** 图纸唯一标识，用于按图纸聚合：本地=fileHash，云图/项目等=drawingId */
  drawingKey: string;
}

export interface CollabWorksState {
  works: Work[];
  currentWorkId: number | null;
  loading: boolean;
  fileNameCache: Record<string, string>;
  projectNameCache: Record<string, string>;
  myProjectIds: string[];
  setCurrentWorkId: (id: number | null) => void;
  setWorks: React.Dispatch<React.SetStateAction<Work[]>>;
  currentFileWorks: Work[];
  myWorks: WorkListItem[];
  projectWorks: WorkListItem[];
  currentFileName: string;
  fetchWorks: (showLoading?: boolean, force?: boolean) => Promise<void>;
}

/** 两个 work 列表是否逐项等价（2s 轮询下避免内容未变也整体重渲染） */
function sameWorks(a: Work[], b: Work[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    // 上方已校 a.length === b.length 且 i < a.length，两侧索引必然在界内
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.work_id !== y.work_id ||
      x.work_data !== y.work_data ||
      x.real_user_id !== y.real_user_id ||
      !sameStringArray(x.link_user_ids, y.link_user_ids) ||
      !sameStringArray(x.link_user_data, y.link_user_data)
    ) {
      return false;
    }
  }
  return true;
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * 名称缓存合并 + 清理已不在列表的条目；内容无变化时返回原引用
 * （2s 轮询下避免每轮换新引用触发整棵面板重渲染）。
 */
function mergeNameCache<T extends { id: string; name: string }>(
  prev: Record<string, string>,
  entries: T[],
  activeIds: Set<string>
): Record<string, string> {
  const updated: Record<string, string> = {};
  for (const [id, name] of Object.entries(prev)) {
    if (activeIds.has(id)) updated[id] = name;
  }
  for (const e of entries) updated[e.id] = e.name;
  if (Object.keys(updated).length === Object.keys(prev).length) {
    let changed = false;
    for (const id of Object.keys(updated)) {
      if (updated[id] !== prev[id]) {
        changed = true;
        break;
      }
    }
    if (!changed) return prev;
  }
  return updated;
}

export function useCollabWorks(
  fromShare: boolean,
  user: { id: string; username: string; avatar?: string | null } | null | undefined,
  visible: boolean
): CollabWorksState {
  const userId = user?.id;
  const currentFileIdState = useCADEditorStore((s) => s.currentFileId);
  const storeFileNameState = useCADEditorStore((s) => s.currentFileName);
  const currentFileInfoState = useCADEditorStore((s) => s.currentFileInfo);

  const [works, setWorksState] = useState<Work[]>([]);
  // 等价短路：内容未变的轮询结果不换引用，避免每轮触发整棵协同面板重渲染
  const setWorks: React.Dispatch<React.SetStateAction<Work[]>> = useCallback(
    (action) => {
      setWorksState((prev) => {
        const next = typeof action === 'function' ? action(prev) : action;
        return sameWorks(prev, next) ? prev : next;
      });
    },
    []
  );
  // 已加入的协同以 store 为准水合：侧边栏隐藏时整棵面板卸载（SidebarContainer
  // 条件渲染），本地态会清零，导致重开后已加入的会话显示为「加入」而非「退出」。
  // 页面级语言切换（SidebarContainer 的 key=activeLanguage）同理。
  const [currentWorkId, setCurrentWorkId] = useState<number | null>(
    () => useCADEditorStore.getState().collaborationWorkId
  );
  const [loading, setLoading] = useState(false);
  const [fileNameCache, setFileNameCache] = useState<Record<string, string>>(
    {}
  );
  const [projectNameCache, setProjectNameCache] = useState<
    Record<string, string>
  >({});
  const [myProjectIds, setMyProjectIds] = useState<string[]>([]);

  const fetchVersionRef = useRef(0);
  const fetchWorksTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fetchingRef = useRef(false);

  const currentFileIdValue = currentFileIdState;
  const storeFileNameValue = storeFileNameState;
  // 当前本地图纸的内容 MD5（local 类型唯一标识；云图等为 undefined）
  const currentFileHashValue = currentFileInfoState?.fileHash;
  const queryClient = useQueryClient();

  // 自己这条参与者数据：协同会话里我本人必然在场，服务端偶发漏回自己的
  // link_user_data 时（只剩最后 1 人时出现过）不能把人数清零
  const myUserData = useMemo(
    () =>
      user
        ? encodeUserData({
            v: 1,
            id: user.id,
            name: user.username,
            avatar: user.avatar ?? undefined,
          })
        : null,
    [user]
  );

  const withSelfInJoinedWork = useCallback(
    (list: Work[]): Work[] => {
      if (!userId || !myUserData) return list;
      const joinedWorkId = useCADEditorStore.getState().collaborationWorkId;
      if (joinedWorkId === null) return list;
      return list.map((w) =>
        w.work_id === joinedWorkId && !w.link_user_ids.includes(userId)
          ? {
              ...w,
              link_user_ids: [...w.link_user_ids, userId],
              link_user_data: [...w.link_user_data, myUserData],
            }
          : w
      );
    },
    [userId, myUserData]
  );

  // 项目 ID 列表（60s staleTime，由 react-query 管理）—— 仅用于「项目协同」分组过滤，无需每次轮询都拉取
  const fetchMyProjectIds = useCallback(async (): Promise<string[]> => {
    try {
      return await queryClient.fetchQuery({
        queryKey: queryKeys.collab.myProjectIds,
        queryFn: async (): Promise<string[]> => {
          const result = await projectControllerGetProjects({ query: {} });
          if (result.error) return [];
          const nodes =
            (result.data as { nodes?: { id: string }[] })?.nodes || [];
          return nodes.map((n) => n.id);
        },
        staleTime: PROJECT_IDS_CACHE_TTL,
        retry: false,
      });
    } catch {
      // 请求失败时回退旧缓存，避免轮询失败清空「项目协同」分组
      return (
        queryClient.getQueryData<string[]>(queryKeys.collab.myProjectIds) ?? []
      );
    }
  }, [queryClient]);

  const fetchWorks = useCallback(
    async (showLoading = false, force = false) => {
      // 协同数据必须登录：游客态不发 getProjects / getWorks / getNode
      //（曾游客态轮询恒 401，getWorks 走 WASM fetch、不经 SDK 拦截器）
      if (!userId) return;
      // in-flight 保护：上一次请求未完成时跳过本轮，避免慢网络下请求堆积
      // force 用于事件驱动场景（如文件打开完成），即使轮询请求在途中也强制执行
      if ((fromShare && !force) || (fetchingRef.current && !force)) return;
      fetchingRef.current = true;

      const version = ++fetchVersionRef.current;
      if (showLoading) setLoading(true);

      const timeoutId = setTimeout(() => {
        setLoading(false);
        fetchingRef.current = false;
      }, FETCH_WORKS_TIMEOUT);
      fetchWorksTimeoutRef.current = timeoutId;

      try {
        setMyProjectIds(await fetchMyProjectIds());

        const cooperate = getCooperate();
        if (!cooperate) {
          fetchingRef.current = false;
          setLoading(false);
          return;
        }

        cooperate.getWorks((workList: Work[]) => {
          clearTimeout(timeoutId);
          // 旧版本回调（version 不匹配）不得复位新一轮的 in-flight 标志
          if (version !== fetchVersionRef.current) return;
          fetchingRef.current = false;
          setLoading(false);
          const filtered = withSelfInJoinedWork(
            workList
              .filter((w) => parseWorkData(w.work_data) !== null)
              .map((w) => {
                const { linkUserIds, linkUserData } = deduplicateWorkUsers(
                  w.link_user_ids,
                  w.link_user_data
                );
                return {
                  ...w,
                  link_user_ids: linkUserIds,
                  link_user_data: linkUserData,
                };
              })
          );
          // 以服务端 getWorks 结果为准（不进行本地合并）：
          // 创建/加入协同后由服务端返回完整协同列表；退出当前协同（exitWork）
          // 只是离开协同会话，服务端 work 记录仍在，无需在本地做合并兜底。
          setWorks(filtered);
        });
      } catch {
        clearTimeout(fetchWorksTimeoutRef.current);
        fetchingRef.current = false;
        setLoading(false);
      }
    },
    [userId, fromShare, fetchMyProjectIds, withSelfInJoinedWork]
  );

  const resolveNames = useCallback(
    async (workList: Work[]) => {
      if (fromShare) return;

      const drawingIds = new Set<string>();
      const projectIds = new Set<string>();

      for (const w of workList) {
        const data = parseWorkData(w.work_data);
        if (data?.drawingId) drawingIds.add(data.drawingId);
        if (data?.projectId) projectIds.add(data.projectId);
      }

      const resolvedDrawings: { id: string; name: string }[] = [];
      const resolvedProjects: ProjectCacheEntry[] = [];

      // 2s 轮询下每轮都会进来：只拉未缓存的名称，避免每轮对整张列表重打 getNode。
      // 已缓存的 id 直接沿用旧值（与移动端 resolveNames 同一策略）。
      const uncachedDrawingIds = [...drawingIds].filter(
        (id) => !fileNameCache[id]
      );
      const uncachedProjectIds = [...projectIds].filter(
        (id) => !projectNameCache[id]
      );

      await Promise.all([
        ...uncachedDrawingIds.map(async (id) => {
          try {
            const result = await nodeControllerGetNode({
              path: { nodeId: id },
            });
            if (result.data && 'name' in result.data) {
              resolvedDrawings.push({
                id,
                name: (result.data as { name: string }).name,
              });
            }
          } catch {
            resolvedDrawings.push({
              id,
              name: `${t('图纸')} ${id.slice(0, 6)}...`,
            });
          }
        }),
        ...uncachedProjectIds.map(async (id) => {
          try {
            const result = await nodeControllerGetNode({
              path: { nodeId: id },
            });
            if (result.data && 'name' in result.data) {
              resolvedProjects.push({
                id,
                name: (result.data as { name: string }).name,
              });
            }
          } catch {
            resolvedProjects.push({
              id,
              name: `${t('项目')} ${id.slice(0, 6)}...`,
            });
          }
        }),
      ]);

      // 每轮都执行清理：只取未缓存的名称，已不在列表的条目仍需剔除
      setFileNameCache((prev) =>
        mergeNameCache(prev, resolvedDrawings, drawingIds)
      );

      setProjectNameCache((prev) =>
        mergeNameCache(prev, resolvedProjects, projectIds)
      );
    },
    [fromShare, fileNameCache, projectNameCache]
  );

  useEffect(() => {
    if (!fromShare && works.length > 0) {
      resolveNames(works);
    }
  }, [works, resolveNames, fromShare]);

  useEffect(() => {
    const resolved = currentFileIdValue
      ? fileNameCache[currentFileIdValue]
      : undefined;
    if (!resolved) return;
    // 双写：有会话时 patchSession 同步 currentFileInfo.name；协同链接直达
    // （auto-join 不经过 openSession，currentFileInfo=null）时 patchSession
    // 会被 patchCurrentFileInfo 静默丢弃，必须用 patchSessionFlags 直写
    // currentFileName 兜底链，编辑器标题才能显示图纸名
    patchSession({ name: resolved });
    patchSessionFlags({ fileName: resolved });
    refreshFileName();
  }, [fileNameCache, currentFileIdValue]);

  useEffect(() => {
    // 仅当协同面板可见时轮询；页面切到后台（document.hidden）时跳过本轮
    if (fromShare || !visible) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      fetchWorks();
    }, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchWorks, fromShare, visible]);

  useEffect(() => {
    // 仅协同面板可见时在文件打开完成时强制刷新列表；不可见时不订阅——
    // 避免每次打开图纸都连带发 projectControllerGetProjects + getWorks + 名称解析请求，
    // 与图纸渲染抢带宽。切到协同 tab 时由 useCollaboration 的 visible+isCadReady 兜底拉取。
    if (fromShare || !visible) return;
    const onFileOpenComplete = () => {
      fetchWorks(true, true);
    };
    return subscribe(CAD_EVENTS.OPEN_COMPLETE, onFileOpenComplete);
  }, [fetchWorks, fromShare, visible]);

  const currentFileWorks = useMemo(() => {
    const filtered = works.filter((w) => {
      const data = parseWorkData(w.work_data);
      if (!data) return false;
      if (data.v === 3 && data.sourceType === 'local') {
        // 本地图纸（drawingId 为空串）：优先按文件内容 MD5（fileHash）匹配，
        // 使同一张本地图纸创建的多个协同准确聚合，避免不同图纸协同混杂。
        // 当前文件已记录 fileHash（新版本地打开/上传流程）时走 hash 匹配；
        // 无 hash（历史数据/未记录）时回退到按创建者/参与者匹配以兼容旧行为。
        if (currentFileIdValue === '' && data.drawingId === '') {
          if (currentFileHashValue) {
            return data.fileHash === currentFileHashValue;
          }
          return (
            userId &&
            (data.creatorId === userId || w.link_user_ids.includes(userId))
          );
        }
        return data.drawingId === currentFileIdValue;
      }
      return data.drawingId === currentFileIdValue;
    });
    if (
      currentWorkId !== null &&
      !filtered.some((w) => w.work_id === currentWorkId)
    ) {
      const activeWork = works.find((w) => w.work_id === currentWorkId);
      if (activeWork) return [...filtered, activeWork];
    }
    return filtered;
  }, [works, currentFileIdValue, currentFileHashValue, userId, currentWorkId]);

  const isSameCurrentDrawing = useCallback(
    (data: WorkData | null): boolean =>
      matchesCurrentDrawing(data, currentFileHashValue, currentFileIdValue),
    [currentFileHashValue, currentFileIdValue]
  );

  const myWorks = useMemo(
    () =>
      works
        .filter((w) => userId && w.real_user_id === userId)
        .map((w) =>
      buildWorkListItem(w, parseWorkData(w.work_data), {
        currentWorkId,
        projectNameCache,
        fileNameCache,
        emptyProjectName: t('未知项目'),
        isSameCurrentDrawing,
      }))
      .sort((a, b) => b.work.work_id - a.work.work_id),

    [
      works,
      userId,
      projectNameCache,
      fileNameCache,
      isSameCurrentDrawing,
      currentWorkId,
    ]
  );

  const myWorkIds = useMemo(
    () => new Set(myWorks.map((m) => m.work.work_id)),
    [myWorks]
  );

  const projectWorks = useMemo(
    () =>
      works
        .filter((w) => {
          return isMyProjectWork(
            parseWorkData(w.work_data),
            myWorkIds,
            myProjectIds,
            w.work_id
          );
        })
        .map((w) =>
      buildWorkListItem(w, parseWorkData(w.work_data), {
        currentWorkId,
        projectNameCache,
        fileNameCache,
        emptyProjectName: '',
        isSameCurrentDrawing,
      }))
      .sort((a, b) => b.work.work_id - a.work.work_id),

    [
      works,
      myWorkIds,
      myProjectIds,
      projectNameCache,
      fileNameCache,
      isSameCurrentDrawing,
      currentWorkId,
    ]
  );

  const currentFileName = useMemo(() => {
    if (currentFileIdValue === null || currentFileIdValue === undefined)
      return '';
    const cached = fileNameCache[currentFileIdValue];
    if (cached) return cached;
    return storeFileNameValue || t('当前图纸');
  }, [currentFileIdValue, fileNameCache, storeFileNameValue]);

  return {
    works,
    currentWorkId,
    loading,
    fileNameCache,
    projectNameCache,
    myProjectIds,
    setCurrentWorkId,
    setWorks,
    currentFileWorks,
    myWorks,
    projectWorks,
    currentFileName,
    fetchWorks,
  };
}
