import type { UserRecord } from '../domain/user.types';

export const USER_REPOSITORY = 'USER_REPOSITORY';

export interface IUserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findByUsername(username: string): Promise<UserRecord | null>;
  findByPhone(phone: string): Promise<UserRecord | null>;
  findByWechatId(wechatId: string): Promise<UserRecord | null>;
  /**
   * 登录专用：按账号（邮箱/用户名/手机号）查找用户，**包含已注销用户**（不过滤 deletedAt）。
   * 供登录流程判断「冷静期内自动恢复」或「拒绝登录」。
   */
  findLoginUserIncludingDeleted(account: string): Promise<UserRecord | null>;
  /** 登录专用：按手机号查找用户，包含已注销用户（不过滤 deletedAt）。 */
  findByPhoneIncludingDeleted(phone: string): Promise<UserRecord | null>;
  /** 登录专用：按微信 openid 查找用户，包含已注销用户（不过滤 deletedAt）。 */
  findByWechatIdIncludingDeleted(wechatId: string): Promise<UserRecord | null>;
  create(data: Record<string, unknown>): Promise<UserRecord>;
  update(id: string, data: Record<string, unknown>): Promise<UserRecord>;
  markPhoneVerified(id: string, phone: string): Promise<UserRecord>;
  markEmailVerified(id: string, email: string): Promise<UserRecord>;
}
