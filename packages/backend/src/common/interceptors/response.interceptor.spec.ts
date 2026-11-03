///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { StreamableFile } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { I18nContext } from 'nestjs-i18n';
import { ResponseInterceptor } from './response.interceptor';

jest.mock('nestjs-i18n', () => ({
  I18nContext: {
    current: jest.fn().mockReturnValue(null),
  },
}));

/**
 * ResponseInterceptor 单元测试。
 *
 * 回归重点（ADR-0085 自测发现）：流式/文件响应（StreamableFile）不得被包装成
 * {code,message,data} JSON 信封——否则下载端点返回 JSON 而非文件字节，
 * <img> 内联渲染 / <a download> 下载全坏。
 */
describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<unknown>;

  beforeEach(() => {
    interceptor = new ResponseInterceptor();
  });

  const createContext = () =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
    }) as never;

  it('应把普通对象包装成 SUCCESS 信封', async () => {
    const next = { handle: () => of({ id: 'x' }) } as never;
    const result = await lastValueFrom(interceptor.intercept(createContext(), next));
    expect(result).toMatchObject({
      code: 'SUCCESS',
      data: { id: 'x' },
    });
    expect(result).toHaveProperty('message');
    expect(result).toHaveProperty('timestamp');
  });

  it('应把 StreamableFile 原样透传（不包装成 JSON 信封）', async () => {
    const stream = new StreamableFile(Buffer.from('file-bytes'));
    const next = { handle: () => of(stream) } as never;
    const result = await lastValueFrom(interceptor.intercept(createContext(), next));
    expect(result).toBe(stream);
  });

  it('应把 null/undefined 包装成信封（data=null）', async () => {
    const next = { handle: () => of(null) } as never;
    const result = await lastValueFrom(interceptor.intercept(createContext(), next));
    expect(result).toMatchObject({ code: 'SUCCESS', data: null });
  });
});
