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

/**
 * 会话建立唯一出口（架构审查 ⑧）。
 *
 * 历史上「登录/注册/绑定成功后写 session」的样板散落在 local-auth.provider /
 * admin-auth / login / registration 共 12 处，逐字节重复 `req.session.userId =
 * user.id; req.session.userRole = …; await req.session.save()`，且其中
 * local-auth.provider 的手机号验证码登录一处写的是 `user.role.name`（无可选链），
 * role 未加载时会直接抛 TypeError 使整个登录 500。
 *
 * 统一收敛到本函数：角色名一律 `user.role?.name ?? fallbackRole`（消除崩溃路径），
 * 变体（是否写 userEmail / 是否持久化 / 角色回落值）通过 options 表达，调用方
 * 只保留各自的日志与业务分支。
 */

/** 会话对象最小形状：不依赖 express-session 具体类型，兼容 Request / SessionRequest */
export interface SessionLike {
  userId?: string;
  userRole?: string;
  userEmail?: string;
  save(): Promise<void>;
}

export interface EstablishSessionOptions {
  /** 角色回落值，默认 'USER'；管理员入口传 'ADMIN'、登录兜底传 'UNKNOWN' */
  fallbackRole?: string;
  /** 是否写入 session.userEmail（默认 false） */
  withEmail?: boolean;
  /** 是否持久化 session（默认 true；注册等无 cookie 场景可传 false） */
  save?: boolean;
}

/** 可携带 session 的请求对象（兼容 express Request 与自定义 SessionRequest） */
export type SessionRequestLike = { session?: unknown } | null | undefined;

export async function establishSession(
  req: SessionRequestLike,
  user: { id: string; role?: { name?: string }; email?: string | null },
  options: EstablishSessionOptions = {}
): Promise<void> {
  const session = req?.session as SessionLike | undefined;
  if (!session) return;

  const { fallbackRole = 'USER', withEmail = false, save = true } = options;
  session.userId = user.id;
  session.userRole = user.role?.name ?? fallbackRole;
  if (withEmail) {
    session.userEmail = user.email ?? undefined;
  }
  if (save) {
    await session.save();
  }
}
