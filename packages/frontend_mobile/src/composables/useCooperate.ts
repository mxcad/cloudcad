import { ref, readonly } from 'vue';
import { MxCpp } from 'mxcad';
import { showToast } from 'vant';

interface CooperateUser {
  id: string;
  name: string;
  color: string;
}

const isConnected = ref(false);
const users = ref<CooperateUser[]>([]);
const roomId = ref('');
const connecting = ref(false);

export function useCooperate() {
  function getCooperate() {
    try {
      const mxCAD = MxCpp.getCurrentMxCAD();
      if (!mxCAD) return null;
      const cooperate = mxCAD.getCooperate();
      return cooperate || null;
    } catch {
      return null;
    }
  }

  async function createRoom(): Promise<string | null> {
    const cooperate = getCooperate();
    if (!cooperate) {
      showToast('CAD 引擎未初始化');
      return null;
    }

    connecting.value = true;
    try {
      cooperate.setOptions({
        server_addres: '/api/cooperate',
        coopType: 'single',
      });

      const result = await cooperate.createRoom();
      if (result) {
        roomId.value = result;
        isConnected.value = true;
        showToast('协作房间已创建');
        return result;
      }
      showToast('创建协作房间失败');
      return null;
    } catch {
      showToast('创建协作房间失败');
      return null;
    } finally {
      connecting.value = false;
    }
  }

  async function joinRoom(id: string): Promise<boolean> {
    const cooperate = getCooperate();
    if (!cooperate) {
      showToast('CAD 引擎未初始化');
      return false;
    }

    connecting.value = true;
    try {
      cooperate.setOptions({
        server_addres: '/api/cooperate',
        coopType: 'single',
      });

      await cooperate.joinRoom(id);
      roomId.value = id;
      isConnected.value = true;
      showToast('已加入协作房间');
      return true;
    } catch {
      showToast('加入协作房间失败');
      return false;
    } finally {
      connecting.value = false;
    }
  }

  function leaveRoom() {
    const cooperate = getCooperate();
    if (cooperate) {
      try {
        cooperate.leaveRoom();
      } catch {
        // ignore
      }
    }
    isConnected.value = false;
    roomId.value = '';
    users.value = [];
  }

  return {
    isConnected: readonly(isConnected),
    users: readonly(users),
    roomId: readonly(roomId),
    connecting: readonly(connecting),
    createRoom,
    joinRoom,
    leaveRoom,
  };
}
