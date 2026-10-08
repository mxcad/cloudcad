import type { UserRecord } from './user.types';

/**
 * 把内部 UserRecord 映射为可安全下发给客户端的公开形状——剥离 password 哈希。
 *
 * 所有「构造用户响应」的出口必须经此函数，禁止直接展开 UserRecord（`{ ...user }` 会把
 * bcrypt 哈希泄漏进响应体 / 前端 localStorage）。需要 password 做校验/判定的路径
 * （bcrypt.compare、`!!user.password`）继续用原始 UserRecord；本函数只服务「对外响应」这一侧。
 *
 * 只剥离 password。若某出口还需处理其他关系字段（如登录响应的 membership 展平），
 * 在该出口自行处理，勿扩展本函数。
 */
export function toPublicUser(user: UserRecord): Omit<UserRecord, 'password'> {
  const { password: _password, ...rest } = user;
  return rest;
}
