import { buildFileUrl } from './file-url.util';

describe('buildFileUrl', () => {
  it('should append t param from Date', () => {
    const date = new Date('2026-01-02T03:04:05.000Z');
    const url = buildFileUrl('/api/v1/mxcad/filesData/202601/node/file.mxweb', date);
    expect(url).toBe(`/api/v1/mxcad/filesData/202601/node/file.mxweb?t=${date.getTime()}`);
  });

  it('should append t param from timestamp number', () => {
    const url = buildFileUrl('/a/b.dwg', 1234567890);
    expect(url).toBe('/a/b.dwg?t=1234567890');
  });

  it('should append v param when version is provided', () => {
    const url = buildFileUrl('/a/b.dwg', 123, 'v3');
    expect(url).toBe('/a/b.dwg?t=123&v=v3');
  });

  it('should not append v param when version is omitted', () => {
    const url = buildFileUrl('/a/b.dwg', 123);
    expect(url).toBe('/a/b.dwg?t=123');
  });

  it('should preserve existing query params in the path', () => {
    const url = buildFileUrl('/a/b.dwg?shareToken=abc', 123);
    expect(url).toBe('/a/b.dwg?shareToken=abc&t=123');
  });

  it('should handle empty path', () => {
    const url = buildFileUrl('', 123);
    expect(url).toBe('?t=123');
  });
});
