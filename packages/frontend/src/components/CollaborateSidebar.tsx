import {
  Users,
  UserPlus,
  RefreshCw,
  Loader2,
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
import { MxCpp } from 'mxcad';
import { useNotification } from '../contexts/NotificationContext';
import { Tooltip } from './ui/Tooltip';
import { Card } from '@/components/ui/Card';
import { APP_COOPERATE_URL } from '@/constants/appConfig';
import { mxcadManager } from '../services/mxcadManager';
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
} from '../types/collaboration';
import type {
  CollaborateWorkData,
  CollaborateUserData,
} from '../types/collaboration';
import { ShareDialog } from './modals/ShareDialog';
import styles from './CollaborateSidebar.module.css';

interface Work {
  link_user_data: string[];
  link_user_ids: string[];
  real_user_id: string;
  work_data: string;
  work_id: number;
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
  const { currentFileId, currentProjectId } = useCADEditorStore();
  const { showToast } = useNotification();

  const getCooperate = useCallback(() => {
    const mxCAD = MxCpp.getCurrentMxCAD();
    if (!mxCAD) return null;

    const cooperate = mxCAD.getCooperate();
    if (!cooperate) return null;

    cooperate.init({ server_addres: APP_COOPERATE_URL });
    return cooperate;
  }, []);

  const [works, setWorks] = useState<Work[]>([]);
  const [currentWorkId, setCurrentWorkId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joiningWorkId, setJoiningWorkId] = useState<number | null>(null);
  const [fileNameCache, setFileNameCache] = useState<Record<string, string>>(
    {}
  );
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const fetchWorks = useCallback(async () => {
    try {
      setLoading(true);
      const cooperate = getCooperate();
      if (!cooperate) {
        setLoading(false);
        return;
      }

      const myProjectIds = await fetchMyProjectIds();

      cooperate.getWorks((workList: Work[]) => {
        const filtered = workList.filter((w) => {
          const data = parseWorkData(w.work_data);
          if (!data) return false;
          if (data.projectId && myProjectIds.includes(data.projectId))
            return true;
          if (!data.projectId) return true;
          return false;
        });
        setWorks(filtered);
        setLoading(false);
      });
    } catch (error) {
      console.error('获取协同列表失败:', error);
      setLoading(false);
    }
  }, [getCooperate, currentFileId, user]);

  const resolveFileNames = useCallback(async (workList: Work[]) => {
    const drawingIds = new Set<string>();
    for (const w of workList) {
      const data = parseWorkData(w.work_data);
      if (data?.drawingId) drawingIds.add(data.drawingId);
    }

    const resolvedList: { id: string; name: string }[] = [];
    await Promise.all(
      [...drawingIds].map(async (id) => {
        try {
          const result = await fileSystemControllerGetNode({
            path: { nodeId: id },
          });
          if (result.data && 'name' in result.data) {
            resolvedList.push({
              id,
              name: (result.data as { name: string }).name,
            });
          }
        } catch {
          resolvedList.push({ id, name: `图纸 ${id.slice(0, 6)}...` });
        }
      })
    );
    if (resolvedList.length > 0) {
      setFileNameCache((prev) => {
        const entries = resolvedList.filter((r) => !prev[r.id]);
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
    } else {
      setFileNameCache({});
    }
  }, []);

  const [isCadReady, setIsCadReady] = useState(false);
  const initCheckRef = useRef<NodeJS.Timeout | null>(null);

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
  }, [isCadReady, fetchWorks, currentFileId]);

  useEffect(() => {
    if (works.length > 0) {
      resolveFileNames(works);
    }
  }, [works]);

  const autoJoinRef = useRef(false);

  useEffect(() => {
    const fromShare = new URLSearchParams(window.location.search).get(
      'fromShare'
    );
    if (fromShare === '1') {
      autoJoinRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!autoJoinRef.current || !currentFileId || works.length === 0) return;

    const matchingWork = works.find((w) => {
      const data = parseWorkData(w.work_data);
      return data?.drawingId === currentFileId;
    });

    if (matchingWork && currentWorkId === null) {
      autoJoinRef.current = false;
      handleJoinWork(matchingWork.work_id);
    }
  }, [works, currentFileId, currentWorkId]);

