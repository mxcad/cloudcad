import { normalizeMxcadPath } from './mxcad-path';

describe('normalizeMxcadPath（Express 通配参还原唯一出口）', () => {
  it('数组形态按 / 连接', () => {
    expect(normalizeMxcadPath(['202610', 'node-1', 'a.mxweb'])).toBe(
      '202610/node-1/a.mxweb'
    );
    expect(normalizeMxcadPath(['202610'])).toBe('202610');
    expect(normalizeMxcadPath([])).toBe('');
  });

  it('逗号串形态逐段还原为斜杠（Express toString 产物）', () => {
    expect(normalizeMxcadPath('202610,node-1,a.mxweb')).toBe(
      '202610/node-1/a.mxweb'
    );
    // 单段被 toString 成 "202610,node-1"（Express 把两段数组拼成逗号串的真实形态）
    expect(normalizeMxcadPath('202610,node-1')).toBe('202610/node-1');
  });

  it('空数组 / 空串 / undefined / null 一律返回空串', () => {
    expect(normalizeMxcadPath('')).toBe('');
    expect(normalizeMxcadPath(undefined)).toBe('');
    expect(normalizeMxcadPath(null)).toBe('');
  });

  it('不重复规范化：已含斜杠的逗号混合串一次还原到位', () => {
    expect(normalizeMxcadPath('202610/node-1,a.mxweb')).toBe(
      '202610/node-1/a.mxweb'
    );
  });
});
