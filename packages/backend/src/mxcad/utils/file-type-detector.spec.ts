///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { FileTypeDetector } from './file-type-detector';

describe('FileTypeDetector', () => {
  // ============================================================
  // CAD file detection
  // ============================================================
  describe('CAD file detection', () => {
    it('should detect .dwg as CAD file', () => {
      expect(FileTypeDetector.isCadFile('floor-plan.dwg')).toBe(true);
    });

    it('should detect .dxf as CAD file', () => {
      expect(FileTypeDetector.isCadFile('layout.DXF')).toBe(true);
    });

    it('should detect .DWG (uppercase) as CAD file', () => {
      expect(FileTypeDetector.isCadFile('DRAWING.DWG')).toBe(true);
    });

    it('should detect CAD files regardless of path', () => {
      expect(FileTypeDetector.isCadFile('/path/to/file.dwg')).toBe(true);
    });

    it('should NOT detect .mxweb as CAD file', () => {
      expect(FileTypeDetector.isCadFile('design.mxweb')).toBe(false);
    });

    it('should NOT detect .pdf as CAD file', () => {
      expect(FileTypeDetector.isCadFile('doc.pdf')).toBe(false);
    });
  });

  // ============================================================
  // MXWeb file detection
  // ============================================================
  describe('MXWeb file detection', () => {
    it('should detect .mxweb as MXWeb file', () => {
      expect(FileTypeDetector.isMxwebFile('design.mxweb')).toBe(true);
    });

    it('should detect .MXWEB (uppercase) as MXWeb file', () => {
      expect(FileTypeDetector.isMxwebFile('DESIGN.MXWEB')).toBe(true);
    });

    it('should NOT detect .dwg as MXWeb file', () => {
      expect(FileTypeDetector.isMxwebFile('plan.dwg')).toBe(false);
    });
  });

  // ============================================================
  // Conversion detection (Gherkin: "needsConversion" 判断)
  // ============================================================
  describe('needsConversion', () => {
    it('should return true for dwg files', () => {
      expect(FileTypeDetector.needsConversion('drawing.dwg')).toBe(true);
    });

    it('should return true for dxf files', () => {
      expect(FileTypeDetector.needsConversion('layout.dxf')).toBe(true);
    });

    it('should return false for mxweb files (no conversion needed)', () => {
      expect(FileTypeDetector.needsConversion('design.mxweb')).toBe(false);
    });

    it('should return false for non-CAD files', () => {
      expect(FileTypeDetector.needsConversion('image.png')).toBe(false);
    });
  });

  // ============================================================
  // File category classification (Gherkin: 格式分类)
  // ============================================================
  describe('getFileCategory', () => {
    it('should classify .dwg as cad', () => {
      expect(FileTypeDetector.getFileCategory('plan.dwg')).toBe('cad');
    });

    it('should classify .dxf as cad', () => {
      expect(FileTypeDetector.getFileCategory('plan.dxf')).toBe('cad');
    });

    it('should classify .png as image', () => {
      expect(FileTypeDetector.getFileCategory('screenshot.png')).toBe('image');
    });

    it('should classify .pdf as document', () => {
      expect(FileTypeDetector.getFileCategory('report.pdf')).toBe('document');
    });

    it('should classify .zip as archive', () => {
      expect(FileTypeDetector.getFileCategory('bundle.zip')).toBe('archive');
    });

    it('should classify unknown extension as other', () => {
      expect(FileTypeDetector.getFileCategory('data.xyz')).toBe('other');
    });

    it('should classify file without extension as other', () => {
      expect(FileTypeDetector.getFileCategory('noextension')).toBe('other');
    });
  });

  // ============================================================
  // Supported format check (Gherkin: 不支持格式 → 400)
  // ============================================================
  describe('isSupported', () => {
    it('should support .dwg', () => {
      expect(FileTypeDetector.isSupported('test.dwg')).toBe(true);
    });

    it('should support .dxf', () => {
      expect(FileTypeDetector.isSupported('test.dxf')).toBe(true);
    });

    it('should support .png (image files)', () => {
      expect(FileTypeDetector.isSupported('image.png')).toBe(true);
    });

    it('should support .pdf (document files)', () => {
      expect(FileTypeDetector.isSupported('doc.pdf')).toBe(true);
    });

    it('should support .zip (archive files)', () => {
      expect(FileTypeDetector.isSupported('archive.zip')).toBe(true);
    });

    // Gherkin Scenario: 上传不支持的格式 → 400
    it('should NOT support .exe files', () => {
      expect(FileTypeDetector.isSupported('virus.exe')).toBe(false);
    });

    it('should NOT support .bat files', () => {
      expect(FileTypeDetector.isSupported('script.bat')).toBe(false);
    });

    it('should NOT support files without extension', () => {
      expect(FileTypeDetector.isSupported('noextension')).toBe(false);
    });
  });

  // ============================================================
  // canDirectUpload (non-CAD files bypass conversion)
  // ============================================================
  describe('canDirectUpload', () => {
    it('should allow direct upload for mxweb files', () => {
      expect(FileTypeDetector.canDirectUpload('design.mxweb')).toBe(true);
    });

    it('should allow direct upload for image files', () => {
      expect(FileTypeDetector.canDirectUpload('photo.jpg')).toBe(true);
    });

    it('should NOT allow direct upload for CAD files (needs conversion)', () => {
      expect(FileTypeDetector.canDirectUpload('plan.dwg')).toBe(false);
    });
  });

  // ============================================================
  // CAD-only check (Gherkin: only dwg/dxf/mxweb for core flow)
  // ============================================================
  describe('CAD-specific validation (core drawing upload flow)', () => {
    // CORE_FLOW_EXTENSIONS represents what the core drawing upload
    // endpoint should accept for Project ownership
    const CORE_FLOW_EXTENSIONS = ['.dwg', '.dxf', '.mxweb'];

    const isCoreFlowFormat = (fileName: string): boolean => {
      const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
      return CORE_FLOW_EXTENSIONS.includes(ext);
    };

    // Gherkin Happy Path: dwg 上传转换成功
    it('should accept .dwg in core flow', () => {
      expect(isCoreFlowFormat('floor-plan.dwg')).toBe(true);
    });

    // Gherkin Happy Path: dxf 上传转换成功
    it('should accept .dxf in core flow', () => {
      expect(isCoreFlowFormat('layout.dxf')).toBe(true);
    });

    // Gherkin Happy Path: mxweb 直传
    it('should accept .mxweb in core flow', () => {
      expect(isCoreFlowFormat('design.mxweb')).toBe(true);
    });

    // Gherkin Exception: 不支持格式 → 400
    it('should REJECT .pdf in core flow', () => {
      expect(isCoreFlowFormat('report.pdf')).toBe(false);
    });

    it('should REJECT .png in core flow', () => {
      expect(isCoreFlowFormat('image.png')).toBe(false);
    });

    it('should REJECT .exe in core flow', () => {
      expect(isCoreFlowFormat('malware.exe')).toBe(false);
    });

    it('should REJECT file without extension in core flow', () => {
      expect(isCoreFlowFormat('noextension')).toBe(false);
    });
  });
});
