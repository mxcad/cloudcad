/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
/////////////////////////////////////////////////////////////////////////////

import type { Response } from 'express';
import {
  buildContentDisposition,
  setContentDisposition,
} from './content-disposition';

describe('buildContentDisposition', () => {
  it('中文文件名：filename 为 ASCII fallback（替换为 _），filename* 为全量编码', () => {
    expect(buildContentDisposition('图纸A1.dwg')).toBe(
      `attachment; filename="__A1.dwg"; filename*=UTF-8''${encodeURIComponent('图纸A1.dwg')}`
    );
  });

  it('纯 ASCII 文件名：filename 与 filename* 解码后一致', () => {
    const value = buildContentDisposition('plan.dwg');
    expect(value).toBe(`attachment; filename="plan.dwg"; filename*=UTF-8''plan.dwg`);
  });

  it('含空格与引号的文件名：fallback 保留空格、引号原样（quoted-string 内），filename* 全量编码', () => {
    const filename = 'my "report" file.dwg';
    const value = buildContentDisposition(filename);
    expect(value).toBe(
      `attachment; filename="my "report" file.dwg"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
  });

  it('inline 处置类型：前缀为 inline，编码策略不变', () => {
    expect(buildContentDisposition('预览.png', 'inline')).toBe(
      `inline; filename="__.png"; filename*=UTF-8''${encodeURIComponent('预览.png')}`
    );
  });

  it('默认处置类型为 attachment', () => {
    const value = buildContentDisposition('a.dwg');
    expect(value.startsWith('attachment;')).toBe(true);
  });

  it('空文件名：返回空的 fallback 与空编码', () => {
    expect(buildContentDisposition('')).toBe(
      `attachment; filename=""; filename*=UTF-8''`
    );
  });
});

describe('setContentDisposition', () => {
  function makeRes(): { res: Response; headers: Record<string, unknown> } {
    const headers: Record<string, unknown> = {};
    const res = {
      setHeader: jest.fn((name: string, value: unknown) => {
        headers[name] = value;
      }),
    } as unknown as Response;
    return { res, headers };
  }

  it('默认 attachment：写入 Content-Disposition 头', () => {
    const { res, headers } = makeRes();
    setContentDisposition(res, '图纸A1.dwg');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      `attachment; filename="__A1.dwg"; filename*=UTF-8''${encodeURIComponent('图纸A1.dwg')}`
    );
    expect(headers['Content-Disposition']).toBe(
      `attachment; filename="__A1.dwg"; filename*=UTF-8''${encodeURIComponent('图纸A1.dwg')}`
    );
  });

  it('inline：处置语义透传', () => {
    const { res } = makeRes();
    setContentDisposition(res, '预览.png', 'inline');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      `inline; filename="__.png"; filename*=UTF-8''${encodeURIComponent('预览.png')}`
    );
  });
});
