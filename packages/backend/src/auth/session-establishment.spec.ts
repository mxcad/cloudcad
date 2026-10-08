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

import { establishSession, type SessionLike } from './session-establishment';

/** 构造一个带 session 的请求对象 */
function makeReq(withSession = true) {
  const session: SessionLike = {
    save: jest.fn(async () => undefined),
  };
  return withSession ? { session } : {};
}

describe('establishSession（架构审查 ⑧ 会话建立唯一出口）', () => {
  it('默认：写 userId/userRole 并持久化', async () => {
    const req = makeReq();
    const session = req.session as SessionLike;

    await establishSession(req, { id: 'u1', role: { name: 'ADMIN' } });

    expect(session.userId).toBe('u1');
    expect(session.userRole).toBe('ADMIN');
    expect(session.save).toHaveBeenCalledTimes(1);
  });

  it('崩溃路径回归：role 缺失时回落 fallbackRole 而非抛 TypeError', async () => {
    const req = makeReq();
    const session = req.session as SessionLike;

    // 旧实现 `user.role.name` 在此处会因 role===undefined 抛 TypeError 使登录 500
    await expect(
      establishSession(req, { id: 'u2', role: undefined })
    ).resolves.toBeUndefined();

    expect(session.userId).toBe('u2');
    expect(session.userRole).toBe('USER');
    expect(session.save).toHaveBeenCalledTimes(1);
  });

  it('role 为 null 同样回落（?? 语义）', async () => {
    const req = makeReq();
    const session = req.session as SessionLike;

    await establishSession(req, { id: 'u3', role: null as unknown as { name?: string } });

    expect(session.userRole).toBe('USER');
  });

  it('withEmail：额外写 userEmail', async () => {
    const req = makeReq();
    const session = req.session as SessionLike;

    await establishSession(req, { id: 'u4', role: { name: 'USER' }, email: 'a@b.com' }, { withEmail: true });

    expect(session.userEmail).toBe('a@b.com');
  });

  it('withEmail 且 email 为空：userEmail 置 undefined', async () => {
    const req = makeReq();
    const session = req.session as SessionLike;

    await establishSession(req, { id: 'u5', role: { name: 'USER' }, email: null }, { withEmail: true });

    expect(session.userEmail).toBeUndefined();
  });

  it('save:false：写字段但不持久化（注册等无 cookie 场景）', async () => {
    const req = makeReq();
    const session = req.session as SessionLike;

    await establishSession(req, { id: 'u6', role: { name: 'USER' } }, { save: false });

    expect(session.userId).toBe('u6');
    expect(session.userRole).toBe('USER');
    expect(session.save).not.toHaveBeenCalled();
  });

  it('自定义 fallbackRole：管理员入口传 ADMIN', async () => {
    const req = makeReq();
    const session = req.session as SessionLike;

    await establishSession(req, { id: 'u7', role: undefined }, { fallbackRole: 'ADMIN' });

    expect(session.userRole).toBe('ADMIN');
  });

  it('无 session：静默 no-op，不抛错', async () => {
    const req = makeReq(false);

    await expect(
      establishSession(req, { id: 'u8', role: { name: 'USER' } })
    ).resolves.toBeUndefined();
  });

  it('req 为 null/undefined：静默 no-op', async () => {
    await expect(establishSession(null, { id: 'u9' })).resolves.toBeUndefined();
    await expect(establishSession(undefined, { id: 'u10' })).resolves.toBeUndefined();
  });
});
