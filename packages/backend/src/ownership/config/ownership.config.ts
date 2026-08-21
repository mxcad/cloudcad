export enum OwnershipQuotaType {
  PROJECT = 'PROJECT',
  PERSONAL = 'PERSONAL',
  LIBRARY = 'LIBRARY',
}

export interface OwnershipTypeConfig {
  versioning: boolean;
  hasMembers: boolean;
  quotaType: OwnershipQuotaType;
  isLibrary: boolean;
  isPersonal: boolean;
}

export const OWNERSHIP_CONFIG: Record<string, OwnershipTypeConfig> = {
  PROJECT: {
    versioning: true,
    hasMembers: true,
    quotaType: OwnershipQuotaType.PROJECT,
    isLibrary: false,
    isPersonal: false,
  },
  PERSONAL_SPACE: {
    versioning: true,
    hasMembers: false,
    quotaType: OwnershipQuotaType.PERSONAL,
    isLibrary: false,
    isPersonal: true,
  },
  LIBRARY_DRAWING: {
    versioning: false,
    hasMembers: false,
    quotaType: OwnershipQuotaType.LIBRARY,
    isLibrary: true,
    isPersonal: false,
  },
  LIBRARY_BLOCK: {
    versioning: false,
    hasMembers: false,
    quotaType: OwnershipQuotaType.LIBRARY,
    isLibrary: true,
    isPersonal: false,
  },
};

export function getOwnershipConfig(nodeType: string): OwnershipTypeConfig | null {
  return OWNERSHIP_CONFIG[nodeType] ?? null;
}
