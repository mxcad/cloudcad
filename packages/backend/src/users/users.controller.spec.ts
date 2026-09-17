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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UsersController } from './users.controller';

describe('UsersController.serveAvatar — 路径遍历防护', () => {
  let controller: UsersController;
  let baseDir: string;
  let avatarDir: string;
  let configService: { get: jest.Mock };

  const req = { headers: {} } as any;

  // write 返回 true（无背压）让真实文件流跑完并关闭，避免 open handle
  function makeRes(): any {
    return {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      write: jest.fn().mockReturnValue(true),
      headersSent: false,
    };
  }

  beforeEach(async () => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-ctrl-'));
    avatarDir = path.join(baseDir, 'avatar');
    fs.mkdirSync(avatarDir, { recursive: true });
    configService = { get: jest.fn().mockReturnValue(avatarDir) };

    // 直接实例化（serveAvatar 仅用 configService，不经 HTTP 故无需 Guards/DI）
    controller = new UsersController({} as never, configService as never);
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it('遍历 id：不读取 avatarDir 外的文件（basename 防护，@Public 无鉴权）', async () => {
    // avatarDir 外（baseDir 层）放一个图片文件
    fs.writeFileSync(path.join(baseDir, 'secret.png'), 'SECRET-BYTES');

    const res = makeRes();
    // 无防护时 path.join(avatarDir, '../secret.png') = baseDir/secret.png 会被读出；
    // basename('../secret') = 'secret' → 只找 avatarDir/secret.png（不存在）→ 404
    await expect(
      controller.serveAvatar('../secret', req, res)
    ).rejects.toThrow();
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
  });
});
