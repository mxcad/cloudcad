///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect } from 'vitest';
import { describeConversionError } from './conversionError';

describe('describeConversionError', () => {
  it('content-error → 文件内容问题桶，不可重试', () => {
    const info = describeConversionError('content-error', 'read file error');
    expect(info.kind).toBe('content');
    expect(info.canRetry).toBe(false);
    expect(info.message).toContain('文件内容异常');
    expect(info.detail).toBe('read file error');
  });

  it('timeout → 服务桶（超时文案），可重试', () => {
    const info = describeConversionError('timeout');
    expect(info.kind).toBe('service');
    expect(info.canRetry).toBe(true);
    expect(info.message).toContain('超时');
  });

  it.each(['killed', 'not-started', 'output-unparseable', 'unknown'])(
    '环境性分类 %s → 服务桶，可重试',
    (category) => {
      const info = describeConversionError(category);
      expect(info.kind).toBe('service');
      expect(info.canRetry).toBe(true);
      expect(info.message).toContain('转换服务异常');
    }
  );

  it('未分类（undefined）→ 服务桶兜底，可重试', () => {
    const info = describeConversionError(undefined);
    expect(info.kind).toBe('service');
    expect(info.canRetry).toBe(true);
    expect(info.message).toContain('转换服务异常');
  });

  it('无具体 error 时 detail 为 undefined', () => {
    const info = describeConversionError('content-error');
    expect(info.detail).toBeUndefined();
  });
});
