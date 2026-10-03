import { defineStore } from 'pinia';
import { ref } from 'vue';
import { MxCpp } from 'mxcad';
import { showToast } from 'vant';
import { t } from '@/languages';
import {
  getCooperate,
  encodeUserData,
  encodeV3WorkData,
  parseWorkData,
  deduplicateWorkUsers,
  parseUserData,
  getWorkCreator,
  syncSessionFromWorkData,
  type Work,
  type CollaborateWorkDataV3,
  exitGuardRef,
} from '../composables/useCooperate';
import {
  nodeControllerGetNode,
  projectControllerGetProjects,
} from '../api-sdk';
import { useEditorStore } from './editor';

export { exitGuardRef, parseWorkData, getWorkCreator, parseUserData };

const FETCH_WORKS_TIMEOUT = 30000;
const JOIN_SAFETY_TIMEOUT = 15000;
// 与 PC POLL_INTERVAL 对齐：原 8s 是 PC 的 4 倍频率，手机端切后台仍持续打请求
const POLL_INTERVAL = 30000;

export const useCollabStore = defineStore('collab', () => {
  const isCadReady = ref(false);
  const works = ref<Work[]>([]);
  const currentWorkId = ref<number | null>(null);
  const loading = ref(false);
  // 列表拉取失败标记：原先失败只弹一次 toast，随后界面显示「暂无活跃协同」，
  // 用户会把「服务故障」误读成「没有协同」
  const fetchError = ref(false);
  const connecting = ref(false);
  const creating = ref(false);
  const joiningWorkId = ref<number | null>(null);
  const fileNameCache = ref<Record<string, string>>({});
  const projectNameCache = ref<Record<string, string>>({});
  const myProjectIds = ref<string[]>([]);

  const joiningLockRef = { current: false };
  const fetchingRef = { current: false };
  let cadCheckTimer: ReturnType<typeof setInterval> | null = null;

  function checkCadReady() {
    try {
      const mxCAD = MxCpp.getCurrentMxCAD();
      if (mxCAD) {
        isCadReady.value = true;
        if (cadCheckTimer) {
          clearInterval(cadCheckTimer);
          cadCheckTimer = null;
        }
      }
    } catch {
      isCadReady.value = false;
    }
  }

  function startCadCheck() {
    checkCadReady();
    if (!isCadReady.value) {
      cadCheckTimer = setInterval(checkCadReady, 500);
    }
  }

  function stopCadCheck() {
    if (cadCheckTimer) {
      clearInterval(cadCheckTimer);
      cadCheckTimer = null;
    }
  }

  async function fetchMyProjectIds(): Promise<string[]> {
    try {
      const result = await projectControllerGetProjects({ query: {} });
      if (result.error) return [];
      const nodes = (result.data as { nodes?: { id: string }[] })?.nodes || [];
      return nodes.map((n) => n.id);
    } catch {
      return [];
    }
  }

  // Track known IDs for stale cache cleanup
  const knownDrawingIds = new Set<string>();
  const knownProjectIds = new Set<string>();

  function fetchWorks(showLoading = false, force = false) {
    // in-flight 保护：上一轮未返回时跳过本轮，避免慢网络下请求堆积（对齐 PC fetchWorks）
    if (fetchingRef.current && !force) return;
    fetchingRef.current = true;
    if (showLoading) loading.value = true;

    const cooperate = getCooperate();
    if (!cooperate) {
      fetchingRef.current = false;
      loading.value = false;
      fetchError.value = true;
      showToast(t('协同服务未就绪'));
      return;
    }

    let resolved = false;
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        fetchingRef.current = false;
        loading.value = false;
        fetchError.value = true;
        showToast(t('获取协同列表超时'));
      }
    }, FETCH_WORKS_TIMEOUT);

    fetchMyProjectIds().then((ids) => {
      myProjectIds.value = ids;
    });

    cooperate.getWorks((workList: Work[]) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      fetchingRef.current = false;
      fetchError.value = false;

      const filtered = workList
        .filter((w) => parseWorkData(w.work_data) !== null)
        .map((w) => {
          const { linkUserIds, linkUserData } = deduplicateWorkUsers(
            w.link_user_ids,
            w.link_user_data
          );
          return { ...w, link_user_ids: linkUserIds, link_user_data: linkUserData };
        });

      const preserveActive = currentWorkId.value !== null && !filtered.some((w) => w.work_id === currentWorkId.value);
      const oldWorks = works.value;
      works.value = filtered;
      if (preserveActive) {
        const current = oldWorks.find((w) => w.work_id === currentWorkId.value);
        if (current) {
          works.value = [current, ...filtered];
        }
      }
      loading.value = false;

      // Track known IDs and cleanup stale cache entries
      const newDrawingIds = new Set<string>();
      const newProjectIds = new Set<string>();
      for (const w of filtered) {
        const data = parseWorkData(w.work_data);
        if (data?.drawingId) newDrawingIds.add(data.drawingId);
        if (data?.projectId) newProjectIds.add(data.projectId);
      }
      knownDrawingIds.clear();
      knownProjectIds.clear();
      newDrawingIds.forEach(id => knownDrawingIds.add(id));
      newProjectIds.forEach(id => knownProjectIds.add(id));

      // Cleanup stale cache entries
      if (Object.keys(fileNameCache.value).length > 0) {
        const cleanedFiles: Record<string, string> = {};
        for (const id of knownDrawingIds) {
          if (fileNameCache.value[id]) cleanedFiles[id] = fileNameCache.value[id];
        }
        fileNameCache.value = cleanedFiles;
      }
      if (Object.keys(projectNameCache.value).length > 0) {
        const cleanedProjects: Record<string, string> = {};
        for (const id of knownProjectIds) {
          if (projectNameCache.value[id]) cleanedProjects[id] = projectNameCache.value[id];
        }
        projectNameCache.value = cleanedProjects;
      }

      // 无条件解析名称：原先仅在 filtered.length > 0 且已带条件时触发，
      // 首屏 getWorks 返回时缓存必空，卡片全部显示「未知图纸」要等下一轮轮询
      resolveNames(filtered);
    });
  }

  async function resolveNames(workList: Work[]) {
    const drawingIds = new Set<string>();
    const projectIds = new Set<string>();

    for (const w of workList) {
      const data = parseWorkData(w.work_data);
      if (data?.drawingId) drawingIds.add(data.drawingId);
      if (data?.projectId) projectIds.add(data.projectId);
    }

    const resolvedDrawings: { id: string; name: string }[] = [];
    const resolvedProjects: { id: string; name: string }[] = [];

    await Promise.all([
      ...[...drawingIds].map(async (id) => {
        if (fileNameCache.value[id]) return;
        try {
          const result = await nodeControllerGetNode({ path: { nodeId: id } });
          if (result.data && 'name' in (result.data as Record<string, unknown>)) {
            resolvedDrawings.push({ id, name: (result.data as { name: string }).name });
          }
        } catch {
          resolvedDrawings.push({ id, name: `${t('图纸')} ${id.slice(0, 6)}...` });
        }
      }),
      ...[...projectIds].map(async (id) => {
        if (projectNameCache.value[id]) return;
        try {
          const result = await nodeControllerGetNode({ path: { nodeId: id } });
          if (result.data && 'name' in (result.data as Record<string, unknown>)) {
            resolvedProjects.push({ id, name: (result.data as { name: string }).name });
          }
        } catch {
          resolvedProjects.push({ id, name: `${t('项目')} ${id.slice(0, 6)}...` });
        }
      }),
    ]);

    if (resolvedDrawings.length > 0) {
      const updated = { ...fileNameCache.value };
      for (const e of resolvedDrawings) updated[e.id] = e.name;
      fileNameCache.value = updated;
    }

    if (resolvedProjects.length > 0) {
      const updated = { ...projectNameCache.value };
      for (const e of resolvedProjects) updated[e.id] = e.name;
      projectNameCache.value = updated;
    }
  }

  function internalExitWork(): boolean {
    const cooperate = getCooperate();
    if (cooperate) {
      const ret = cooperate.exitWork();
      if (ret !== 0) return false;
    }
    currentWorkId.value = null;
    const editorStore = useEditorStore();
    editorStore.setCollaborationState({ isInCollaboration: false, workId: null });
    return true;
  }

  type CollaborateUser = { id: string; name: string; avatar?: string };

  function createWork(userData?: CollaborateUser) {
    if (creating.value) return;
    // 未登录禁止创建（对齐 PC「请先打开图纸并登录」）：否则产出 creatorId:'' 的孤儿协同
    if (!userData) {
      showToast(t('请先登录'));
      return;
    }
    creating.value = true;
    connecting.value = true;

    if (currentWorkId.value !== null) {
      internalExitWork();
    }

    const cooperate = getCooperate();
    if (!cooperate) {
      connecting.value = false;
      creating.value = false;
      showToast(t('协同服务未就绪'));
      return;
    }

    const onResult = (workid: number) => {
      connecting.value = false;
      creating.value = false;
      if (workid > 0) {
        currentWorkId.value = workid;
        const editorStore = useEditorStore();
        editorStore.setCollaborationState({ isInCollaboration: true, workId: workid });
        showToast(t('协同已创建'));
        // Optimistic: refresh immediately
        fetchWorks(false, true);
      } else {
        const errorCode = -workid;
        // 动态错误码只国际化前缀（对齐 PC 的拼法），整串进 i18n 永不命中
        showToast(
          errorCode === 4 ? t('已在协同中') : `${t('创建协同失败，错误码: ')}${errorCode}`
        );
      }
    };

    const editorStore = useEditorStore();
    const s = editorStore.state;
    const drawingName = s.fileName || t('未命名图纸');
    let sourceType: CollaborateWorkDataV3['sourceType'] = 'my';
    let libraryKey: 'drawing' | 'block' | undefined;

    if (s.libraryKey) {
      sourceType = 'library';
      libraryKey = s.libraryKey;
    } else if (!s.fileId) {
      sourceType = 'local';
    } else if (s.fromShare) {
      sourceType = 'share';
    } else if (s.fromCollabShare) {
      sourceType = 'share';
    } else if (s.isPersonalSpace) {
      sourceType = 'my';
    } else if (s.projectId) {
      sourceType = 'project';
    } else {
      sourceType = 'local';
    }

    const workDataPayload = encodeV3WorkData({
      drawingId: s.fileId || '',
      projectId: (sourceType === 'my' || sourceType === 'local') ? null : (s.projectId ?? null),
      drawingName,
      sourceType,
      libraryKey,
      // 本地图纸以文件内容 MD5 作为协同识别的唯一标识（drawingId 为空串）
      fileHash: sourceType === 'local' ? (s.fileHash ?? undefined) : undefined,
      creatorId: userData.id,
      creatorName: userData.name,
      creatorAvatar: userData.avatar,
    });

    const encodedUser = encodeUserData({
      v: 1,
      id: userData.id,
      name: userData.name,
      avatar: userData.avatar,
    });
    cooperate.createWork(onResult, workDataPayload, userData.id, encodedUser);
  }

  function joinWork(workId: number, userData?: CollaborateUser) {
    if (joiningLockRef.current) return;
    // 未登录禁止加入（对齐 PC）：SDK 用空 userId 加入会得到责任人不明的参与者
    if (!userData) {
      showToast(t('请先登录'));
      return;
    }
    joiningLockRef.current = true;

    if (currentWorkId.value !== null && currentWorkId.value !== workId) {
      internalExitWork();
    }

    connecting.value = true;
    joiningWorkId.value = workId;

    function releaseJoinLock() {
      connecting.value = false;
      joiningWorkId.value = null;
      joiningLockRef.current = false;
    }

    const cooperate = getCooperate();
    if (!cooperate) {
      releaseJoinLock();
      showToast(t('协同服务未就绪'));
      return;
    }

    // Safety timer to prevent loading forever
    let joinResolved = false;
    let unlockTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribeOpenComplete: (() => void) | null = null;

    // 统一出口：解绑引擎监听 + 清未触发的 2s 解锁定时器。
    // 超时路径也必须走这里——否则 openFileComplete 监听泄漏在引擎单例上
    // （每次超时加入累积一个，属已知反模式）
    function cleanupJoinWatchers() {
      if (unlockTimer) clearTimeout(unlockTimer);
      unlockTimer = null;
      unsubscribeOpenComplete?.();
      unsubscribeOpenComplete = null;
    }

    const safetyTimer = setTimeout(() => {
      if (!joinResolved) {
        joinResolved = true;
        cleanupJoinWatchers();
        releaseJoinLock();
        showToast(t('加入协同超时'));
      }
    }, JOIN_SAFETY_TIMEOUT);

    // 图纸打开完成即取消安全定时器（对齐 PC 订阅 CAD_EVENTS.OPEN_COMPLETE）：
    // 只碰锁、不动会话状态——joinWork 回调仍是会话身份的权威来源；
    // 回调若始终不来，2s 后同样松开锁，避免按钮永久禁用
    try {
      const mxcad = MxCpp.getCurrentMxCAD();
      if (mxcad) {
        const onFileOpen = () => {
          clearTimeout(safetyTimer);
          if (unlockTimer) clearTimeout(unlockTimer);
          unlockTimer = setTimeout(releaseJoinLock, 2000);
        };
        mxcad.on('openFileComplete', onFileOpen);
        unsubscribeOpenComplete = () => {
          mxcad.off('openFileComplete', onFileOpen);
        };
      }
    } catch {
      // 引擎未就绪时忽略：safetyTimer 仍兜底
    }

    cooperate.joinWork(
      workId,
      (iRet: number) => {
        if (joinResolved) return;
        joinResolved = true;
        clearTimeout(safetyTimer);
        cleanupJoinWatchers();
        releaseJoinLock();

        if (iRet === 0 || iRet === 17) {
          currentWorkId.value = workId;
          const editorStore = useEditorStore();
          editorStore.setCollaborationState({ isInCollaboration: true, workId });

          // Sync drawingId, projectId, fileName, libraryKey from work_data
          syncSessionFromWorkData(workId);

          showToast(iRet === 0 ? t('已加入协同') : t('已恢复协同连接'));
          fetchWorks(false, true);
        } else if (iRet === 5) {
          showToast(t('该协同已关闭'));
        } else {
          // 动态错误码只国际化前缀（对齐 PC 的拼法），整串进 i18n 永不命中
          showToast(`${t('加入协同失败，错误码: ')}${iRet}`);
        }
      },
      userData.id,
      encodeUserData({ v: 1, id: userData.id, name: userData.name, avatar: userData.avatar })
    );
  }

  function exitWork() {
    const cooperate = getCooperate();
    let exitFailed = false;
    if (cooperate) {
      const ret = cooperate.exitWork();
      if (ret !== 0) {
        showToast(`${t('退出协同失败，错误码: ')}${ret}`);
        exitFailed = true;
      }
    }

    exitGuardRef.current = true;
    setTimeout(() => { exitGuardRef.current = false; }, 3000);

    currentWorkId.value = null;
    const editorStore = useEditorStore();
    editorStore.setCollaborationState({ isInCollaboration: false, workId: null });

    if (!exitFailed) {
      showToast(t('已退出协同'));
    }
    fetchWorks(false, true);
  }

  return {
    isCadReady,
    works,
    currentWorkId,
    loading,
    fetchError,
    connecting,
    creating,
    joiningWorkId,
    fileNameCache,
    projectNameCache,
    myProjectIds,
    fetchWorks,
    createWork,
    joinWork,
    exitWork,
    resolveNames,
    checkCadReady,
    startCadCheck,
    stopCadCheck,
    POLL_INTERVAL,
  };
});
