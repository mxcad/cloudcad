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

describe('UsersController.serveAvatar — 路径遍历防护', () => {
  let controller: UsersController;
  let baseDir: string;
  let avatarDir: string;
  let configService: { get: jest.Mock };

  const req = { headers: {} } as any;

  beforeEach(async () => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-ctrl-'));
    avatarDir = path.join(baseDir, 'avatar');
    fs.mkdirSync(avatarDir, { recursive: true });
    configService = { get: jest.fn().mockReturnValue(avatarDir) };

    // 直接实例化（serveAvatar 仅用 configService，不经 HTTP 故无需 Guards/DI）
    // 第 3-5 参 SSE/ticket 服务供事件流端点用，serveAvatar 不触达 → 空 stub
    controller = new UsersController(
      {} as never,
      configService as never,
      {} as never,
      {} as never,
      {} as never
    );
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

describe('UsersController.openUserEventStream — 统一用户事件流（ADR-0083）', () => {
  let controller: UsersController;
  let redeemTicket: jest.Mock;
  let openUserEventStream: jest.Mock;

  beforeEach(() => {
    redeemTicket = jest.fn();
    openUserEventStream = jest.fn();
    controller = new UsersController(
      {} as never,
      {} as never,
      {} as never,
      { openUserEventStream } as never,
      { redeemTicket } as never
    );
  });

  it('无效 ticket → 401 结束响应，不开流（不走异常过滤器，与 notices/stream 同款）', async () => {
    redeemTicket.mockResolvedValue(null);
    const res = makeRes();

    await controller.openUserEventStream({} as never, res, 'bad-ticket');

    expect(redeemTicket).toHaveBeenCalledWith('bad-ticket');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.end).toHaveBeenCalled();
    expect(openUserEventStream).not.toHaveBeenCalled();
  });

  it('无 ticket → 以空串兑换（必失败）→ 401', async () => {
    redeemTicket.mockResolvedValue(null);
    const res = makeRes();

    await controller.openUserEventStream({} as never, res, undefined);

    expect(redeemTicket).toHaveBeenCalledWith('');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.end).toHaveBeenCalled();
  });

  it('有效 ticket → 兑换出 userId 后开统一流', async () => {
    redeemTicket.mockResolvedValue('user-1');
    const req = {} as never;
    const res = makeRes();

    await controller.openUserEventStream(req, res, 'good-ticket');

    expect(res.status).not.toHaveBeenCalled();
    expect(openUserEventStream).toHaveBeenCalledWith('user-1', res, req);
  });
});
