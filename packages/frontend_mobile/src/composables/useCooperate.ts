import { MxCpp } from 'mxcad';
import { useEditorStore } from '../stores/editor';

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

// --- Concurrent guards ---
export const exitGuardRef = { current: false };
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

export function exitCollaborationIfNeeded(): void {
  try {
    const cooperate = getCooperate();
    if (!cooperate) return;
    const ret = cooperate.exitWrok();
    if (ret === 0) {
      useEditorStore().setCollaborationState({ isInCollaboration: false, workId: null });
    }
  } catch {
    // ignore
  }
}
