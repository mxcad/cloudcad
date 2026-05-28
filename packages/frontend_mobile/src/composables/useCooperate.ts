import { ref, readonly, onMounted, onBeforeUnmount } from 'vue';
import { MxCpp } from 'mxcad';
import { showToast } from 'vant';

const APP_COOPERATE_URL = '/api/cooperate';

const isCadReady = ref(false);
const works = ref<number[]>([]);
const currentWorkId = ref<number | null>(null);
const loading = ref(false);
const connecting = ref(false);

let cadCheckTimer: ReturnType<typeof setInterval> | null = null;

function getCooperate() {
  try {
    const mxCAD = MxCpp.getCurrentMxCAD();
    if (!mxCAD) return null;
    const cooperate = mxCAD.getCooperate();
    if (!cooperate) return null;
    cooperate.init({ server_addres: APP_COOPERATE_URL });
    return cooperate;
  } catch {
    return null;
  }
}

export function useCooperate() {
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
    cooperate.getWorks((workList: number[]) => {
      works.value = workList;
      loading.value = false;
    });
  }

  function createWork() {
    connecting.value = true;
    const cooperate = getCooperate();
    if (!cooperate) {
      connecting.value = false;
      showToast('协同服务未就绪');
      return;
    }
    cooperate.createWrok((workid: number) => {
      connecting.value = false;
      if (workid > 0) {
        currentWorkId.value = workid;
        showToast('协同已创建');
        fetchWorks();
      } else {
        const errorCode = -workid;
        if (errorCode === 4) {
          showToast('已在协同中');
        } else {
          showToast(`创建协同失败，错误码: ${errorCode}`);
        }
      }
    });
  }

  function joinWork(workId: number) {
    connecting.value = true;
    const cooperate = getCooperate();
    if (!cooperate) {
      connecting.value = false;
      showToast('协同服务未就绪');
      return;
    }
    cooperate.joinWork(workId, (iRet: number) => {
      connecting.value = false;
      if (iRet === 0 || iRet === 17) {
        currentWorkId.value = workId;
        showToast('已加入协同');
      } else {
        showToast(`加入协同失败，错误码: ${iRet}`);
      }
    });
  }

  function exitWork() {
    const cooperate = getCooperate();
    if (cooperate) {
      cooperate.exitWrok();
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
