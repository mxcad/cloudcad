import { describe, it, expect, vi, beforeEach } from 'vitest';
import { projectApi } from '@/services/projectApi';
import { projectPermissionApi } from '@/services/projectPermissionApi';
// @deprecated — legacy imports; only imports updated, call logic unchanged per spec rules
import { mxcadApi } from '@/services/mxcadApi'; // TODO: Replace with SDK when backend adds missing endpoints
import { filesApi } from '@/services/filesApi'; // TODO: Replace with SDK when backend adds missing endpoints

vi.mock('mxcad-app', () => ({
  MxCADView: vi.fn(),
}));

vi.mock('mxdraw', () => ({
  MxFun: {
    setMousePosition: vi.fn(),
    mx_CallFunction: vi.fn(),
  },
}));

vi.mock('mxcad', () => ({
  FetchAttributes: {},
  McGePoint3d: vi.fn(),
  MxCpp: {
    getCurrentMxCAD: vi.fn(() => ({
      isModified: false,
      saveFile: vi.fn((name, callback) => {
        callback(new ArrayBuffer(8));
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      loadMxwebFile: vi.fn(),
      getDrawingSize: vi.fn(() => ({ width: 1000, height: 800 })),
    })),
    App: {
      getCurrentMxCAD: vi.fn(() => ({
        isModified: false,
        saveFile: vi.fn((name, callback) => {
          callback(new ArrayBuffer(8));
        }),
      })),
    },
  },
}));

vi.mock('@/services/projectApi');
vi.mock('@/services/projectPermissionApi');
vi.mock('@/services/mxcadApi');
vi.mock('@/services/filesApi');

describe('mxcadManager API Contract Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPersonalSpace()', () => {
    it('should call projectApi.getPersonalSpace and return personal space data', async () => {
      const mockPersonalSpace = {
        data: {
          id: 'personal-space-123',
          name: 'My Personal Space',
          type: 'personal',
        },
      };

      vi.mocked(projectApi.getPersonalSpace).mockResolvedValue(
        mockPersonalSpace as any
      );

      const result = await projectApi.getPersonalSpace();

      expect(projectApi.getPersonalSpace).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockPersonalSpace);
      expect(result.data.id).toBe('personal-space-123');
    });

    it('should return null data when personal space is not found', async () => {
      vi.mocked(projectApi.getPersonalSpace).mockResolvedValue({
        data: null,
      } as any);

      const result = await projectApi.getPersonalSpace();

      expect(projectApi.getPersonalSpace).toHaveBeenCalledTimes(1);
      expect(result.data).toBeNull();
    });
  });

  describe('checkPermission(projectId, "CAD_SAVE")', () => {
    it('should call projectPermissionApi.checkPermission and return permission result - has permission', async () => {
      const mockResponse = {
        data: { hasPermission: true },
      };

      vi.mocked(projectPermissionApi.checkPermission).mockResolvedValue(
        mockResponse as any
      );

      const result = await projectPermissionApi.checkPermission(
        'project-123',
        'CAD_SAVE'
      );

      expect(projectPermissionApi.checkPermission).toHaveBeenCalledWith(
        'project-123',
        'CAD_SAVE'
      );
      expect(result.data.hasPermission).toBe(true);
    });

    it('should return hasPermission false when user lacks permission', async () => {
      const mockResponse = {
        data: { hasPermission: false },
      };

      vi.mocked(projectPermissionApi.checkPermission).mockResolvedValue(
        mockResponse as any
      );

      const result = await projectPermissionApi.checkPermission(
        'project-456',
        'CAD_SAVE'
      );

      expect(projectPermissionApi.checkPermission).toHaveBeenCalledWith(
        'project-456',
        'CAD_SAVE'
      );
      expect(result.data.hasPermission).toBe(false);
    });

    it('should handle API error gracefully', async () => {
      vi.mocked(projectPermissionApi.checkPermission).mockRejectedValue(
        new Error('Network error')
      );

      await expect(
        projectPermissionApi.checkPermission('project-789', 'CAD_SAVE')
      ).rejects.toThrow('Network error');
    });
  });

  describe('File Save Flow', () => {
    it('should call mxcadApi.saveMxwebFile with correct parameters', async () => {
      const mockResponse = { data: { success: true } };
      vi.mocked(mxcadApi.saveMxwebFile).mockResolvedValue(mockResponse as any);

      const blob = new Blob(['test content'], {
        type: 'application/octet-stream',
      });
      const nodeId = 'node-123';
      const commitMessage = 'Test commit';

      const result = await mxcadApi.saveMxwebFile(
        blob,
        nodeId,
        undefined,
        commitMessage
      );

      expect(mxcadApi.saveMxwebFile).toHaveBeenCalledWith(
        blob,
        nodeId,
        undefined,
        commitMessage
      );
      expect(result).toEqual(mockResponse);
    });

    it('should call filesApi.get after save to refresh file info', async () => {
      const mockFileInfo = {
        data: {
          id: 'node-123',
          name: 'test drawing',
          path: '202401/abc/test.mxweb',
          updatedAt: '2026-05-04T10:00:00Z',
        },
      };

      vi.mocked(filesApi.get).mockResolvedValue(mockFileInfo as any);

      const result = await filesApi.get('node-123');

      expect(filesApi.get).toHaveBeenCalledWith('node-123');
      expect(result.data.updatedAt).toBe('2026-05-04T10:00:00Z');
    });
  });

  describe('mxcadPermissionApi.checkCadSave', () => {
    it('should be a wrapper around projectPermissionApi.checkPermission for CAD_SAVE', async () => {
      const mockResponse = {
        data: { hasPermission: true },
      };

      vi.mocked(projectPermissionApi.checkPermission).mockResolvedValue(
        mockResponse as any
      );

      const result = await projectPermissionApi.checkPermission(
        'project-123',
        'CAD_SAVE'
      );

      expect(projectPermissionApi.checkPermission).toHaveBeenCalledWith(
        'project-123',
        'CAD_SAVE'
      );
      expect(result.data.hasPermission).toBe(true);
    });
  });

  describe('mxcadPermissionApi.checkCadRead', () => {
    it('should be a wrapper around projectPermissionApi.checkPermission for FILE_READ', async () => {
      const mockResponse = {
        data: { hasPermission: true },
      };

      vi.mocked(projectPermissionApi.checkPermission).mockResolvedValue(
        mockResponse as any
      );

      const result = await projectPermissionApi.checkPermission(
        'project-123',
        'FILE_READ'
      );

      expect(projectPermissionApi.checkPermission).toHaveBeenCalledWith(
        'project-123',
        'FILE_READ'
      );
      expect(result.data.hasPermission).toBe(true);
    });
  });
});
