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

export type CollaborateWorkData = CollaborateWorkDataV1 | CollaborateWorkDataV2;

export interface CollaborateUserData {
  v: 1;
  id: string;
  name: string;
  avatar?: string;
}

function tryParseRawJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function tryBase64Decode(raw: string): string | null {
  try {
    return atob(raw);
  } catch {
    return null;
  }
}

export function encodeWorkData(data: CollaborateWorkData): string {
  return btoa(JSON.stringify(data));
}

export function encodeUserData(data: CollaborateUserData): string {
  return btoa(JSON.stringify(data));
}

export function encodeV2WorkData(data: Omit<CollaborateWorkDataV2, 'v'>): string {
  return btoa(JSON.stringify({ v: 2, ...data }));
}

export function parseWorkData(raw: string): CollaborateWorkData | null {
  const decoded = tryBase64Decode(raw);
  const parsed = tryParseRawJson(raw) ?? (decoded ? tryParseRawJson(decoded) : null);
  if (!parsed || typeof parsed.drawingId !== 'string') return null;
  if (parsed.v === 1 || parsed.v === 2) {
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
  if (data.v === 2) {
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
