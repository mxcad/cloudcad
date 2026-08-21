import { t } from '@/languages';
import { showLoadingToast, closeToast, showToast } from 'vant';
import { useEditorStore } from '../stores/editor';
import { getCooperate, encodeUserData, parseWorkData, exitGuardRef } from './useCooperate';
import type { Ref } from 'vue';

interface UserInfo {
  id: string;
  username: string;
  avatar?: string;
}

const AUTO_JOIN_MAX_RETRIES = 30;
const AUTO_JOIN_SAFETY_TIMEOUT = 15000;
const AUTO_JOIN_INITIAL_DELAY = 500;
const AUTO_JOIN_RETRY_INTERVAL = 1000;

export function useCollabAutoJoin(user: Ref<UserInfo | null>) {
  const editorStore = useEditorStore();

  function startAutoJoin(workId: number): () => void {
    let retryCount = 0;
    let cancelled = false;
    let joinResolved = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const toast = showLoadingToast({
      message: t('正在打开协同文件...'),
      forbidClick: true,
      duration: 0,
    });

    const cleanup = () => {
      cancelled = true;
      timers.forEach(t => clearTimeout(t));
      try { closeToast(); } catch { /* ignore */ }
    };

    // Safety timeout to prevent loading forever
    const safetyTimer = setTimeout(() => {
      if (!joinResolved) {
        joinResolved = true;
        cleanup();
        showToast(t('加入协同超时'));
        editorStore.setCollabShareState({ fromCollabShare: false, targetWorkId: null });
      }
    }, AUTO_JOIN_SAFETY_TIMEOUT);
    timers.push(safetyTimer);

    const tryJoin = () => {
      if (cancelled || joinResolved) return;

      if (!user.value) {
        joinResolved = true;
        cleanup();
        showToast(t('请先登录'));
        editorStore.setCollabShareState({ fromCollabShare: false, targetWorkId: null });
        return;
      }

      if (exitGuardRef.current) {
        if (retryCount < AUTO_JOIN_MAX_RETRIES) {
          retryCount++;
          timers.push(setTimeout(tryJoin, AUTO_JOIN_RETRY_INTERVAL));
        }
        return;
      }

      const cooperate = getCooperate();
      if (!cooperate) {
        if (retryCount < AUTO_JOIN_MAX_RETRIES) {
          retryCount++;
          timers.push(setTimeout(tryJoin, AUTO_JOIN_RETRY_INTERVAL));
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
            joinResolved = true;
            cleanup();
            editorStore.setCollaborationState({ isInCollaboration: true, workId });

            // Sync drawingId, projectId, fileName, libraryKey from work_data
            const mxCooperate = getCooperate();
            if (!mxCooperate) return;
            mxCooperate.getWorks((workList: { work_id: number; work_data: string }[]) => {
              const joined = workList.find((w: { work_id: number }) => w.work_id === workId);
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
          } else if (iRet < 0) {
            // SDK busy, retry
            if (!cancelled && retryCount < AUTO_JOIN_MAX_RETRIES) {
              retryCount++;
              timers.push(setTimeout(tryJoin, AUTO_JOIN_RETRY_INTERVAL));
            } else {
              joinResolved = true;
              cleanup();
              showToast(t('加入协同超时'));
              editorStore.setCollabShareState({ fromCollabShare: false, targetWorkId: null });
            }
          } else if (iRet === 5) {
            joinResolved = true;
            cleanup();
            showToast(t('该协同已关闭，链接已失效'));
            editorStore.setCollabShareState({ fromCollabShare: false, targetWorkId: null });
          } else {
            joinResolved = true;
            cleanup();
            showToast(`加入协同失败，错误码: ${iRet}`);
            editorStore.setCollabShareState({ fromCollabShare: false, targetWorkId: null });
          }
        },
        userData.id,
        encodeUserData(userData),
      );
    };

    timers.push(setTimeout(tryJoin, AUTO_JOIN_INITIAL_DELAY));
    return cleanup;
  }

  return { startAutoJoin };
}
