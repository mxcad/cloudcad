import { ref, readonly, onMounted, onBeforeUnmount } from 'vue';
import { MxCpp } from 'mxcad';
import { showToast } from 'vant';
import { useEditorState } from './useEditorState';
import { fileSystemControllerGetNode, fileSystemControllerGetProjects } from '../api-sdk';

const APP_COOPERATE_URL = import.meta.env.VITE_APP_COOPERATE_URL || '/api/cooperate';

// --- Types (aligned with PC packages/frontend/src/types/collaboration.ts) ---

export interface CollaborateWorkDataV1 {
  v: 1;
  drawingId: string;
  projectId: string | null;
}

export interface CollaborateWorkDataV2 {
  v: 2;
  drawingId: string;
  projectId: string | null;
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
}

export interface CollaborateWorkDataV3 {
  v: 3;
  drawingId: string;
  projectId: string | null;
  drawingName: string;
  sourceType: 'my' | 'project' | 'library' | 'local' | 'share';
  libraryKey?: 'drawing' | 'block';
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
}

export type CollaborateWorkData = CollaborateWorkDataV1 | CollaborateWorkDataV2 | CollaborateWorkDataV3;

export interface CollaborateUserData {
  v: 1;
  id: string;
  name: string;
  avatar?: string;
}

