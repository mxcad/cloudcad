import { showLoadingToast, closeToast, showToast } from 'vant';
import { useEditorStore } from '../stores/editor';
import { getCooperate, encodeUserData, parseWorkData, exitGuardRef } from './useCooperate';
import type { Ref } from 'vue';

interface UserInfo {
  id: string;
  username: string;
  avatar?: string;
}

export function useCollabAutoJoin(user: Ref<UserInfo | null>) {
  const editorStore = useEditorStore();

  function startAutoJoin(workId: number): () => void {
    const MAX_RETRIES = 30;
    let retryCount = 0;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const toast = showLoadingToast('正在打开协同文件...');

    const cleanup = () => {
      cancelled = true;
      timers.forEach(t => clearTimeout(t));
      try { closeToast(); } catch { /* ignore */ }
    };

    const tryJoin = () => {
      if (cancelled) return;

      if (!user.value) {
        cancelled = true;
        cleanup();
        showToast('请先登录');
        editorStore.setCollabShareState({ fromCollabShare: false, targetWorkId: null });
        return;
      }

      if (exitGuardRef.current) {
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          timers.push(setTimeout(tryJoin, 1000));
        }
        return;
      }

      const cooperate = getCooperate();
      if (!cooperate) {
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          timers.push(setTimeout(tryJoin, 1000));
        }
        return;
      }

      const userData = {
        v: 1 as const,
        id: user.value.id,
        name: user.value.username,
        avatar: user.value.avatar,
      };

      cooperate.joinWork(
        workId,
        (iRet: number) => {
          console.log(`[Mobile auto-join] attempt ${retryCount + 1}, joinWork returned:`, iRet);
          if (iRet === 0 || iRet === 17) {
            cancelled = true;
            cleanup();
            editorStore.setCollaborationState({ isInCollaboration: true, workId });
            (function resolveWorkName() {
              const cooperate = getCooperate();
              if (!cooperate) return;
              cooperate.getWorks((workList: { work_id: number; work_data: string }[]) => {
                const joined = workList.find((w: { work_id: number }) => w.work_id === workId);
                if (!joined) return;
                const data = parseWorkData(joined.work_data);
                if (data && data.v === 3 && data.drawingName) {
                  editorStore.setFileName(data.drawingName);
                }
              });
            })();
            showToast(iRet === 0 ? '已加入协同' : '已恢复协同连接');
          } else if (iRet < 0) {
            if (!cancelled && retryCount < MAX_RETRIES) {
              retryCount++;
              timers.push(setTimeout(tryJoin, 1000));
            } else {
              cleanup();
              showToast('加入协同超时');
              editorStore.setCollabShareState({ fromCollabShare: false, targetWorkId: null });
            }
          } else {
            cleanup();
            showToast(`加入协同失败，错误码: ${iRet}`);
            editorStore.setCollabShareState({ fromCollabShare: false, targetWorkId: null });
          }
        },
        userData.id,
        encodeUserData(userData),
      );
    };

    timers.push(setTimeout(tryJoin, 500));
    return cleanup;
  }

  return { startAutoJoin };
}
