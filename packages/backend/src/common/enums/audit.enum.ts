/**
 * 审计相关枚举定义
 * 从 schema.prisma 手动同步，保持与 Prisma 枚举值一致
 * 目的：切断 @prisma/client 循环依赖链
 *
 * #207 阶段 1（ADR-0045）动作清单精简决策（方案 A：写入入口过滤，枚举不硬删）：
 * - 高价值组：权限/角色变更、项目生命周期、成员变更、文件危险操作、账号安全 —— 保留
 * - 高频读组（USER_LOGIN/FILE_UPLOAD/FILE_DOWNLOAD）：**枚举值保留**，成功记录由
 *   AuditLogService.log() 写入入口过滤（只记失败）。不硬删的理由：
 *   ① @Audit 装饰器 18 处调用 + auth 门面仍引用这些 action（阶段 2 调用侧改造前删除会破坏编译）；
 *   ② 历史数据与审计查询按 action 字符串过滤，硬删枚举值不改变存储但破坏类型一致性；
 *   ③ 失败记录仍需要这些 action（异常才有审查价值）。
 * - 过渡保留组：auth 门面 @Audit 装饰器（18 处）与 alert 模块仍引用，阶段 2 调用侧改造完成后删除
 */

/**
 * 审计操作类型
 */
export enum AuditAction {
  // —— 高价值保留：权限/角色变更 ——
  PERMISSION_GRANT = 'PERMISSION_GRANT',
  PERMISSION_REVOKE = 'PERMISSION_REVOKE',
  ROLE_CREATE = 'ROLE_CREATE',
  ROLE_UPDATE = 'ROLE_UPDATE',
  ROLE_DELETE = 'ROLE_DELETE',
  // —— 高价值保留：项目生命周期 ——
  PROJECT_CREATE = 'PROJECT_CREATE',
  PROJECT_DELETE = 'PROJECT_DELETE',
  PROJECT_UPDATE = 'PROJECT_UPDATE',
  PROJECT_TRANSFER = 'PROJECT_TRANSFER',
  // —— 高价值保留：成员变更 ——
  ADD_MEMBER = 'ADD_MEMBER',
  UPDATE_MEMBER = 'UPDATE_MEMBER',
  REMOVE_MEMBER = 'REMOVE_MEMBER',
  TRANSFER_OWNERSHIP = 'TRANSFER_OWNERSHIP',
  // —— 高价值保留：文件危险操作 ——
  FILE_DELETE = 'FILE_DELETE',
  FILE_SHARE = 'FILE_SHARE',
  // —— 高价值保留：账号安全 ——
  USER_CHANGE_PASSWORD = 'USER_CHANGE_PASSWORD',
  USER_DEACTIVATE = 'USER_DEACTIVATE',
  USER_UNBIND_EMAIL = 'USER_UNBIND_EMAIL',
  USER_UNBIND_PHONE = 'USER_UNBIND_PHONE',
  USER_UNBIND_WECHAT = 'USER_UNBIND_WECHAT',
  // —— 安全类：IP 黑名单 ——
  IP_BLACKLIST_ADD = 'IP_BLACKLIST_ADD',
  IP_BLACKLIST_REMOVE = 'IP_BLACKLIST_REMOVE',
  // —— 安全类：管理员 IP 白名单 + 管理员专用入口登录 ——
  IP_WHITELIST_ADD = 'IP_WHITELIST_ADD',
  IP_WHITELIST_REMOVE = 'IP_WHITELIST_REMOVE',
  ADMIN_LOGIN = 'ADMIN_LOGIN',
  // —— 文件变更（项目操作历史核心）：新增图纸（上传成功且为全新节点）/ 修改图纸（显式保存/覆盖更新）——
  FILE_CREATE = 'FILE_CREATE',
  FILE_UPDATE = 'FILE_UPDATE',
  // —— 节点操作（项目操作历史）：文件夹创建 / 重命名 / 移动 / 复制 / 回收站恢复 ——
  FOLDER_CREATE = 'FOLDER_CREATE',
  NODE_RENAME = 'NODE_RENAME',
  NODE_MOVE = 'NODE_MOVE',
  NODE_COPY = 'NODE_COPY',
  NODE_RESTORE = 'NODE_RESTORE',
  // —— 高频读（#207）：成功记录由 AuditLogService.log() 过滤，失败记录保留 ——
  USER_LOGIN = 'USER_LOGIN',
  FILE_UPLOAD = 'FILE_UPLOAD',
  FILE_DOWNLOAD = 'FILE_DOWNLOAD',
  // —— 过渡保留：auth 门面 @Audit 装饰器引用，阶段 2 调用侧改造后删除 ——
  USER_REGISTER = 'USER_REGISTER',
  USER_VERIFY_EMAIL = 'USER_VERIFY_EMAIL',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_BIND_EMAIL = 'USER_BIND_EMAIL',
  USER_BIND_PHONE = 'USER_BIND_PHONE',
  USER_REBIND_EMAIL = 'USER_REBIND_EMAIL',
  USER_REBIND_PHONE = 'USER_REBIND_PHONE',
  USER_BIND_WECHAT = 'USER_BIND_WECHAT',
  // —— 过渡保留：alert 模块引用 ——
  ALERT_RESOLVE = 'ALERT_RESOLVE',
  // —— 阶段 2 新增：审计导出动作本身（#207）——
  AUDIT_EXPORT = 'AUDIT_EXPORT',
  // —— 资金敏感：退款申请 / 审核通过 / 审核驳回 ——
  REFUND_APPLY = 'REFUND_APPLY',
  REFUND_APPROVE = 'REFUND_APPROVE',
  REFUND_REJECT = 'REFUND_REJECT',
}

/**
 * 资源类型
 */
export enum ResourceType {
  SYSTEM = 'SYSTEM',
  USER = 'USER',
  ROLE = 'ROLE',
  PERMISSION = 'PERMISSION',
  PROJECT = 'PROJECT',
  FILE = 'FILE',
  FOLDER = 'FOLDER',
  ALERT = 'ALERT',
  IpBlacklistEntry = 'IpBlacklistEntry',
  IpWhitelistEntry = 'IpWhitelistEntry',
}
