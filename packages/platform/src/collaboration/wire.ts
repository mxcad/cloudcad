/**
 * 协同 wire 协议（与第三方 cooperate SDK 互操作的线上协议）——跨端唯一实现。
 *
 * 历史上 PC `types/collaboration.ts` 与移动端 `useCooperate.ts` 逐字节双写
 * 146/143 行，仅 `CollaborateUserData.v` 一处类型漂移（PC `number` vs 移动
 * 字面量 `1`）。这是线上协议，改一处漏一处 = 静默失联，收进本模块后两端
 * 共用一份。
 *
 * v 字段裁定：两端实际编码恒为 `v: 1`（PC/移动所有 encodeUserData 调用点
 * 都显式传 `v: 1`），`parseUserData` 也只接受 `v === 1`——线上数据契约就是
 * 字面量 1，PC 的 `number` 是宽松漂移，共享类型采用更精确的字面量。
 *
 * 准入四条：纯函数（btoa/atob/TextEncoder 是 Web 平台标准 API，两端均为
 * Web 应用）、不绑框架、不绑端、重复已成立（逐字节双写）。
 */

/**
 * 协同列表（在线人数来源）轮询间隔（2s）。
 *
 * 在线人数 = cooperate SDK getWorks 返回的 link_user_ids 长度，SDK 无推送
 * 通道，各端只能独立轮询——间隔越长，成员进出会话在各端收敛的时间差越大
 * （上限 = 2 × 本间隔）。30s 时不同成员间最长相差 60s，人数明显不一致，
 * 收紧到 2s 后收敛差上限约 4s。
 *
 * PC 与移动端共用此常量，勿在端包各自硬编码（历史上移动端从 8s 对齐到 30s）。
 */
export const COLLAB_WORKS_POLL_INTERVAL_MS = 2_000;

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
  /**
   * 图纸内容唯一标识（MD5）。
   * 仅 sourceType === 'local' 时使用：本地 mxweb / dwg / dxf 打开时计算，
   * 用于区分不同本地图纸的协同；云图/库/项目等以 drawingId(nodeId) 为准，不携带此字段。
   */
  fileHash?: string;
}

export type CollaborateWorkData = CollaborateWorkDataV1 | CollaborateWorkDataV2 | CollaborateWorkDataV3;

export interface CollaborateUserData {
  /** 线上数据契约恒为 1（parseUserData 也只接受 v === 1） */
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

function tryParseRawJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

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
  const len = Math.max(linkUserData.length, linkUserIds.length);

  if (linkUserData.length !== linkUserIds.length) {
    // 服务端会只回 id 不回 data（或反之）：按较长一侧遍历，缺 data 的 id
    // 仍计入人数。原先按较短一侧截断，会让只剩 1 人的会话被清零显示「0 在线」。
    console.warn('[collaboration] link_user_data length mismatch', linkUserData.length, linkUserIds.length);
  }

  for (let i = 0; i < len; i++) {
    const rawId = linkUserIds[i];
    if (!rawId) continue;
    const raw = linkUserData[i] ?? '';
    // parseUserData('') 返回 null → 回落 rawId，与 data 缺失同一路径
    const userId = parseUserData(raw)?.id ?? rawId;
    if (!seen.has(userId)) {
      seen.add(userId);
      ids.push(rawId);
      // 缺 data 时用空串占位，保持 ids[i] 与 data[i] 一一对应
      data.push(raw);
    }
  }

  return { linkUserIds: ids, linkUserData: data };
}
