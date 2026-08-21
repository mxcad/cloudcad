/**
 * 登录同步扩展点。
 *
 * OSS 登录主流程（LoginService）在固定位置调用该可选钩子：
 * 1. 查询本地用户之前调用 `syncBeforeLogin`，让实现方有机会"代理验证 + 创建/更新本地用户 + 同步权益"。
 * 2. 钩子不应接管认证本身——密码校验、token 生成、session 始终由 OSS 主流程完成。
 *
 * 私有实现（如 @cloudcad/impl-mx 的旧官网用户同步）注册此 token；
 * OSS 版本不注册，LoginService 通过 @Optional() 注入，无钩子时行为零变化。
 */
export interface IUserSyncHook {
  /**
   * 登录前同步。在 LoginService 查询本地用户之前调用。
   *
   * 实现方职责（以旧官网同步为例）：
   * - 账号非目标用户（如非手机号）→ 直接返回，不抛错
   * - 目标账号在外部系统不存在 → 直接返回，走本地认证
   * - 目标账号存在 → 代理验证密码（失败抛 UnauthorizedException）、拉取用户信息、
   *   无本地账号则创建（存当前密码），已有则更新用户资料并增量同步权益（VIP 等）
   *
   * 密码校验始终由 OSS 主流程用本地密码完成，钩子不对本地密码让步。
   *
   * @param account  登录账号（可能是手机号/邮箱/用户名）
   * @param password 用户输入的明文密码
   */
  syncBeforeLogin(account: string, password: string): Promise<void>;
}
