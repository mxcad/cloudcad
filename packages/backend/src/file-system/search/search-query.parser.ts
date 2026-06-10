import { SearchType } from '../dto/search.dto';

export interface ParsedSearchQuery {
  keyword: string;
  exactPhrase: string | null;
  extension: string | null;
  type: SearchType;
  fileStatus: string | null;
  dateRange: {
    field: 'createdAt' | 'updatedAt';
    operator: '>' | '<' | '>=';
    value: Date;
  } | null;
  sizeRange: {
    operator: '>' | '<';
    value: number;
  } | null;
  sortBy: string | null;
  sortOrder: 'asc' | 'desc' | null;
  excludeTerms: string[];
  hasSyntax: boolean;
}

export function parseSearchQuery(input: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = {
    keyword: '',
    exactPhrase: null,
    extension: null,
    type: SearchType.ALL,
    fileStatus: null,
    dateRange: null,
    sizeRange: null,
    sortBy: null,
    sortOrder: null,
    excludeTerms: [],
    hasSyntax: false,
  };

  if (!input || !input.trim()) return result;

  const tokens = tokenize(input);
  const plainTokens: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    // Exact phrase: "something"
    if (token.startsWith('"') && token.endsWith('"') && token.length >= 2) {
      result.exactPhrase = token.slice(1, -1);
      result.hasSyntax = true;
      i++;
      continue;
    }

    // Exclusion: -term
    if (token.startsWith('-') && token.length > 1) {
      result.excludeTerms.push(token.slice(1));
      result.hasSyntax = true;
      i++;
      continue;
    }

    // Key:value syntax
    const colonIdx = token.indexOf(':');
    if (colonIdx > 0) {
      const key = token.slice(0, colonIdx).toLowerCase();
      const value = token.slice(colonIdx + 1);

      if (tryParseFilter(result, key, value)) {
        result.hasSyntax = true;
        i++;
        continue;
      }
    }

    plainTokens.push(token);
    i++;
  }

  result.keyword = plainTokens.join(' ');
  return result;
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const ch of input) {
    if (ch === ' ') {
      if (inQuotes) {
        current += ch;
      } else if (current) {
        tokens.push(current);
        current = '';
      }
    } else if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);

  return tokens;
}

function tryParseFilter(
  result: ParsedSearchQuery,
  key: string,
  value: string,
): boolean {
  switch (key) {
    case 'ext':
    case 'extension':
      result.extension = value.startsWith('.') ? value : `.${value}`;
      return true;

    case 'type':
      if (value === 'file') {
        result.type = SearchType.FILE;
      } else if (value === 'folder' || value === 'dir') {
        result.type = SearchType.FOLDER;
      }
      return true;

    case 'status':
    case 'state':
      result.fileStatus = value.toUpperCase();
      return true;

    case 'modified':
    case 'updated':
    case 'mtime':
      return parseDateFilter(result, 'updatedAt', value);

    case 'created':
    case 'ctime':
      return parseDateFilter(result, 'createdAt', value);

    case 'size':
      return parseSizeFilter(result, value);

    case 'sort':
      return parseSortFilter(result, value);

    default:
      return false;
  }
}

function parseDateFilter(
  result: ParsedSearchQuery,
  field: 'createdAt' | 'updatedAt',
  value: string,
): boolean {
  const match = value.match(/^([><]=?)(.+)$/);
  if (!match) return false;
  const [, op, dateStr] = match;
  const operator = op as '>' | '<' | '>=';

  const date = parseDate(dateStr.trim());
  if (!date) return false;

  result.dateRange = { field, operator, value: date };
  return true;
}

function parseDate(input: string): Date | null {
  // ISO date
  const iso = new Date(input);
  if (!isNaN(iso.getTime())) return iso;

  // Relative dates
  const now = new Date();
  const relMatch = input.match(/^(-?\d+)([dwmoy])$/);
  if (relMatch) {
    const num = parseInt(relMatch[1], 10);
    const unit = relMatch[2];
    const d = new Date(now);
    switch (unit) {
      case 'd': d.setDate(d.getDate() + num); break;
      case 'w': d.setDate(d.getDate() + num * 7); break;
      case 'm': d.setMonth(d.getMonth() + num); break;
      case 'o': d.setMonth(d.getMonth() + num); break;
      case 'y': d.setFullYear(d.getFullYear() + num); break;
    }
    return d;
  }

  // Chinese relative: 今天, 昨天, 本周, 上周, 本月, 上月
  const cnMap: Record<string, () => Date> = {
    '今天': () => new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    '昨天': () => new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
    '本周': () => {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay());
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    },
    '上周': () => {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay() - 7);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    },
    '本月': () => new Date(now.getFullYear(), now.getMonth(), 1),
    '上月': () => new Date(now.getFullYear(), now.getMonth() - 1, 1),
  };

  if (cnMap[input]) return cnMap[input]();

  return null;
}

function parseSizeFilter(result: ParsedSearchQuery, value: string): boolean {
  const match = value.match(/^([><]=?)(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) return false;
  const [, op, numStr, unit] = match;
  const num = parseFloat(numStr);
  const operator = op as '>' | '<';

  let bytes = num;
  switch ((unit || 'B').toUpperCase()) {
    case 'KB': bytes = num * 1024; break;
    case 'MB': bytes = num * 1024 * 1024; break;
    case 'GB': bytes = num * 1024 * 1024 * 1024; break;
    case 'TB': bytes = num * 1024 * 1024 * 1024 * 1024; break;
  }

  result.sizeRange = { operator, value: Math.round(bytes) };
  return true;
}

function parseSortFilter(result: ParsedSearchQuery, value: string): boolean {
  const parts = value.split('-');
  const allowedSortFields = ['name', 'createdAt', 'updatedAt', 'size'];
  if (allowedSortFields.includes(parts[0])) {
    result.sortBy = parts[0];
    result.sortOrder = parts[1] === 'asc' ? 'asc' : 'desc';
    return true;
  }
  return false;
}
