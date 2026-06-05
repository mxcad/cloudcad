import {
  Users,
  UserPlus,
  RefreshCw,
  Check,
  Share2,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useState,
  useMemo,
  useRef,
} from 'react';
import { useLocation } from 'react-router-dom';
import { MxCpp } from 'mxcad';
import { useNotification } from '../contexts/NotificationContext';
import { Button } from './ui/Button';
import { Tabs, Tab } from './ui';
import { APP_COOPERATE_URL } from '@/constants/appConfig';
import {
  mxcadManager,
  checkAndConfirmUnsavedChanges,
  refreshFileName,
} from '../services/mxcadManager';
import { useAuth } from '../contexts/AuthContext';
import { useCADEditorStore } from '../stores/useCADEditorStore';
import {
  fileSystemControllerGetNode,
  fileSystemControllerGetProjects,
} from '@/api-sdk';
import {
  parseWorkData,
  encodeWorkData,
  encodeUserData,
  deduplicateWorkUsers,
} from '../types/collaboration';
import type {
  CollaborateWorkData,
  CollaborateUserData,
} from '../types/collaboration';
import { exitCurrentCollaboration } from '../services/collaborationService';
import { ShareDialog } from './modals/ShareDialog';
import { CurrentFilePanel } from './CurrentFilePanel';
import { WorkListPanel } from './WorkListPanel';
import styles from './CollaborateSidebar.module.css';

interface Work {
  link_user_data: string[];
  link_user_ids: string[];
  real_user_id: string;
  work_data: string;
  work_id: number;
}

interface ProjectCacheEntry {
  id: string;
  name: string;
}

async function fetchMyProjectIds(): Promise<string[]> {
  try {
    const result = await fileSystemControllerGetProjects({ query: {} });
    if (result.error) return [];
    const nodes = (result.data as { nodes?: { id: string }[] })?.nodes || [];
    return nodes.map((n) => n.id);
  } catch {
    return [];
  }
}

