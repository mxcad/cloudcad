/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
/////////////////////////////////////////////////////////////////////////////

import type { IRuntimeConfigService } from '@cloudcad/contracts';
import { buildMulterUploadLimits } from './multer-upload-limits';

const MB = 1024 * 1024;

function makeRuntimeConfig(value: number): IRuntimeConfigService {
  return {
    getValue: jest.fn().mockResolvedValue(value),
  };
}

describe('buildMulterUploadLimits（multer fileSize 防护网公式）', () => {
  it('运行时配置高于固定安全下限时，取运行时配置', async () => {
    const limits = await buildMulterUploadLimits(makeRuntimeConfig(1024));
    expect(limits.fileSize).toBe(1024 * MB);
  });

  it('运行时配置低于固定安全下限时，兜底 512MB（multer 永不收紧到配置之下）', async () => {
    // 默认值 500MB 低于 512MB 兜底，最终上限为 512MB
    const limits = await buildMulterUploadLimits(makeRuntimeConfig(500));
    expect(limits.fileSize).toBe(512 * MB);
  });

  it('以键 maxFileSize、默认值 500 读取运行时配置', async () => {
    const reader = makeRuntimeConfig(500);
    await buildMulterUploadLimits(reader);
    expect(reader.getValue).toHaveBeenCalledWith('maxFileSize', 500);
  });

  it('返回形状仅含 fileSize（limits 公共面，fields/fieldSize 由调用方自持）', async () => {
    const limits = await buildMulterUploadLimits(makeRuntimeConfig(1024));
    expect(Object.keys(limits)).toEqual(['fileSize']);
  });
});
