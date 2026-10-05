import { describe, expect, it } from 'vitest';

import { hasAnyPermission } from './permissions';

const CODES = ['LIBRARY_DRAWING_MANAGE', 'LIBRARY_BLOCK_MANAGE'] as const;

describe('@cloudcad/platform · auth/permissions', () => {
  it('权限码字符串命中', () => {
    expect(hasAnyPermission(['CAD_SAVE', 'LIBRARY_BLOCK_MANAGE'], CODES)).toBe(true);
  });

  it('{ permission } 包装对象命中', () => {
    expect(
      hasAnyPermission([{ permission: 'LIBRARY_DRAWING_MANAGE' }], CODES)
    ).toBe(true);
  });

  it('字符串与包装对象混排，命中任意一个即可', () => {
    expect(
      hasAnyPermission([
        { permission: 'CAD_SAVE' },
        'LIBRARY_BLOCK_MANAGE',
      ], CODES)
    ).toBe(true);
  });

  it('全部不命中 → false', () => {
    expect(hasAnyPermission(['CAD_SAVE', 'FILE_DOWNLOAD'], CODES)).toBe(false);
    expect(
      hasAnyPermission([{ permission: 'CAD_SAVE' }], CODES)
    ).toBe(false);
  });

  it('空数组 → false', () => {
    expect(hasAnyPermission([], CODES)).toBe(false);
  });

  it('非数组输入一律 false（不抛错）', () => {
    for (const bad of [undefined, null, '', {}, 'CAD_SAVE', 0]) {
      expect(hasAnyPermission(bad, CODES)).toBe(false);
    }
  });

  it('条目为 null / 数字 / 无 permission 键 → 跳过不抛错', () => {
    expect(
      hasAnyPermission([null, 42, {}, { perm: 'LIBRARY_BLOCK_MANAGE' }], CODES)
    ).toBe(false);
    expect(
      hasAnyPermission([null, { permission: 'LIBRARY_BLOCK_MANAGE' }], CODES)
    ).toBe(true);
  });

  it('空目标码表 → false', () => {
    expect(hasAnyPermission(['LIBRARY_BLOCK_MANAGE'], [])).toBe(false);
  });
});
