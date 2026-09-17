import {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_EXTENSIONS,
  AVATAR_MIME_BY_EXTENSION,
  normalizeAvatarExtension,
} from './avatar-extensions';

describe('normalizeAvatarExtension', () => {
  it('JFIF JPEG 家族统一归一成 .jpg', () => {
    expect(normalizeAvatarExtension('.jfif')).toBe('.jpg');
    expect(normalizeAvatarExtension('.JFIF')).toBe('.jpg');
    expect(normalizeAvatarExtension(' .jfif ')).toBe('.jpg');
    expect(normalizeAvatarExtension('.jpeg')).toBe('.jpg');
    expect(normalizeAvatarExtension('.jpe')).toBe('.jpg');
    expect(normalizeAvatarExtension('.jif')).toBe('.jpg');
  });

  it('规范扩展名原样保留', () => {
    expect(normalizeAvatarExtension('.png')).toBe('.png');
    expect(normalizeAvatarExtension('.PNG')).toBe('.png');
    expect(normalizeAvatarExtension('.gif')).toBe('.gif');
    expect(normalizeAvatarExtension('.webp')).toBe('.webp');
  });

  it('未知或空后缀回落 .png', () => {
    expect(normalizeAvatarExtension('')).toBe('.png');
    expect(normalizeAvatarExtension('.txt')).toBe('.png');
    expect(normalizeAvatarExtension('.html')).toBe('.png');
    expect(normalizeAvatarExtension('.heic')).toBe('.png');
  });

  it('归一化结果一定在可服务扩展名内（防写入后缀读取侧扫不到）', () => {
    for (const raw of [
      '.jfif',
      '.JFIF',
      '.jpeg',
      '.jpe',
      '.jif',
      '.png',
      '.gif',
      '.webp',
      '',
      '.txt',
      '.html',
      '.HEIC',
    ]) {
      const normalized = normalizeAvatarExtension(raw);
      expect({ input: raw, normalized, servable: AVATAR_EXTENSIONS.includes(normalized) }).toEqual({
        input: raw,
        normalized,
        servable: true,
      });
    }
  });
});

describe('AVATAR_EXTENSIONS / AVATAR_MIME_BY_EXTENSION', () => {
  it('每个可服务扩展名都有 image/* 的 Content-Type 映射', () => {
    for (const ext of AVATAR_EXTENSIONS) {
      expect({ ext, isImageMime: /^image\//.test(AVATAR_MIME_BY_EXTENSION[ext]) }).toEqual({
        ext,
        isImageMime: true,
      });
    }
  });

  it('覆盖移动端相册产出的 .jfif（历史 404 根因）', () => {
    expect(AVATAR_EXTENSIONS).toContain('.jfif');
    expect(AVATAR_MIME_BY_EXTENSION['.jfif']).toBe('image/jpeg');
  });
});

describe('AVATAR_ALLOWED_MIME_TYPES', () => {
  it('接受移动端上报的 image/jfif', () => {
    expect(AVATAR_ALLOWED_MIME_TYPES).toContain('image/jfif');
  });
});