  const handleCreateWork = useCallback(async () => {
    try {
      setCreating(true);
      const cooperate = getCooperate();
      if (!cooperate) {
        showToast('协同对象未初始化', 'error');
        setCreating(false);
        return;
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
            setCurrentWorkId(workid);
            fetchWorks();
            showToast(`协同创建成功！ID: ${workid}`, 'success');
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

  const handleJoinWork = useCallback(
    async (workId: number) => {
      try {
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
            } else {
              if (iRet === 17) {
                setCurrentWorkId(workId);
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
    [getCooperate, user, showToast]
  );

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

  const getSessionName = useCallback(
    (work: Work) => {
      const data = parseWorkData(work.work_data);
      if (data?.drawingId && fileNameCache[data.drawingId]) {
        return fileNameCache[data.drawingId];
      }
      return `协同 ${work.work_id}`;
    },
    [fileNameCache]
  );

  return (
    <div className={styles.container} data-tour="collaborators-panel">
      <div className={styles.actionsBar}>
        <button
          onClick={handleCreateWork}
          disabled={creating || currentWorkId !== null}
          className={`${styles.primaryButton} ${styles.ripple}`}
          data-tour="create-collaborate-btn"
        >
          {creating ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <UserPlus size={14} />
          )}
          <span>{creating ? '创建中...' : '创建协同'}</span>
        </button>

        <Tooltip
          content="刷新列表"
          position="bottom"
          delay={100}
          disabled={loading}
        >
          <button
            onClick={fetchWorks}
            disabled={loading}
            className={`${styles.iconButton} ${styles.ripple}`}
            aria-label="刷新列表"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </Tooltip>
      </div>

      {currentWorkId !== null && (
        <div className={styles.currentSession}>
          <div className={styles.sessionInfo}>
            <div className={styles.sessionLeft}>
              <div className={styles.statusIndicator}>
                <div className={styles.statusDot} />
              </div>
              <span className={styles.sessionLabel}>
                当前协同:{' '}
                <span className={styles.sessionId}>{currentWorkId}</span>
              </span>
            </div>
            <div className={styles.sessionActions}>
              <Tooltip content="分享" position="bottom" delay={100}>
                <button
                  onClick={() => setShareDialogOpen(true)}
                  className={`${styles.shareButton} ${styles.ripple}`}
                >
                  <Share2 size={12} />
                </button>
              </Tooltip>
              <button
                onClick={handleExitWork}
                className={`${styles.exitButton} ${styles.ripple}`}
              >
                退出
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.sessionList} data-tour="collaborate-list">
        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.loadingSpinner} />
            <span className={styles.loadingText}>加载中...</span>
          </div>
        ) : works.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <Users size={20} />
            </div>
            <div className={styles.emptyTitle}>暂无协同会话</div>
            <div className={styles.emptyDescription}>
              点击「创建协同」开始协作
            </div>
          </div>
        ) : (
          works.map((work, index) => (
            <Card
              key={work.work_id}
              variant="filled"
              className={`${styles.sessionCard} ${currentWorkId === work.work_id ? styles.active : ''}`}
              style={{ animationDelay: `${Math.min(index * 0.05, 0.35)}s` }}
              onClick={() =>
                currentWorkId !== work.work_id &&
                currentWorkId === null &&
                handleJoinWork(work.work_id)
              }
            >
              <div className={styles.sessionCardLeft}>
                <div className={styles.sessionIcon}>
                  <Users size={14} />
                </div>
                <div className={styles.sessionDetails}>
                  <div className={styles.sessionName}>
                    {getSessionName(work)}
                  </div>
                  <div className={styles.sessionMeta}>
                    <span>等待加入</span>
                  </div>
                </div>
              </div>

              {currentWorkId === work.work_id ? (
                <span className={styles.joinedBadge}>
                  <Check size={10} />
                  已加入
                </span>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleJoinWork(work.work_id);
                  }}
                  disabled={joiningWorkId !== null || currentWorkId !== null}
                  className={`${styles.joinButton} ${styles.ripple}`}
                >
                  {joiningWorkId === work.work_id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    '加入'
                  )}
                </button>
              )}
            </Card>
          ))
        )}
      </div>

      <ShareDialog
        isOpen={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
      />
    </div>
  );
};

export default CollaborateSidebar;
