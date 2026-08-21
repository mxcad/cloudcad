import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { nodeControllerGetNode, projectControllerGetProjects } from '@/api-sdk';
import { parseWorkData, deduplicateWorkUsers } from '../types/collaboration';
import type { Work, CollaborateWorkDataV3 } from '../types/collaboration';
import { getCooperate } from '../services/mxcadManager';
import {
  FETCH_WORKS_TIMEOUT,
  POLL_INTERVAL,
  PROJECT_IDS_CACHE_TTL,
} from '@/constants/timeouts';
import { useCADEditorStore } from '../stores/useCADEditorStore';
import { refreshFileName } from '../services/mxcadManager';
import { patchSession, subscribe } from '../services/drawingSession';
import { CAD_EVENTS } from '@/constants/events';
import { queryKeys } from '@/lib/queryKeys';
import { t } from '@/languages';

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

export function useCollabWorks(
  fromShare: boolean,
  userId: string | null | undefined,
  visible: boolean
): CollabWorksState {
  const currentFileIdState = useCADEditorStore((s) => s.currentFileId);
  const storeFileNameState = useCADEditorStore((s) => s.currentFileName);
  const currentFileInfoState = useCADEditorStore((s) => s.currentFileInfo);

  const [works, setWorks] = useState<Work[]>([]);
  const [currentWorkId, setCurrentWorkId] = useState<number | null>(null);
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
          const filtered = workList
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
            });
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
    [fromShare, fetchMyProjectIds]
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

      await Promise.all([
        ...[...drawingIds].map(async (id) => {
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
        ...[...projectIds].map(async (id) => {
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

      if (resolvedDrawings.length > 0) {
        setFileNameCache((prev) => {
          const entries = resolvedDrawings.filter((r) => !prev[r.id]);
          if (entries.length === 0) {
            const staleIds = Object.keys(prev).filter(
              (id) => !drawingIds.has(id)
            );
            if (staleIds.length === 0) return prev;
            const cleaned = { ...prev };
            for (const id of staleIds) delete cleaned[id];
            return cleaned;
          }
          const updated = { ...prev };
          for (const e of entries) updated[e.id] = e.name;
          const staleIds = Object.keys(updated).filter(
            (id) => !drawingIds.has(id)
          );
          for (const id of staleIds) delete updated[id];
          return updated;
        });
      }

      if (resolvedProjects.length > 0) {
        setProjectNameCache((prev) => {
          const entries = resolvedProjects.filter((r) => !prev[r.id]);
          if (entries.length === 0) {
            const staleIds = Object.keys(prev).filter(
              (id) => !projectIds.has(id)
            );
            if (staleIds.length === 0) return prev;
            const cleaned = { ...prev };
            for (const id of staleIds) delete cleaned[id];
            return cleaned;
          }
          const updated = { ...prev };
          for (const e of entries) updated[e.id] = e.name;
          const staleIds = Object.keys(updated).filter(
            (id) => !projectIds.has(id)
          );
          for (const id of staleIds) delete updated[id];
          return updated;
        });
      }
    },
    [fromShare]
  );

  useEffect(() => {
    if (!fromShare && works.length > 0) {
      resolveNames(works);
    }
  }, [works, resolveNames, fromShare]);

  useEffect(() => {
    if (currentFileIdValue && fileNameCache[currentFileIdValue]) {
      patchSession({ name: fileNameCache[currentFileIdValue] });
      refreshFileName();
    }
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
    (data: ReturnType<typeof parseWorkData> | null): boolean => {
      if (!data) return false;
      // 本地图纸：按内容 MD5 判断是否当前图纸
      if (data.v === 3 && data.sourceType === 'local') {
        return currentFileHashValue ? data.fileHash === currentFileHashValue : false;
      }
      return data.drawingId === currentFileIdValue;
    },
    [currentFileHashValue, currentFileIdValue]
  );

  const myWorks = useMemo(
    () =>
      works
        .filter((w) => userId && w.real_user_id === userId)
        .map((w) => {
          const data = parseWorkData(w.work_data);
          const sourceType =
            data && data.v === 3 ? data.sourceType : null;
          // 本地图纸用 fileHash 分组；云图/项目等用 drawingId(nodeId) 分组
          const drawingKey =
            sourceType === 'local' && data && data.v === 3
              ? data.fileHash || ''
              : (data?.drawingId || '');
          return {
            work: w,
            projectName: data?.projectId
              ? (projectNameCache[data.projectId] ?? t('未知项目'))
              : t('个人空间'),
            drawingName:
              (data?.drawingId && fileNameCache[data.drawingId]
                ? fileNameCache[data.drawingId]
                : data && data.v === 3
                  ? data.drawingName
                  : undefined) || t('未知图纸'),
            isCurrentFile: isSameCurrentDrawing(data),
            isJoined: currentWorkId === w.work_id,
            onlineCount: w.link_user_ids.length,
            sourceType,
            drawingKey,
          };
        })
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
          if (myWorkIds.has(w.work_id)) return false;
          const data = parseWorkData(w.work_data);
          if (!data) return false;
          if (
            data.v === 3 &&
            (data.sourceType === 'local' ||
              data.sourceType === 'my' ||
              data.sourceType === 'share')
          )
            return false;
          if (!data.projectId) return false;
          return myProjectIds.includes(data.projectId);
        })
        .map((w) => {
          const data = parseWorkData(w.work_data);
          const sourceType =
            data && data.v === 3 ? data.sourceType : null;
          const drawingKey =
            sourceType === 'local' && data && data.v === 3
              ? data.fileHash || ''
              : (data?.drawingId || '');
          return {
            work: w,
            projectName: data?.projectId
              ? (projectNameCache[data.projectId] ?? t('未知项目'))
              : '',
            drawingName:
              (data?.drawingId && fileNameCache[data.drawingId]
                ? fileNameCache[data.drawingId]
                : data && data.v === 3
                  ? data.drawingName
                  : undefined) || t('未知图纸'),
            isCurrentFile: isSameCurrentDrawing(data),
            isJoined: currentWorkId === w.work_id,
            onlineCount: w.link_user_ids.length,
            sourceType,
            drawingKey,
          };
        })
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
