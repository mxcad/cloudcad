export interface CollaborateWorkData {
  v: 1;
  drawingId: string;
  projectId: string | null;
}

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

export function encodeWorkData(data: CollaborateWorkData): string {
  return btoa(JSON.stringify(data));
}

export function encodeUserData(data: CollaborateUserData): string {
  return btoa(JSON.stringify(data));
}

export function parseWorkData(raw: string): CollaborateWorkData | null {
  const parsed = tryParseRawJson(raw) ?? tryParseRawJson(atob(raw));
  if (parsed && parsed.v === 1 && typeof parsed.drawingId === 'string') {
    return parsed as unknown as CollaborateWorkData;
  }
  return null;
}

export function parseUserData(raw: string): CollaborateUserData | null {
  const parsed = tryParseRawJson(raw) ?? tryParseRawJson(atob(raw));
  if (parsed && parsed.v === 1 && typeof parsed.id === 'string') {
    return parsed as unknown as CollaborateUserData;
  }
  return null;
}

export function deduplicateWorkUsers(
  linkUserIds: string[],
  linkUserData: string[]
): { linkUserIds: string[]; linkUserData: string[] } {
  const seen = new Set<string>();
  const ids: string[] = [];
  const data: string[] = [];

  for (let i = 0; i < linkUserData.length; i++) {
    const raw = linkUserData[i]!;
    const userData = parseUserData(raw);
    const userId = userData?.id ?? linkUserIds[i]!;
    if (userId && !seen.has(userId)) {
      seen.add(userId);
      ids.push(linkUserIds[i]!);
      data.push(raw);
    }
  }

  return { linkUserIds: ids, linkUserData: data };
}