export const CollaborateSidebar: React.FC = () => {
  const { user } = useAuth();
  const { currentFileId, currentProjectId, fromShare, shareCollaborationEnabled, setCollaborationState } = useCADEditorStore();
  const { showToast } = useNotification();
  const location = useLocation();

  const cooperateInitRef = useRef(false);

  const getCooperate = useCallback(() => {
    const mxCAD = MxCpp.getCurrentMxCAD();
    if (!mxCAD) return null;

    const cooperate = mxCAD.getCooperate();
    if (!cooperate) return null;

    if (!cooperateInitRef.current) {
      cooperate.init({ server_addres: APP_COOPERATE_URL });
      cooperateInitRef.current = true;
    }
    return cooperate;
  }, []);

  const [works, setWorks] = useState<Work[]>([]);
  const [currentWorkId, setCurrentWorkId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joiningWorkId, setJoiningWorkId] = useState<number | null>(null);
  const [fileNameCache, setFileNameCache] = useState<Record<string, string>>({});
  const [projectNameCache, setProjectNameCache] = useState<Record<string, string>>({});
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [waitingForSession, setWaitingForSession] = useState(false);
  const [myProjectIds, setMyProjectIds] = useState<string[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'current' | 'list'>('current');
  const [isCadReady, setIsCadReady] = useState(false);
  const [initialFetchDone, setInitialFetchDone] = useState(false);

  const initCheckRef = useRef<NodeJS.Timeout | null>(null);
  const autoCreateRef = useRef(false);

  const fetchWorks = useCallback(async () => {
    try {
      setLoading(true);
      const cooperate = getCooperate();
      if (!cooperate) {
        setLoading(false);
        showToast('协同服务未就绪', 'error');
        return;
      }

      const timeoutId = setTimeout(() => {
        setLoading(false);
        showToast('获取协同列表超时', 'warning');
      }, 15000);

      const ids = await fetchMyProjectIds();
      setMyProjectIds(ids);

      cooperate.getWorks((workList: Work[]) => {
        clearTimeout(timeoutId);
        setInitialFetchDone(true);
        const currentId = useCADEditorStore.getState().currentFileId;
        const filtered = workList.filter((w) => {
          const data = parseWorkData(w.work_data);
          if (!data) return false;
          if (data.projectId && ids.includes(data.projectId)) return true;
          if (!data.projectId) return true;
          // 当前打开图纸的协同会话始终可见（用于分享协同自动加入）
          if (currentId && data.drawingId === currentId) return true;
          return false;
        }).map((w) => {
          const { linkUserIds, linkUserData } = deduplicateWorkUsers(
            w.link_user_ids,
            w.link_user_data
          );
          return { ...w, link_user_ids: linkUserIds, link_user_data: linkUserData };
        });
          const prevIds = worksRef.current.map((w) => w.work_id).sort().join(',');
          const newIds = filtered.map((w) => w.work_id).sort().join(',');
          if (prevIds !== newIds) {
            setWorks((prev) => {
              const newWorkIds = filtered.map((w) => w.work_id);
              const localOnly = prev.filter((w) => !newWorkIds.includes(w.work_id));
              if (localOnly.length === 0) return filtered;
              return [...filtered, ...localOnly];
            });
          }
        setLoading(false);
      });
    } catch (error) {
      console.error('获取协同列表失败:', error);
      setLoading(false);
      showToast('获取协同列表失败', 'error');
    }
  }, [getCooperate, showToast]);

  const resolveNames = useCallback(async (workList: Work[]) => {
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
          const result = await fileSystemControllerGetNode({
            path: { nodeId: id },
          });
          if (result.data && 'name' in result.data) {
            resolvedDrawings.push({
              id,
              name: (result.data as { name: string }).name,
            });
          }
        } catch {
          resolvedDrawings.push({ id, name: `图纸 ${id.slice(0, 6)}...` });
        }
      }),
      ...[...projectIds].map(async (id) => {
        try {
          const result = await fileSystemControllerGetNode({
            path: { nodeId: id },
          });
          if (result.data && 'name' in result.data) {
            resolvedProjects.push({
              id,
              name: (result.data as { name: string }).name,
            });
          }
        } catch {
          resolvedProjects.push({ id, name: `项目 ${id.slice(0, 6)}...` });
        }
      }),
    ]);

    if (resolvedDrawings.length > 0) {
      setFileNameCache((prev) => {
        const entries = resolvedDrawings.filter((r) => !prev[r.id]);
        if (entries.length === 0) {
          const staleIds = Object.keys(prev).filter((id) => !drawingIds.has(id));
          if (staleIds.length === 0) return prev;
          const cleaned = { ...prev };
          for (const id of staleIds) delete cleaned[id];
          return cleaned;
        }
        const updated = { ...prev };
        for (const e of entries) updated[e.id] = e.name;
        const staleIds = Object.keys(updated).filter((id) => !drawingIds.has(id));
        for (const id of staleIds) delete updated[id];
        return updated;
      });
    }

    if (resolvedProjects.length > 0) {
      setProjectNameCache((prev) => {
        const entries = resolvedProjects.filter((r) => !prev[r.id]);
        if (entries.length === 0) {
          const staleIds = Object.keys(prev).filter((id) => !projectIds.has(id));
          if (staleIds.length === 0) return prev;
          const cleaned = { ...prev };
          for (const id of staleIds) delete cleaned[id];
          return cleaned;
        }
        const updated = { ...prev };
        for (const e of entries) updated[e.id] = e.name;
        const staleIds = Object.keys(updated).filter((id) => !projectIds.has(id));
        for (const id of staleIds) delete updated[id];
        return updated;
      });
    }
  }, []);

  useEffect(() => {
    const checkCadReady = () => {
      const ready = mxcadManager.isReady();
      if (ready) {
        setIsCadReady(true);
        if (initCheckRef.current) {
          clearInterval(initCheckRef.current);
          initCheckRef.current = null;
        }
      }
    };

    checkCadReady();

    if (!mxcadManager.isReady()) {
      initCheckRef.current = setInterval(checkCadReady, 500);
    }

    return () => {
      if (initCheckRef.current) {
        clearInterval(initCheckRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isCadReady) {
      fetchWorks();
    }
  }, [isCadReady, fetchWorks]);

  useEffect(() => {
    if (works.length > 0) {
      resolveNames(works);
    }
  }, [works]);

  const autoJoinRef = useRef(false);
  const handleCreateWorkRef = useRef<(skipChecks?: boolean) => Promise<void>>(async () => {});
  const handleJoinWorkRef = useRef<(workId: number, skipModifiedCheck?: boolean) => Promise<void>>(async () => {});

  useEffect(() => {
    const shareParam = new URLSearchParams(location.search).get('fromShare');
    autoJoinRef.current = shareParam === '1';
  }, [location]);

  useEffect(() => {
    if (!autoJoinRef.current || !currentFileId) return;

    // 非协同分享，不做任何自动操作
    if (shareCollaborationEnabled === false) {
      autoJoinRef.current = false;
      setWaitingForSession(false);
      return;
    }

    // 等待首次 fetchWorks 完成
    if (!initialFetchDone) return;

    const matchingWork = works.find((w) => {
      const data = parseWorkData(w.work_data);
      return data?.drawingId === currentFileId;
    });

    if (matchingWork && currentWorkId === null) {
      // 有协同 → 直接加入
      autoJoinRef.current = false;
      setWaitingForSession(false);
      handleJoinWorkRef.current(matchingWork.work_id, true);
    } else if (!matchingWork && !autoCreateRef.current && !creating) {
      // 没有协同 → 自动创建协同（仅执行一次）
      autoCreateRef.current = true;
      setWaitingForSession(false);
      handleCreateWorkRef.current(true);
    }
  }, [works, currentFileId, currentWorkId, shareCollaborationEnabled, initialFetchDone, creating]);

  const autoJoinTimerRef = useRef<NodeJS.Timeout | null>(null);

  const worksRef = useRef(works);
  worksRef.current = works;

  useEffect(() => {
    if (!autoJoinRef.current) return;

    autoJoinTimerRef.current = setInterval(() => {
      if (!autoJoinRef.current) {
        if (autoJoinTimerRef.current) {
          clearInterval(autoJoinTimerRef.current);
          autoJoinTimerRef.current = null;
        }
        return;
      }
      fetchWorks();
    }, 8000);

    return () => {
      if (autoJoinTimerRef.current) {
        clearInterval(autoJoinTimerRef.current);
        autoJoinTimerRef.current = null;
      }
    };
  }, []);

  const handleCreateWork = useCallback(async (skipChecks = false) => {
    try {
      // 如果在其他协同中，先退出
      if (useCADEditorStore.getState().collaborationWorkId !== null) {
        exitCurrentCollaboration();
        setCurrentWorkId(null);
        fetchWorks();
      }

      // 自动创建时跳过未保存修改检查
      if (!skipChecks) {
        const canProceed = await checkAndConfirmUnsavedChanges();
        if (!canProceed) return;
      }

      setCreating(true);
      const cooperate = getCooperate();
      if (!cooperate) {
        showToast('协同对象未初始化', 'error');
        setCreating(false);
        return;
      }

      // 从分享链接自动创建协同：CAD 引擎为空白，需先打开图纸再创建
      if (skipChecks) {
        const pendingUrl = sessionStorage.getItem('collaborationShareFileUrl');
        if (pendingUrl) {
          try {
            await mxcadManager.openFile(pendingUrl);
            await new Promise<void>((resolve) => {
              const onComplete = () => {
                window.removeEventListener('mxcad-file-open-complete', onComplete);
                resolve();
              };
              window.addEventListener('mxcad-file-open-complete', onComplete);
            });
            sessionStorage.removeItem('collaborationShareFileUrl');
          } catch (error) {
            console.error('打开文件失败:', error);
            showToast('打开文件失败', 'error');
            setCreating(false);
            return;
          }
        }
      }

      if (!currentFileId || !user) {
        showToast('请先打开图纸并登录', 'error');
        setCreating(false);
        return;
      }

      const workData: CollaborateWorkData = {
        v: 1,
        drawingId: currentFileId,
        projectId: currentProjectId ?? null,
      };
      const userData: CollaborateUserData = {
        v: 1,
        id: user.id,
        name: user.username,
        avatar: user.avatar ?? undefined,
      };

      cooperate.createWrok(
        (workid: number) => {
          setCreating(false);
          if (workid > 0) {
            // 创建成功后立即加入协同（创建共享会话后需要 join 才能同步）
            handleJoinWorkRef.current(workid, true);
            // 插入本地 work，避免等待 getWorks 异步回调导致 UI 滞后
            const newWork: Work = {
              work_id: workid,
              work_data: encodeWorkData(workData),
              real_user_id: user.id,
              link_user_ids: [user.id],
              link_user_data: [encodeUserData(userData)],
            };
            setWorks((prev) => {
              if (prev.some((w) => w.work_id === workid)) return prev;
              return [newWork, ...prev];
            });
            fetchWorks();
          } else {
            const errorCode = -workid;
            if (errorCode === 4) {
              showToast('协同已存在，您已在协同中', 'warning');
            } else {
              showToast(`创建协同失败，错误码: ${errorCode}`, 'error');
            }
          }
        },
        encodeWorkData(workData),
        user.id,
        encodeUserData(userData)
      );
    } catch (error) {
      console.error('创建协同失败:', error);
      setCreating(false);
      showToast('创建协同失败', 'error');
    }
  }, [
    getCooperate,
    currentFileId,
    currentProjectId,
    user,
    fetchWorks,
    showToast,
  ]);
  handleCreateWorkRef.current = handleCreateWork;

  const handleJoinWork = useCallback(
    async (workId: number, skipModifiedCheck = false) => {
      try {
        // 如果在其他协同中，先退出
        if (
          useCADEditorStore.getState().collaborationWorkId !== null &&
          useCADEditorStore.getState().collaborationWorkId !== workId
        ) {
          exitCurrentCollaboration();
          setCurrentWorkId(null);
          fetchWorks();
        }

        // 非自动加入时检查未保存修改
        if (!skipModifiedCheck) {
          const canProceed = await checkAndConfirmUnsavedChanges();
          if (!canProceed) return;
        }

        setJoiningWorkId(workId);
        const cooperate = getCooperate();
        if (!cooperate) {
          showToast('协同对象未初始化', 'error');
          setJoiningWorkId(null);
          return;
        }

        if (!user) {
          showToast('请先登录', 'error');
          setJoiningWorkId(null);
          return;
        }

        const userData: CollaborateUserData = {
          v: 1,
          id: user.id,
          name: user.username,
          avatar: user.avatar ?? undefined,
        };

        cooperate.joinWork(
          workId,
          async (iRet: number) => {
            setJoiningWorkId(null);
            if (iRet === 0) {
              setCurrentWorkId(workId);
              setCollaborationState({ isInCollaboration: true, workId });
              refreshFileName();
            } else {
              if (iRet === 17) {
                setCurrentWorkId(workId);
                setCollaborationState({ isInCollaboration: true, workId });
                refreshFileName();
              } else {
                showToast(`加入协同失败，错误码: ${iRet}`, 'error');
              }
            }
          },
          user.id,
          encodeUserData(userData)
        );
      } catch (error) {
        console.error('加入协同失败:', error);
        setJoiningWorkId(null);
        showToast('加入协同失败', 'error');
      }
    },
    [getCooperate, user, showToast, fetchWorks]
  );
  handleJoinWorkRef.current = handleJoinWork;

  const handleExitWork = useCallback(async () => {
    try {
      const cooperate = getCooperate();
      if (!cooperate) {
        showToast('协同对象未初始化', 'error');
        return;
      }

      const ret = cooperate.exitWrok();
      if (ret === 0) {
        setCurrentWorkId(null);
        setCollaborationState({ isInCollaboration: false, workId: null });
        refreshFileName();
        fetchWorks();
        showToast('已退出协同', 'success');
      } else {
        showToast(`退出协同失败，错误码: ${ret}`, 'error');
      }
    } catch (error) {
      console.error('退出协同失败:', error);
      showToast('退出协同失败', 'error');
    }
  }, [getCooperate, fetchWorks, showToast]);

  const currentFileWork = useMemo(
    () =>
      works.find((w) => {
        const data = parseWorkData(w.work_data);
        return data?.drawingId === currentFileId;
      }),
    [works, currentFileId]
  );

  const availableWorks = useMemo(() => {
    return works
      .filter((w) => {
        const data = parseWorkData(w.work_data);
        if (!data) return false;
        if (data.projectId && myProjectIds.includes(data.projectId)) return true;
        if (!data.projectId) return false;
        return false;
      })
      .map((w) => {
        const data = parseWorkData(w.work_data);
        return {
          work: w,
          projectName: data?.projectId
            ? projectNameCache[data.projectId] ?? '未知项目'
            : '个人空间',
          drawingName: data?.drawingId
            ? fileNameCache[data.drawingId] ?? '未知图纸'
            : '未知图纸',
          isCurrentFile: data?.drawingId === currentFileId,
          isJoined: currentWorkId === w.work_id,
          onlineCount: w.link_user_ids.length,
        };
      });
  }, [works, myProjectIds, projectNameCache, fileNameCache, currentFileId, currentWorkId]);

  const currentFileName: string = useMemo(() => {
    if (!currentFileId) return '';
    const data = currentFileWork
      ? parseWorkData(currentFileWork.work_data)
      : null;
    if (data?.drawingId && fileNameCache[data.drawingId]) {
      return fileNameCache[data.drawingId] ?? '';
    }
    return '当前图纸';
  }, [currentFileId, currentFileWork, fileNameCache]);

  return (
    <div className={styles.container} data-tour="collaborators-panel">
      <div className={styles.subTabBar}>
        <Tabs>
          <Tab
            active={activeSubTab === 'current'}
            tabVariant="primary"
            size="sm"
            onClick={() => setActiveSubTab('current')}
          >
            当前图纸
          </Tab>
          <Tab
            active={activeSubTab === 'list'}
            tabVariant="primary"
            size="sm"
            onClick={() => setActiveSubTab('list')}
          >
            协同列表
          </Tab>
        </Tabs>

        <Button
          variant="icon"
          icon={RefreshCw}
          tooltip="刷新列表"
          tooltipPosition="bottom"
          tooltipDelay={100}
          loading={loading}
          onClick={fetchWorks}
          aria-label="刷新列表"
        />
      </div>

      <div className={styles.panelContent}>
        {activeSubTab === 'current' ? (
          <CurrentFilePanel
            work={currentFileWork}
            currentWorkId={currentWorkId}
            collaborationEnabled={shareCollaborationEnabled === null ? true : shareCollaborationEnabled}
            fileName={currentFileName}
            isCadReady={isCadReady}
            creating={creating}
            joiningWorkId={joiningWorkId}
            waitingForSession={waitingForSession}
            fromShare={fromShare}
            onCreateWork={handleCreateWork}
            onJoinWork={handleJoinWork}
            onExitWork={handleExitWork}
            onShare={() => setShareDialogOpen(true)}
            onCopyShareLink={() => setShareDialogOpen(true)}
          />
        ) : (
          <WorkListPanel
            items={availableWorks}
            loading={loading}
            currentWorkId={currentWorkId}
            joiningWorkId={joiningWorkId}
            onJoinWork={handleJoinWork}
            onRefresh={fetchWorks}
          />
        )}
      </div>

      <ShareDialog
        isOpen={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        readOnly={fromShare}
      />
    </div>
  );
};

export default CollaborateSidebar;
