import { describe, expect, it } from 'vitest';

import { extractApiError } from './api-message';

describe('@cloudcad/platform · errors/api-message', () => {
  it('取后端已翻译的顶层文案（GlobalExceptionFilter 的 body 形态）', () => {
    expect(
      extractApiError({
        code: 'VALIDATION_ERROR',
        message: '请求参数验证失败',
        timestamp: '2026-10-20T00:00:00.000Z',
        path: '/api/v1/cache-monitor/cleanup',
        method: 'POST',
      })
    ).toEqual({ message: '请求参数验证失败', fields: [] });
  });

  it('保留 errors[] 的字段级原因（#469：此前被整体丢弃）', () => {
    expect(
      extractApiError({
        code: 'VALIDATION_ERROR',
        message: '请求参数验证失败',
        errors: [
          { field: 'pattern', message: 'property pattern should not exist' },
          { field: 'level', message: 'level must be one of the following values: L1, L2, ALL' },
        ],
      })
    ).toEqual({
      message: '请求参数验证失败',
      fields: [
        'pattern: property pattern should not exist',
        'level: level must be one of the following values: L1, L2, ALL',
      ],
    });
  });

  it('message 为数组时逐项拼接', () => {
    expect(extractApiError({ message: ['a', 'b'] })).toEqual({
      message: 'a b',
      fields: [],
    });
  });

  it('兼容 Error 实例与非 JSON 字符串响应', () => {
    expect(extractApiError(new Error('boom'))).toEqual({
      message: 'boom',
      fields: [],
    });
    expect(extractApiError('<html>502</html>')).toEqual({
      message: '<html>502</html>',
      fields: [],
    });
  });

  it('没有可用文案时返回空串，由调用方兜底', () => {
    expect(extractApiError(null)).toEqual({ message: '', fields: [] });
    expect(extractApiError(undefined)).toEqual({ message: '', fields: [] });
    expect(extractApiError({})).toEqual({ message: '', fields: [] });
    expect(extractApiError({ message: '' })).toEqual({
      message: '',
      fields: [],
    });
    expect(extractApiError(42)).toEqual({ message: '', fields: [] });
  });

  it('忽略 errors[] 里缺原因的条目，不把字段名当原因', () => {
    expect(
      extractApiError({
        message: '请求参数验证失败',
        errors: [
          { field: 'name', message: '' },
          { field: 'only-field' },
          'stray',
          7,
          null,
          { message: '只有原因没有字段名' },
        ],
      })
    ).toEqual({
      message: '请求参数验证失败',
      fields: ['只有原因没有字段名'],
    });
  });
});
