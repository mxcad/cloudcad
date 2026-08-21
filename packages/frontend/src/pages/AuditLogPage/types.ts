/**
 * 审计动作清单（#207 阶段 3）
 * 与 packages/backend/src/common/enums/audit.enum.ts 保持同步：
 * - 高价值保留组：权限/角色变更、项目生命周期、成员变更、文件危险操作、账号安全
 * - 高频读组（USER_LOGIN/FILE_UPLOAD/FILE_DOWNLOAD）：仅失败记录产生日志
 * - 过渡保留组：阶段 2 调用侧改造完成后将随后端枚举删除
 */
export const AuditAction = {
  // —— 高价值保留：权限/角色变更 ——
  PERMISSION_GRANT: 'PERMISSION_GRANT',
  PERMISSION_REVOKE: 'PERMISSION_REVOKE',
  ROLE_CREATE: 'ROLE_CREATE',
  ROLE_UPDATE: 'ROLE_UPDATE',
  ROLE_DELETE: 'ROLE_DELETE',
  // —— 高价值保留：项目生命周期 ——
  PROJECT_CREATE: 'PROJECT_CREATE',
  PROJECT_DELETE: 'PROJECT_DELETE',
  PROJECT_UPDATE: 'PROJECT_UPDATE',
  PROJECT_TRANSFER: 'PROJECT_TRANSFER',
  // —— 高价值保留：成员变更 ——
  ADD_MEMBER: 'ADD_MEMBER',
  UPDATE_MEMBER: 'UPDATE_MEMBER',
  REMOVE_MEMBER: 'REMOVE_MEMBER',
  TRANSFER_OWNERSHIP: 'TRANSFER_OWNERSHIP',
  // —— 高价值保留：文件危险操作 ——
  FILE_DELETE: 'FILE_DELETE',
  FILE_SHARE: 'FILE_SHARE',
  // —— 高价值保留：文件变更（项目操作历史核心）——
  FILE_CREATE: 'FILE_CREATE',
  FILE_UPDATE: 'FILE_UPDATE',
  // —— 节点操作（项目操作历史）：文件夹创建 / 重命名 / 移动 / 复制 / 回收站恢复 ——
  FOLDER_CREATE: 'FOLDER_CREATE',
  NODE_RENAME: 'NODE_RENAME',
  NODE_MOVE: 'NODE_MOVE',
  NODE_COPY: 'NODE_COPY',
  NODE_RESTORE: 'NODE_RESTORE',
  // —— 高价值保留：账号安全 ——
  USER_CHANGE_PASSWORD: 'USER_CHANGE_PASSWORD',
  USER_DEACTIVATE: 'USER_DEACTIVATE',
  USER_UNBIND_EMAIL: 'USER_UNBIND_EMAIL',
  USER_UNBIND_PHONE: 'USER_UNBIND_PHONE',
  USER_UNBIND_WECHAT: 'USER_UNBIND_WECHAT',
  // —— 安全类：IP 黑名单 ——
  IP_BLACKLIST_ADD: 'IP_BLACKLIST_ADD',
  IP_BLACKLIST_REMOVE: 'IP_BLACKLIST_REMOVE',
  // —— 高频读（仅失败记录）——
  USER_LOGIN: 'USER_LOGIN',
  FILE_UPLOAD: 'FILE_UPLOAD',
  FILE_DOWNLOAD: 'FILE_DOWNLOAD',
  // —— 过渡保留：auth 门面 @Audit 装饰器引用 ——
  USER_REGISTER: 'USER_REGISTER',
  USER_VERIFY_EMAIL: 'USER_VERIFY_EMAIL',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_BIND_EMAIL: 'USER_BIND_EMAIL',
  USER_BIND_PHONE: 'USER_BIND_PHONE',
  USER_REBIND_EMAIL: 'USER_REBIND_EMAIL',
  USER_REBIND_PHONE: 'USER_REBIND_PHONE',
  USER_BIND_WECHAT: 'USER_BIND_WECHAT',
  // —— 过渡保留：alert 模块引用 ——
  ALERT_RESOLVE: 'ALERT_RESOLVE',
} as const;

export const ResourceType = {
  SYSTEM: 'SYSTEM',
  USER: 'USER',
  ROLE: 'ROLE',
  PERMISSION: 'PERMISSION',
  PROJECT: 'PROJECT',
  FILE: 'FILE',
  FOLDER: 'FOLDER',
  ALERT: 'ALERT',
  IpBlacklistEntry: 'IpBlacklistEntry',
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

export type ResourceTypeType = (typeof ResourceType)[keyof typeof ResourceType];

export interface AuditFilters {
  userId: string;
  /** 操作类型（多选，后端逗号分隔） */
  action: string[];
  /** 资源类型（多选，后端逗号分隔） */
  resourceType: string[];
  resourceId: string;
  projectId: string;
  startDate: string;
  endDate: string;
  success: string;
}
