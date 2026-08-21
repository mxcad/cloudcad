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

export const useCollabStore = defineStore('collab', () => {
  const isCadReady = ref(false);
  const works = ref<Work[]>([]);
  const currentWorkId = ref<number | null>(null);
  const loading = ref(false);
  const connecting = ref(false);
  const creating = ref(false);
  const joiningWorkId = ref<number | null>(null);
  const fileNameCache = ref<Record<string, string>>({});
  const projectNameCache = ref<Record<string, string>>({});
  const myProjectIds = ref<string[]>([]);

  const joiningLockRef = { current: false };
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

  function fetchWorks(showLoading = false) {
    if (showLoading) loading.value = true;
    const cooperate = getCooperate();
    if (!cooperate) {
      loading.value = false;
      showToast(t('协同服务未就绪'));
      return;
    }

    let resolved = false;
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        loading.value = false;
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

      if (filtered.length > 0) {
        resolveNames(filtered);
      }
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
          resolvedDrawings.push({ id, name: t(`图纸 ${id.slice(0, 6)}...`) });
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
          resolvedProjects.push({ id, name: t(`项目 ${id.slice(0, 6)}...`) });
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
        fetchWorks();
      } else {
        const errorCode = -workid;
        showToast(errorCode === 4 ? t('已在协同中') : t(`创建协同失败，错误码: ${errorCode}`));
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
      creatorId: userData?.id || '',
      creatorName: userData?.name || '',
      creatorAvatar: userData?.avatar,
    });

    if (userData) {
      const encodedUser = encodeUserData({
        v: 1,
        id: userData.id,
        name: userData.name,
        avatar: userData.avatar,
      });
      cooperate.createWork(onResult, workDataPayload, userData.id, encodedUser);
    } else {
      cooperate.createWork(onResult, workDataPayload);
    }
  }

  function joinWork(workId: number, userData?: CollaborateUser) {
    if (joiningLockRef.current) return;
    joiningLockRef.current = true;

    if (currentWorkId.value !== null && currentWorkId.value !== workId) {
      internalExitWork();
    }

    connecting.value = true;
    joiningWorkId.value = workId;

    const cooperate = getCooperate();
    if (!cooperate) {
      connecting.value = false;
      joiningWorkId.value = null;
      joiningLockRef.current = false;
      showToast(t('协同服务未就绪'));
      return;
    }

    // Safety timer to prevent loading forever
    let joinResolved = false;
    const safetyTimer = setTimeout(() => {
      if (!joinResolved) {
        joinResolved = true;
        connecting.value = false;
        joiningWorkId.value = null;
        joiningLockRef.current = false;
        showToast(t('加入协同超时'));
      }
    }, JOIN_SAFETY_TIMEOUT);

    cooperate.joinWork(
      workId,
      (iRet: number) => {
        if (joinResolved) return;
        joinResolved = true;
        clearTimeout(safetyTimer);
        connecting.value = false;
        joiningWorkId.value = null;
        joiningLockRef.current = false;

        if (iRet === 0 || iRet === 17) {
          currentWorkId.value = workId;
          const editorStore = useEditorStore();
          editorStore.setCollaborationState({ isInCollaboration: true, workId });

          // Sync drawingId, projectId, fileName, libraryKey from work_data
          cooperate.getWorks((workList: Work[]) => {
            const joined = workList.find((w) => w.work_id === workId);
            if (!joined) return;
            const data = parseWorkData(joined.work_data);
            if (data && data.v === 3) {
              if (data.drawingId) editorStore.setFileId(data.drawingId);
              if (data.projectId) editorStore.setProjectId(data.projectId);
              if (data.drawingName) editorStore.setFileName(data.drawingName);
              if (data.libraryKey) editorStore.setLibraryKey(data.libraryKey);
            }
          });

          showToast(iRet === 0 ? t('已加入协同') : t('已恢复协同连接'));
          fetchWorks();
        } else if (iRet === 5) {
          showToast(t('该协同已关闭'));
        } else {
          showToast(t(`加入协同失败，错误码: ${iRet}`));
        }
      },
      userData?.id,
      userData ? encodeUserData({ v: 1, id: userData.id, name: userData.name, avatar: userData.avatar }) : undefined
    );
  }

  function exitWork() {
    const cooperate = getCooperate();
    let exitFailed = false;
    if (cooperate) {
      const ret = cooperate.exitWork();
      if (ret !== 0) {
        showToast(t(`退出协同失败，错误码: ${ret}`));
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
    fetchWorks();
  }

  return {
    isCadReady,
    works,
    currentWorkId,
    loading,
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
  };
});
