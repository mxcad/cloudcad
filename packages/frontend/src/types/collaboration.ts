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
