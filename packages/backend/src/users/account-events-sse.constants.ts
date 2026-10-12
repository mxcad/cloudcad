/**
 * 账户事件 SSE 通道（单一事实源）。
 *
 * per-user 通道：管理员改会员（`UserCrudService.updateMembership`）写库后在
 * `ACCOUNT_EVENTS_CHANNEL(userId)` 上 emit `{ type: 'membership-changed' }`；
 * `AccountEventsSseService` 订阅同一通道，向该用户已登录客户端的 EventSource 推送
 * 刷新信号，前端收到即 `refreshUser()` 重拉 `/auth/profile`（含最新会员态），
 * 无需退出重登。
 *
 * 按 userId 分通道（一个 EventSource 连接覆盖该用户全部账户事件）；PC 与移动端
 * 各自建连订阅同一通道。
 */
export const ACCOUNT_EVENTS_CHANNEL = (userId: string): string =>
  `account-events.changed.${userId}`;

/** 事件类型：账户（当前为会员）发生变更，客户端应刷新当前用户资料。 */
export type AccountEventsSseType = 'membership-changed';

/** 事件负载 */
export interface AccountEventsSseEvent {
  type: AccountEventsSseType;
}
