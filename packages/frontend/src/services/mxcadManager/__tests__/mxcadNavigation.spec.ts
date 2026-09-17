import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/stores/useCADEditorStore', () => ({
  useCADEditorStore: { getState: vi.fn() },
}));

vi.mock('../mxcadHelpers', () => ({
  getFileInfo: vi.fn(),
}));

vi.mock('../mxcadCollaboration', () => ({
  confirmExitCollaborationIfNeeded: vi.fn(),
  checkAndConfirmUnsavedChanges: vi.fn(),
}));

import { returnToCloudMapManagement } from '../mxcadNavigation';
import { handleError } from '@/utils/errorHandler';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { getFileInfo } from '../mxcadHelpers';
import {
  confirmExitCollaborationIfNeeded,
  checkAndConfirmUnsavedChanges,
} from '../mxcadCollaboration';

const mockedOpen = vi.fn();

describe('mxcadNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('open', mockedOpen);
    (useCADEditorStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      openedBackUrl: null,
      openedInitialFileId: null,
    });
    (confirmExitCollaborationIfNeeded as unknown as ReturnType<
      typeof vi.fn
    >).mockResolvedValue(true);
    (checkAndConfirmUnsavedChanges as unknown as ReturnType<
      typeof vi.fn
    >).mockResolvedValue(true);
  });

  it('does not open a new tab when collaboration exit is declined', async () => {
    (confirmExitCollaborationIfNeeded as unknown as ReturnType<
      typeof vi.fn
    >).mockResolvedValue(false);

    await returnToCloudMapManagement();

    expect(window.open).not.toHaveBeenCalled();
  });

  it('does not open a new tab when unsaved changes are cancelled', async () => {
    (checkAndConfirmUnsavedChanges as unknown as ReturnType<
      typeof vi.fn
    >).mockResolvedValue(false);

    await returnToCloudMapManagement();

    expect(window.open).not.toHaveBeenCalled();
  });

  it('opens the project folder in a new tab for a file inside a project', async () => {
    (getFileInfo as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      fileId: 'file-1',
      parentId: 'folder-1',
      projectId: 'project-1',
      personalSpaceId: null,
      libraryKey: null,
    });

    await returnToCloudMapManagement();

    expect(window.open).toHaveBeenCalledWith(
      '/projects/project-1/files/folder-1',
      '_blank'
    );
  });

  it('opens the personal space in a new tab for a personal-space file', async () => {
    (getFileInfo as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      fileId: 'file-1',
      parentId: 'space-1',
      projectId: 'space-1',
      personalSpaceId: 'space-1',
      libraryKey: null,
    });

    await returnToCloudMapManagement();

    expect(window.open).toHaveBeenCalledWith('/personal-space', '_blank');
  });

  it('opens the drawing library in a new tab for a library file', async () => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        role: { permissions: ['LIBRARY_DRAWING_MANAGE'] },
      })
    );
    (getFileInfo as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      fileId: 'file-1',
      parentId: null,
      projectId: null,
      personalSpaceId: null,
      libraryKey: 'drawing',
    });

    await returnToCloudMapManagement();

    expect(window.open).toHaveBeenCalledWith('/library/drawing', '_blank');
  });

  it('opens the back URL instead when still on the initial file opened from a list page', async () => {
    (useCADEditorStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      openedBackUrl: '/projects/project-1/files',
      openedInitialFileId: 'file-1',
    });
    (getFileInfo as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      fileId: 'file-1',
      parentId: 'folder-1',
      projectId: 'project-1',
      personalSpaceId: null,
      libraryKey: null,
    });

    await returnToCloudMapManagement();

    expect(window.open).toHaveBeenCalledWith(
      '/projects/project-1/files',
      '_blank'
    );
  });

  it('does not send the user back into the CAD editor when back was recorded from inside the editor', async () => {
    (useCADEditorStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      openedBackUrl:
        '/cad-editor/file-1?nodeId=folder-1&v=2276&back=%2Fcad-editor%2Ffile-1%3FnodeId%3Dfolder-1',
      openedInitialFileId: 'file-1',
    });
    (getFileInfo as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      fileId: 'file-1',
      parentId: 'folder-1',
      projectId: 'project-1',
      personalSpaceId: null,
      libraryKey: null,
    });

    await returnToCloudMapManagement();

    expect(window.open).toHaveBeenCalledWith(
      '/projects/project-1/files/folder-1',
      '_blank'
    );
  });

  it('falls back to the calculated path when back was recorded but file differs', async () => {
    (useCADEditorStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      openedBackUrl: '/projects/project-1/files',
      openedInitialFileId: 'file-1',
    });
    (getFileInfo as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      fileId: 'file-2',
      parentId: 'folder-2',
      projectId: 'project-2',
      personalSpaceId: null,
      libraryKey: null,
    });

    await returnToCloudMapManagement();

    expect(window.open).toHaveBeenCalledWith(
      '/projects/project-2/files/folder-2',
      '_blank'
    );
  });

  it('opens the projects list when no file is loaded', async () => {
    (getFileInfo as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);

    await returnToCloudMapManagement();

    expect(window.open).toHaveBeenCalledWith('/projects', '_blank');
  });

  it('opens the projects list and reports errors when resolution throws', async () => {
    (getFileInfo as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw new Error('boom');
      }
    );

    await returnToCloudMapManagement();

    expect(handleError).toHaveBeenCalled();
    expect(window.open).toHaveBeenCalledWith('/projects', '_blank');
  });
});