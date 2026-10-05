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
    // 运行时 maxFileSize=500MB 低于 512MB 兜底，最终上限为 512MB
    const limits = await buildMulterUploadLimits(makeRuntimeConfig(500));
    expect(limits.fileSize).toBe(512 * MB);
  });

  it('按已登记的 maxFileSize 读取且不传 fallback（已登记键的默认值由定义表权威持有）', async () => {
    // maxFileSize 已登记在 RUNTIME_CONFIG_DEFINITIONS，getValue 对已登记键恒返回
    // 权威默认值，调用方 fallback 会被静默丢弃。锁定「不传 fallback」，防死 fallback 回归。
    const reader = makeRuntimeConfig(100);
    await buildMulterUploadLimits(reader);
    expect(reader.getValue).toHaveBeenCalledTimes(1);
    expect(reader.getValue).toHaveBeenCalledWith('maxFileSize');
  });

  it('返回形状仅含 fileSize（limits 公共面，fields/fieldSize 由调用方自持）', async () => {
    const limits = await buildMulterUploadLimits(makeRuntimeConfig(1024));
    expect(Object.keys(limits)).toEqual(['fileSize']);
  });
});
