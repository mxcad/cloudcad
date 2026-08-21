export function queryToChips(
  query: string
): { key: string; label: string; token: string }[] {
  const chips: { key: string; label: string; token: string }[] = [];
  const tokens = query.split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    const colonIdx = t.indexOf(':');
    if (colonIdx > 0) {
      const key = t.slice(0, colonIdx).toLowerCase();
      const value = t.slice(colonIdx + 1);
      if (key === 'ext' || key === 'extension') {
        chips.push({ key: `ext-${value}`, label: `ext:${value}`, token: t });
      }
    }
  }
  return chips;
}

export function removeToken(query: string, token: string): string {
  return query
    .split(/\s+/)
    .filter((t) => t !== token)
    .join(' ')
    .trim();
}

export function appendToken(query: string, token: string): string {
  const trimmed = query.trim();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.includes(token)) return trimmed;
  return trimmed ? `${trimmed} ${token}` : token;
}

export function hasToken(query: string, token: string): boolean {
  return query.split(/\s+/).includes(token);
}
