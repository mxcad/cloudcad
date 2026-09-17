import { handleError } from '@/utils/errorHandler';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { getFileInfo } from './mxcadHelpers';
import { isCadEditorEntry } from '@/utils/cadEditorRoute';
import {
  confirmExitCollaborationIfNeeded,
  checkAndConfirmUnsavedChanges,
} from './mxcadCollaboration';

const NAVIGATION_PATHS = {
  PROJECTS_LIST: '/projects',
  PROJECT_FILES: (projectId: string) => `/projects/${projectId}/files`,
  PROJECT_FOLDER: (projectId: string, parentId: string) =>
    `/projects/${projectId}/files/${parentId}`,
  PERSONAL_SPACE: '/personal-space',
  PERSONAL_SPACE_FOLDER: (parentId: string) => `/personal-space/${parentId}`,
  LIBRARY_DRAWING: '/library/drawing',
  LIBRARY_BLOCK: '/library/block',
  LIBRARY_DRAWING_FOLDER: (parentId: string) => `/library/drawing/${parentId}`,
  LIBRARY_BLOCK_FOLDER: (parentId: string) => `/library/block/${parentId}`,
} as const;

function hasLibraryPermission(type: 'drawing' | 'block'): boolean {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    const userData = JSON.parse(userStr);
    const permissions = userData?.role?.permissions || [];
    const permStrings = permissions.map((p: string | { permission: string }) =>
      typeof p === 'string' ? p : p.permission
    );
    const required =
      type === 'drawing' ? 'LIBRARY_DRAWING_MANAGE' : 'LIBRARY_BLOCK_MANAGE';
    return permStrings.includes(required);
  } catch {
    return false;
  }
}

function calculateReturnPath(
  parentId: string | null | undefined,
  projectId: string | null | undefined,
  personalSpaceId: string | null | undefined,
  libraryKey: 'drawing' | 'block' | null | undefined
): string {
  if (libraryKey === 'drawing') {
    if (!hasLibraryPermission('drawing')) return NAVIGATION_PATHS.PROJECTS_LIST;
    if (parentId) return NAVIGATION_PATHS.LIBRARY_DRAWING_FOLDER(parentId);
    return NAVIGATION_PATHS.LIBRARY_DRAWING;
  }
  if (libraryKey === 'block') {
    if (!hasLibraryPermission('block')) return NAVIGATION_PATHS.PROJECTS_LIST;
    if (parentId) return NAVIGATION_PATHS.LIBRARY_BLOCK_FOLDER(parentId);
    return NAVIGATION_PATHS.LIBRARY_BLOCK;
  }
  const isPersonalSpace =
    projectId && personalSpaceId && projectId === personalSpaceId;
  if (isPersonalSpace) {
    if (parentId && parentId !== personalSpaceId)
      return NAVIGATION_PATHS.PERSONAL_SPACE_FOLDER(parentId);
    return NAVIGATION_PATHS.PERSONAL_SPACE;
  }
  if (parentId && projectId)
    return NAVIGATION_PATHS.PROJECT_FOLDER(projectId, parentId);
  if (parentId) return NAVIGATION_PATHS.PROJECT_FILES(parentId);
  if (projectId) return NAVIGATION_PATHS.PROJECT_FILES(projectId);
  return NAVIGATION_PATHS.PROJECTS_LIST;
}

export const returnToCloudMapManagement = async () => {
  const collabOk = await confirmExitCollaborationIfNeeded();
  if (!collabOk) return;
  const canProceed = await checkAndConfirmUnsavedChanges();
  if (!canProceed) return;
  try {
    const { openedBackUrl, openedInitialFileId } = useCADEditorStore.getState();
    const fileInfo = getFileInfo();
    const currentFileId = fileInfo?.fileId;
    let targetPath: string;
    if (
      openedBackUrl &&
      !isCadEditorEntry(openedBackUrl) &&
      openedInitialFileId &&
      currentFileId === openedInitialFileId
    ) {
      targetPath = openedBackUrl;
    } else if (fileInfo) {
      targetPath = calculateReturnPath(
        fileInfo.parentId,
        fileInfo.projectId,
        fileInfo.personalSpaceId,
        fileInfo.libraryKey
      );
    } else {
      targetPath = NAVIGATION_PATHS.PROJECTS_LIST;
    }
    window.open(targetPath, '_blank');
  } catch (error) {
    handleError(error, 'mxcadManager: returnToCloudMapManagement');
    window.open(NAVIGATION_PATHS.PROJECTS_LIST, '_blank');
  }
};