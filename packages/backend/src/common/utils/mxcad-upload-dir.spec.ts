/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
/////////////////////////////////////////////////////////////////////////////

import { ConfigService } from '@nestjs/config';
import { DEFAULT_MXCAD_UPLOAD_DIR, resolveMxcadUploadDir } from './mxcad-upload-dir';

function makeConfigService(rawValue: string | undefined): ConfigService {
  return {
    get: jest.fn().mockReturnValue(rawValue),
  } as unknown as ConfigService;
}

describe('resolveMxcadUploadDir（mxcadUploadPath 唯一读取出口）', () => {
  it('配置已设置时，原样返回配置值（不 resolve、不改写分隔符）', () => {
    expect(resolveMxcadUploadDir(makeConfigService('/abs/data/uploads'))).toBe(
      '/abs/data/uploads'
    );
    expect(resolveMxcadUploadDir(makeConfigService('D:\\data\\uploads'))).toBe(
      'D:\\data\\uploads'
    );
  });

  it('配置缺失时回退默认相对目录 ../../uploads', () => {
    expect(resolveMxcadUploadDir(makeConfigService(undefined))).toBe(
      DEFAULT_MXCAD_UPLOAD_DIR
    );
  });

  it('配置为空串时同样回退默认相对目录', () => {
    expect(resolveMxcadUploadDir(makeConfigService(''))).toBe(
      DEFAULT_MXCAD_UPLOAD_DIR
    );
  });
});