export interface Work {
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

// --- Encoding/Decoding (aligned with PC) ---

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToUtf8(raw: string): string {
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function tryBase64Decode(raw: string): string | null {
  try {
    return base64ToUtf8(raw);
  } catch {
    return null;
  }
}

function tryParseRawJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function encodeWorkData(data: CollaborateWorkData): string {
  return utf8ToBase64(JSON.stringify(data));
}

export function encodeUserData(data: CollaborateUserData): string {
  return utf8ToBase64(JSON.stringify(data));
}

export function encodeV3WorkData(data: Omit<CollaborateWorkDataV3, 'v'>): string {
  return utf8ToBase64(JSON.stringify({ v: 3, ...data }));
}

export function parseWorkData(raw: string): CollaborateWorkData | null {
  const decoded = tryBase64Decode(raw);
  const parsed = tryParseRawJson(raw) ?? (decoded ? tryParseRawJson(decoded) : null);
  if (!parsed || typeof parsed.drawingId !== 'string') return null;
  if (parsed.v === 1 || parsed.v === 2 || parsed.v === 3) {
    return parsed as unknown as CollaborateWorkData;
  }
  return null;
}

export function parseUserData(raw: string): CollaborateUserData | null {
  const decoded = tryBase64Decode(raw);
  const parsed = tryParseRawJson(raw) ?? (decoded ? tryParseRawJson(decoded) : null);
  if (parsed && parsed.v === 1 && typeof parsed.id === 'string') {
    return parsed as unknown as CollaborateUserData;
  }
  return null;
}

export function getWorkCreator(data: CollaborateWorkData): { id?: string; name?: string; avatar?: string } {
  if (data.v === 2 || data.v === 3) {
    return { id: data.creatorId, name: data.creatorName, avatar: data.creatorAvatar };
  }
  return {};
}

export function deduplicateWorkUsers(
  linkUserIds: string[],
  linkUserData: string[]
): { linkUserIds: string[]; linkUserData: string[] } {
  const seen = new Set<string>();
  const ids: string[] = [];
  const data: string[] = [];
  const len = Math.min(linkUserData.length, linkUserIds.length);

  if (linkUserData.length !== linkUserIds.length) {
    console.warn('[collaboration] link_user_data length mismatch', linkUserData.length, linkUserIds.length);
  }

  for (let i = 0; i < len; i++) {
    const raw = linkUserData[i];
    const rawId = linkUserIds[i];
    if (!raw || !rawId) continue;
    const userData = parseUserData(raw);
    const userId = userData?.id ?? rawId;
    if (userId && !seen.has(userId)) {
      seen.add(userId);
      ids.push(rawId);
      data.push(raw);
    }
  }

  return { linkUserIds: ids, linkUserData: data };
}

// --- Internal state ---

const isCadReady = ref(false);
const works = ref<Work[]>([]);
const currentWorkId = ref<number | null>(null);
const loading = ref(false);
const connecting = ref(false);

// Concurrent guards (aligned with PC CollaborateSidebar)
const joiningLockRef = { current: false };
export const exitGuardRef = { current: false };

// Name resolution caches
const fileNameCache = ref<Record<string, string>>({});
const projectNameCache = ref<Record<string, string>>({});
const myProjectIds = ref<string[]>([]);

let cadCheckTimer: ReturnType<typeof setInterval> | null = null;
let cooperateInit = false;

export function getCooperate() {
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
    const resolvedProjects: ProjectCacheEntry[] = [];

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

  function createWork(userData?: { id: string; name: string; avatar?: string }) {
    if (connecting.value) return;
    connecting.value = true;

    // 如果已在协同中，先退出（与 PC 对齐）
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
        const ed = useEditorState();
        ed.setCollaborationState({ isInCollaboration: true, workId: workid });
        showToast('协同已创建');
        fetchWorks();
      } else {
        const errorCode = -workid;
        showToast(errorCode === 4 ? '已在协同中' : `创建协同失败，错误码: ${errorCode}`);
      }
    };

    // Build V3 work data
    const { fileId, projectId, fileName, isPersonalSpace, fromCollabShare } = state;
    const drawingName = fileName || '未命名图纸';
    let sourceType: CollaborateWorkDataV3['sourceType'] = 'my';
    let libraryKey: 'drawing' | 'block' | undefined;

    if (!fileId) {
      sourceType = 'local';
    } else if (fromCollabShare) {
      sourceType = 'share';
    } else if (isPersonalSpace) {
      sourceType = 'my';
    } else if (projectId) {
      sourceType = 'project';
    } else {
      sourceType = 'local';
    }

    const workDataPayload = encodeV3WorkData({
      drawingId: fileId || '',
      projectId: (sourceType === 'my' || sourceType === 'local') ? null : (projectId ?? null),
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

  function internalExitWork(): boolean {
    const cooperate = getCooperate();
    if (cooperate) {
      const ret = cooperate.exitWrok();
      if (ret !== 0) return false;
    }
    currentWorkId.value = null;
    const ed = useEditorState();
    ed.setCollaborationState({ isInCollaboration: false, workId: null });
    return true;
  }

  function joinWork(workId: number, userData?: { id: string; name: string; avatar?: string }) {
    // 并发锁（与 PC joiningLockRef 对齐）
    if (joiningLockRef.current) return;
    joiningLockRef.current = true;

    // 如果在不同协同中，先退出
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
          const ed = useEditorState();
          ed.setCollaborationState({ isInCollaboration: true, workId });
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
    // 设置退出守卫，防自动加入干扰（与 PC exitGuardRef 对齐）
    exitGuardRef.current = true;
    setTimeout(() => { exitGuardRef.current = false; }, 3000);

    currentWorkId.value = null;
    const ed = useEditorState();
    ed.setCollaborationState({ isInCollaboration: false, workId: null });
    showToast('已退出协同');
    fetchWorks();
  }

  return {
    isCadReady: readonly(isCadReady),
    works: readonly(works),
    currentWorkId: readonly(currentWorkId),
    loading: readonly(loading),
    connecting: readonly(connecting),
    fileNameCache: readonly(fileNameCache),
    projectNameCache: readonly(projectNameCache),
    myProjectIds: readonly(myProjectIds),
    fetchWorks,
    createWork,
    joinWork,
    exitWork,
    resolveNames,
  };
}

export function exitCollaborationIfNeeded(): void {
  try {
    const cooperate = getCooperate();
    if (!cooperate) return;
    const ret = cooperate.exitWrok();
    if (ret === 0) {
      useEditorState().setCollaborationState({ isInCollaboration: false, workId: null });
    }
  } catch {
    // ignore
  }
}
