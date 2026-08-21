export type SortField = 'createdAt' | 'expiresAt' | 'usedCount';

export type SortOrder = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  order: SortOrder;
}

export interface ShareFileInfo {
  fileId: string;
  fileName: string;
}
