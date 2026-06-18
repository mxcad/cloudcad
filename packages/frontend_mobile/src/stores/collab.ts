import { defineStore } from 'pinia';
import { ref } from 'vue';
import { MxCpp } from 'mxcad';
import { showToast } from 'vant';
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
  fileSystemControllerGetNode,
  fileSystemControllerGetProjects,
} from '../api-sdk';
import { useEditorStore } from './editor';

export { exitGuardRef, parseWorkData, getWorkCreator, parseUserData };

export const useCollabStore = defineStore('collab', () => {
  const isCadReady = ref(false);
  const works = ref<Work[]>([]);
  const currentWorkId = ref<number | null>(null);
  const loading = ref(false);
  const connecting = ref(false);
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
      const result = await fileSystemControllerGetProjects({ query: {} });
      if (result.error) return [];
      const nodes = (result.data as { nodes?: { id: string }[] })?.nodes || [];
      return nodes.map((n) => n.id);
    } catch {
      return [];
    }
  }

  function fetchWorks() {
    loading.value = true;
    const cooperate = getCooperate();
    if (!cooperate) {
      loading.value = false;
      showToast('协同服务未就绪');
      return;
    }

    fetchMyProjectIds().then((ids) => {
      myProjectIds.value = ids;
    });

    cooperate.getWorks((workList: Work[]) => {
      const filtered = workList
        .filter((w) => parseWorkData(w.work_data) !== null)
        .map((w) => {
          const { linkUserIds, linkUserData } = deduplicateWorkUsers(
            w.link_user_ids,
            w.link_user_data
          );
          return { ...w, link_user_ids: linkUserIds, link_user_data: linkUserData };
        });
      works.value = filtered;
      loading.value = false;

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
        try {
          const result = await fileSystemControllerGetNode({ path: { nodeId: id } });
          if (result.data && 'name' in (result.data as Record<string, unknown>)) {
            resolvedDrawings.push({ id, name: (result.data as { name: string }).name });
          }
        } catch {
          resolvedDrawings.push({ id, name: `图纸 ${id.slice(0, 6)}...` });
        }
      }),
      ...[...projectIds].map(async (id) => {
        try {
          const result = await fileSystemControllerGetNode({ path: { nodeId: id } });
          if (result.data && 'name' in (result.data as Record<string, unknown>)) {
            resolvedProjects.push({ id, name: (result.data as { name: string }).name });
          }
        } catch {
          resolvedProjects.push({ id, name: `项目 ${id.slice(0, 6)}...` });
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
      const ret = cooperate.exitWrok();
      if (ret !== 0) return false;
    }
    currentWorkId.value = null;
    const editorStore = useEditorStore();
    editorStore.setCollaborationState({ isInCollaboration: false, workId: null });
    return true;
  }

  function createWork(userData?: { id: string; name: string; avatar?: string }) {
    if (connecting.value) return;
    connecting.value = true;

    if (currentWorkId.value !== null) {
      internalExitWork();
    }

    const cooperate = getCooperate();
    if (!cooperate) {
      connecting.value = false;
      showToast('协同服务未就绪');
      return;
    }

    const onResult = (workid: number) => {
      connecting.value = false;
      if (workid > 0) {
        currentWorkId.value = workid;
        const editorStore = useEditorStore();
        editorStore.setCollaborationState({ isInCollaboration: true, workId: workid });
        showToast('协同已创建');
        fetchWorks();
      } else {
        const errorCode = -workid;
        showToast(errorCode === 4 ? '已在协同中' : `创建协同失败，错误码: ${errorCode}`);
      }
    };

    const editorStore = useEditorStore();
    const s = editorStore.state;
    const drawingName = s.fileName || '未命名图纸';
    let sourceType: CollaborateWorkDataV3['sourceType'] = 'my';
    let libraryKey: 'drawing' | 'block' | undefined;

    if (!s.fileId) {
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
      cooperate.createWrok(onResult, workDataPayload, userData.id, encodedUser);
    } else {
      cooperate.createWrok(onResult, workDataPayload);
    }
  }

  function joinWork(workId: number, userData?: { id: string; name: string; avatar?: string }) {
    if (joiningLockRef.current) return;
    joiningLockRef.current = true;

    if (currentWorkId.value !== null && currentWorkId.value !== workId) {
      internalExitWork();
      fetchWorks();
    }

    connecting.value = true;
    const cooperate = getCooperate();
    if (!cooperate) {
      connecting.value = false;
      joiningLockRef.current = false;
      showToast('协同服务未就绪');
      return;
    }

    cooperate.joinWork(
      workId,
      (iRet: number) => {
        connecting.value = false;
        joiningLockRef.current = false;
        if (iRet === 0 || iRet === 17) {
          currentWorkId.value = workId;
          const editorStore = useEditorStore();
          editorStore.setCollaborationState({ isInCollaboration: true, workId });
          showToast('已加入协同');
          fetchWorks();
        } else {
          showToast(`加入协同失败，错误码: ${iRet}`);
        }
      },
      userData?.id,
      userData ? encodeUserData({ v: 1, id: userData.id, name: userData.name, avatar: userData.avatar }) : undefined
    );
  }

  function exitWork() {
    const cooperate = getCooperate();
    if (cooperate) {
      const ret = cooperate.exitWrok();
      if (ret !== 0) {
        showToast(`退出协同失败，错误码: ${ret}`);
        return;
      }
    }
    exitGuardRef.current = true;
    setTimeout(() => { exitGuardRef.current = false; }, 3000);

    currentWorkId.value = null;
    const editorStore = useEditorStore();
    editorStore.setCollaborationState({ isInCollaboration: false, workId: null });
    showToast('已退出协同');
    fetchWorks();
  }

  return {
    isCadReady,
    works,
    currentWorkId,
    loading,
    connecting,
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
