import { describe, it, expect } from 'vitest';
import {
  formatFileSize,
  getFileIcon,
  formatDate,
  isCadFile,
  isImageFile,
  isPdfFile,
  getThumbnailUrl,
  getCadThumbnailUrl,
  getOriginalFileUrl,
} from './fileUtils';
import { FileSystemNode } from '../types/filesystem';

describe('fileUtils', () => {
  describe('formatFileSize', () => {
    it('should return "-" for null or undefined', () => {
      expect(formatFileSize(null)).toBe('-');
      expect(formatFileSize(undefined)).toBe('-');
      expect(formatFileSize(0)).toBe('-');
    });

    it('should format bytes correctly', () => {
      expect(formatFileSize(100)).toBe('100 B');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('should format with 2 decimal places', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(2048)).toBe('2 KB');
    });

    it('should handle large files', () => {
      expect(formatFileSize(1024 * 1024 * 1024 * 5)).toBe('5 GB');
    });
  });

  describe('getFileIcon', () => {
    it('should return folder icon for folders', () => {
      const folder: FileSystemNode = {
        id: '1',
        name: 'Test Folder',
        isFolder: true,
        extension: null,
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(getFileIcon(folder)).toBe('📁');
    });

    it('should return CAD icons for CAD files', () => {
      const dwgFile: FileSystemNode = {
        id: '1',
        name: 'test.dwg',
        isFolder: false,
        extension: '.dwg',
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(getFileIcon(dwgFile)).toBe('📐');

      const dxfFile: FileSystemNode = {
        id: '2',
        name: 'test.dxf',
        isFolder: false,
        extension: '.dxf',
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(getFileIcon(dxfFile)).toBe('📏');
    });

    it('should return PDF icon for PDF files', () => {
      const pdfFile: FileSystemNode = {
        id: '1',
        name: 'test.pdf',
        isFolder: false,
        extension: '.pdf',
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(getFileIcon(pdfFile)).toBe('📄');
    });

    it('should return image icon for image files', () => {
      const pngFile: FileSystemNode = {
        id: '1',
        name: 'test.png',
        isFolder: false,
        extension: '.png',
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(getFileIcon(pngFile)).toBe('🖼️');

      const jpgFile: FileSystemNode = {
        id: '2',
        name: 'test.jpg',
        isFolder: false,
        extension: '.jpg',
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(getFileIcon(jpgFile)).toBe('🖼️');
    });

    it('should return default icon for unknown files', () => {
      const txtFile: FileSystemNode = {
        id: '1',
        name: 'test.txt',
        isFolder: false,
        extension: '.txt',
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(getFileIcon(txtFile)).toBe('📄');
    });

    it('should handle case insensitive extensions', () => {
      const upperCaseFile: FileSystemNode = {
        id: '1',
        name: 'test.DWG',
        isFolder: false,
        extension: '.DWG',
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(getFileIcon(upperCaseFile)).toBe('📐');
    });
  });

  describe('formatDate', () => {
    it('should format date to Chinese locale', () => {
      const dateString = '2024-01-15T10:30:00.000Z';
      const formatted = formatDate(dateString);

      // Should include year, month, day, hour, minute
      expect(formatted).toContain('2024');
      expect(formatted).toContain(':'); // Time separator
    });

    it('should handle invalid date', () => {
      const formatted = formatDate('invalid-date');
      expect(formatted).toBe('Invalid Date');
    });
  });

  describe('isCadFile', () => {
    it('should return true for CAD extensions', () => {
      expect(isCadFile('.dwg')).toBe(true);
      expect(isCadFile('.dxf')).toBe(true);
      expect(isCadFile('.DWG')).toBe(true);
      expect(isCadFile('.DXF')).toBe(true);
    });

    it('should return false for non-CAD extensions', () => {
      expect(isCadFile('.pdf')).toBe(false);
      expect(isCadFile('.png')).toBe(false);
      expect(isCadFile('.txt')).toBe(false);
    });

    it('should return false for null or undefined', () => {
      expect(isCadFile(null)).toBe(false);
      expect(isCadFile(undefined)).toBe(false);
    });
  });

  describe('isImageFile', () => {
    it('should return true for image extensions', () => {
      expect(isImageFile('.png')).toBe(true);
      expect(isImageFile('.jpg')).toBe(true);
      expect(isImageFile('.jpeg')).toBe(true);
      expect(isImageFile('.gif')).toBe(true);
      expect(isImageFile('.bmp')).toBe(true);
      expect(isImageFile('.webp')).toBe(true);
    });

    it('should return false for non-image extensions', () => {
      expect(isImageFile('.pdf')).toBe(false);
      expect(isImageFile('.dwg')).toBe(false);
      expect(isImageFile('.txt')).toBe(false);
    });

    it('should return false for null or undefined', () => {
      expect(isImageFile(null)).toBe(false);
      expect(isImageFile(undefined)).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isImageFile('.PNG')).toBe(true);
      expect(isImageFile('.JPG')).toBe(true);
    });
  });

  describe('isPdfFile', () => {
    it('should return true for PDF extension', () => {
      expect(isPdfFile('.pdf')).toBe(true);
      expect(isPdfFile('.PDF')).toBe(true);
    });

    it('should return false for non-PDF extensions', () => {
      expect(isPdfFile('.png')).toBe(false);
      expect(isPdfFile('.dwg')).toBe(false);
      expect(isPdfFile('.txt')).toBe(false);
    });

    it('should return false for null or undefined', () => {
      expect(isPdfFile(null)).toBe(false);
      expect(isPdfFile(undefined)).toBe(false);
    });
  });

  describe('getThumbnailUrl', () => {
    it('should return empty string for non-image files', () => {
      const cadFile: FileSystemNode = {
        id: '1',
        name: 'test.dwg',
        isFolder: false,
        extension: '.dwg',
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(getThumbnailUrl(cadFile)).toBe('');
    });

    it('should return thumbnail URL for image files', () => {
      const imageFile: FileSystemNode = {
        id: '1',
        name: 'test.png',
        isFolder: false,
        extension: '.png',
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const url = getThumbnailUrl(imageFile);
      expect(url).toContain('/file-system/nodes/1/thumbnail');
    });

    it('should return empty string when node has no id', () => {
      const imageFile: FileSystemNode = {
        id: '',
        name: 'test.png',
        isFolder: false,
        extension: '.png',
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(getThumbnailUrl(imageFile)).toBe('');
    });
  });

  describe('getCadThumbnailUrl', () => {
    it('should return empty string for non-CAD files', () => {
      const imageFile: FileSystemNode = {
        id: '1',
        name: 'test.png',
        isFolder: false,
        extension: '.png',
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(getCadThumbnailUrl(imageFile)).toBe('');
    });

    it('should return thumbnail URL for CAD files', () => {
      const cadFile: FileSystemNode = {
        id: '1',
        name: 'test.dwg',
        isFolder: false,
        extension: '.dwg',
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const url = getCadThumbnailUrl(cadFile);
      expect(url).toContain('/file-system/nodes/1/thumbnail');
    });

    it('should return empty string when node has no id', () => {
      const cadFile: FileSystemNode = {
        id: '',
        name: 'test.dwg',
        isFolder: false,
        extension: '.dwg',
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(getCadThumbnailUrl(cadFile)).toBe('');
    });
  });

  describe('getOriginalFileUrl', () => {
    it('should return thumbnail URL for CAD files', () => {
      const cadFile: FileSystemNode = {
        id: '1',
        name: 'test.dwg',
        isFolder: false,
        extension: '.dwg',
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const url = getOriginalFileUrl(cadFile);
      expect(url).toContain('/file-system/nodes/1/thumbnail');
    });

    it('should return download URL for image files', () => {
      const imageFile: FileSystemNode = {
        id: '1',
        name: 'test.png',
        isFolder: false,
        extension: '.png',
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const url = getOriginalFileUrl(imageFile);
      expect(url).toContain('/file-system/nodes/1/download');
    });

    it('should return empty string when node has no id', () => {
      const file: FileSystemNode = {
        id: '',
        name: 'test.dwg',
        isFolder: false,
        extension: '.dwg',
        parentId: null,
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(getOriginalFileUrl(file)).toBe('');
    });
  });
});
