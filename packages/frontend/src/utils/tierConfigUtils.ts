import { t } from '@/languages';

export interface ConfigRegistryEntry {
  id: string;
  key: string;
  type: 'number' | 'bool';
  label: string;
  defaultValue: unknown;
  description: string | null;
  sortOrder: number;
}

export type RegistryMap = Map<string, ConfigRegistryEntry>;

export function buildRegistryMap(entries: ConfigRegistryEntry[]): RegistryMap {
  const map = new Map<string, ConfigRegistryEntry>();
  for (const entry of entries) {
    map.set(entry.key, entry);
  }
  return map;
}

export function getConfigLabel(registry: RegistryMap, key: string): string {
  const label = registry.get(key)?.label ?? key;
  return t(label);
}

type FormatStyle = 'full' | 'short';

const QUOTA_FORMATTERS: Record<
  string,
  (v: number, style: FormatStyle) => string
> = {
  'quota.personal_storage_mb': (v) =>
    v >= 1024
      ? t('{size}GB', { size: (v / 1024).toFixed(v % 1024 === 0 ? 0 : 1) })
      : t('{size}MB', { size: String(v) }),
  'quota.max_projects': (v, style) =>
    style === 'short'
      ? t('{count}个', { count: String(v) })
      : t('{count} 个', { count: String(v) }),
  'quota.project_size_mb': (v) => t('{size}MB', { size: String(v) }),
  'quota.conversion_window_count': (v, style) => {
    const suffix = style === 'short' ? '' : ' ';
    return v >= 1000
      ? t('{count}{s}千次/窗口', {
          count: (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1),
          s: suffix,
        })
      : t('{count}{s}次/窗口', { count: String(v), s: suffix });
  },
  'quota.conversion_window_hours': (v) =>
    t('{hours} 小时/窗口', { hours: String(v) }),
};

function formatQuota(key: string, value: unknown, style: FormatStyle): string {
  const v = Number(value) || 0;
  const fmt = QUOTA_FORMATTERS[key];
  return fmt ? fmt(v, style) : String(v);
}

export function formatConfigValue(key: string, value: unknown): string {
  return formatQuota(key, value, 'full');
}

export function formatConfigValueShort(key: string, value: unknown): string {
  return formatQuota(key, value, 'short');
}

const KEY_ALIASES: Record<string, string> = {
  maxStorage: 'quota.personal_storage_mb',
  maxProjects: 'quota.max_projects',
  maxCollaborators: 'quota.max_collaborators',
  versionHistoryDays: 'quota.version_history_days',
  projectSizeMb: 'quota.project_size_mb',
  conversionWindowCount: 'quota.conversion_window_count',
  conversionWindowHours: 'quota.conversion_window_hours',
};

export function resolveConfigKey(key: string): string {
  return KEY_ALIASES[key] ?? key;
}

const STORAGE_CONFIG_KEYS = new Set([
  'quota.personal_storage_mb',
  'quota.project_size_mb',
]);

export function isStorageConfigKey(key: string): boolean {
  return STORAGE_CONFIG_KEYS.has(resolveConfigKey(key));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)}${units[i]!}`;
}
