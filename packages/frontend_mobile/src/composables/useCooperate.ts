import { ref, readonly, onMounted, onBeforeUnmount } from 'vue';
import { MxCpp } from 'mxcad';
import { showToast } from 'vant';
import { useEditorState } from './useEditorState';

const APP_COOPERATE_URL = import.meta.env.VITE_APP_COOPERATE_URL || '/api/cooperate';

interface Work {
  link_user_data: string[];
  link_user_ids: string[];
  real_user_id: string;
  work_data: string;
  work_id: number;
}

interface CollaborateWorkData {
  v: 1;
  drawingId: string;
  projectId: string | null;
}

interface CollaborateUserData {
  v: 1;
  id: string;
  name: string;
  avatar?: string;
}

function encodeWorkData(data: CollaborateWorkData): string {
  return btoa(JSON.stringify(data));
}

function encodeUserData(data: CollaborateUserData): string {
  return btoa(JSON.stringify(data));
}

function parseWorkData(raw: string): CollaborateWorkData | null {
  try {
    const parsed = JSON.parse(atob(raw));
    if (parsed && parsed.v === 1 && typeof parsed.drawingId === 'string') {
      return parsed as CollaborateWorkData;
    }
  } catch {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === 1 && typeof parsed.drawingId === 'string') {
        return parsed as CollaborateWorkData;
      }
    } catch {
      return null;
    }
  }
  return null;
}

const isCadReady = ref(false);
const works = ref<Work[]>([]);
const currentWorkId = ref<number | null>(null);
const loading = ref(false);
const connecting = ref(false);

let cadCheckTimer: ReturnType<typeof setInterval> | null = null;
let cooperateInit = false;

function getCooperate() {
  try {
    const mxCAD = MxCpp.getCurrentMxCAD();
    if (!mxCAD) return null;
    const cooperate = mxCAD.getCooperate();
    if (!cooperate) return null;
    if (!cooperateInit) {
      cooperate.init({ server_addres: APP_COOPERATE_URL });
      cooperateInit = true;
    }
    return cooperate;
  } catch {
    return null;
  }
}

export function useCooperate() {
  const { state } = useEditorState();

  onMounted(() => {
    checkCadReady();
    if (!isCadReady.value) {
      cadCheckTimer = setInterval(checkCadReady, 500);
    }
  });

  onBeforeUnmount(() => {
    if (cadCheckTimer) {
      clearInterval(cadCheckTimer);
      cadCheckTimer = null;
    }
  });

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

  function fetchWorks() {
    loading.value = true;
    const cooperate = getCooperate();
    if (!cooperate) {
      loading.value = false;
      showToast('协同服务未就绪');
      return;
    }
    cooperate.getWorks((workList: Work[]) => {
      works.value = workList;
      loading.value = false;
    });
  }

  function createWork(userData?: { id: string; name: string; avatar?: string }) {
    connecting.value = true;
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
        showToast('协同已创建');
        fetchWorks();
      } else {
        const errorCode = -workid;
        showToast(errorCode === 4 ? '已在协同中' : `创建协同失败，错误码: ${errorCode}`);
      }
    };
    const workData: CollaborateWorkData = {
      v: 1,
      drawingId: state.fileId ?? '',
      projectId: state.projectId ?? null,
    };
    const encodedWorkData = state.fileId ? encodeWorkData(workData) : '';
    if (userData) {
      const encodedUser = encodeUserData({
        v: 1,
        id: userData.id,
        name: userData.name,
        avatar: userData.avatar,
      });
      cooperate.createWrok(onResult, encodedWorkData, userData.id, encodedUser);
    } else {
      cooperate.createWrok(onResult, encodedWorkData);
    }
  }

  function joinWork(workId: number, userData?: { id: string; name: string; avatar?: string }) {
    connecting.value = true;
    const cooperate = getCooperate();
    if (!cooperate) {
      connecting.value = false;
      showToast('协同服务未就绪');
      return;
    }
    cooperate.joinWork(
      workId,
      (iRet: number) => {
        connecting.value = false;
        if (iRet === 0 || iRet === 17) {
          currentWorkId.value = workId;
          showToast('已加入协同');
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
    currentWorkId.value = null;
    showToast('已退出协同');
    fetchWorks();
  }

  return {
    isCadReady: readonly(isCadReady),
    works: readonly(works),
    currentWorkId: readonly(currentWorkId),
    loading: readonly(loading),
    connecting: readonly(connecting),
    fetchWorks,
    createWork,
    joinWork,
    exitWork,
  };
}
