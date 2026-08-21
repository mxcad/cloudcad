import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getDefaultThumbnailFileName,
  DEFAULT_THUMBNAIL_MAP,
  findThumbnailSync,
  THUMBNAIL_FORMATS,
  getMimeType,
} from './thumbnail-utils';

describe('getDefaultThumbnailFileName', () => {
  it('should map known CAD extensions to their specific default thumbnails', () => {
    expect(getDefaultThumbnailFileName('.dwg')).toBe('dwg.jpg');
    expect(getDefaultThumbnailFileName('.dxf')).toBe('dxf.jpg');
    expect(getDefaultThumbnailFileName('.mxweb')).toBe('mxweb.jpg');
  });

  it('should be case-insensitive for extension input', () => {
    expect(getDefaultThumbnailFileName('.DWG')).toBe('dwg.jpg');
    expect(getDefaultThumbnailFileName('.Dxf')).toBe('dxf.jpg');
  });

  it('should fall back to default.jpg for unknown extensions', () => {
    expect(getDefaultThumbnailFileName('.pdf')).toBe('default.jpg');
    expect(getDefaultThumbnailFileName('dwg')).toBe('default.jpg');
  });

  it('should fall back to default.jpg when extension is missing', () => {
    expect(getDefaultThumbnailFileName(undefined)).toBe('default.jpg');
    expect(getDefaultThumbnailFileName(null)).toBe('default.jpg');
    expect(getDefaultThumbnailFileName('')).toBe('default.jpg');
  });

  it('should keep DEFAULT_THUMBNAIL_MAP consistent with the function', () => {
    for (const [ext, file] of Object.entries(DEFAULT_THUMBNAIL_MAP)) {
      expect(getDefaultThumbnailFileName(ext)).toBe(file);
    }
  });
});

describe('findThumbnailSync', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumb-utils-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should find thumbnail.jpg when present', () => {
    fs.writeFileSync(path.join(tmpDir, 'thumbnail.jpg'), 'jpg');
    const found = findThumbnailSync(tmpDir);
    expect(found).not.toBeNull();
    expect(found!.fileName).toBe('thumbnail.jpg');
    expect(found!.mimeType).toBe('image/jpeg');
  });

  it('should ignore legacy thumbnail.png', () => {
    fs.writeFileSync(path.join(tmpDir, 'thumbnail.png'), 'png');
    expect(findThumbnailSync(tmpDir)).toBeNull();
  });

  it('should ignore legacy thumbnail.webp', () => {
    fs.writeFileSync(path.join(tmpDir, 'thumbnail.webp'), 'webp');
    expect(findThumbnailSync(tmpDir)).toBeNull();
  });

  it('should return null when no thumbnail exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'other.jpg'), 'other');
    expect(findThumbnailSync(tmpDir)).toBeNull();
  });

  it('should keep THUMBNAIL_FORMATS order consistent with mime types', () => {
    for (const format of THUMBNAIL_FORMATS) {
      expect(getMimeType(format)).toMatch(/^image\//);
    }
  });
});
