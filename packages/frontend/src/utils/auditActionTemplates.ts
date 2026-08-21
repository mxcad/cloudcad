import { t } from '@/languages';

// 审计日志接口
// 响应类型：后端未定义响应 DTO（Swagger 200: unknown），本地按后端
// AuditLogService.AuditLogListItem（Prisma 全字段 + user 摘要）维护字段形状
export interface AuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  projectId: string | null;
  resourceName: string | null;
  params: Record<string, unknown> | null;
  userId: string;
  user: {
    id: string;
    email: string;
    username: string;
    nickname: string | null;
  };
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

/**
 * 审计动作模板渲染（#207 阶段 3）
 *
 * 每条审计记录渲染为可读的一句话，示例：
 *   "张工 将 李工 的角色从 查看者 改为 编辑者"
 *
 * params 字段约定（结构化参数，与后端阶段 2 埋点对齐；缺失时防御性回退）：
 *   - targetUserName  目标用户名称（成员变更/权限授予/转让目标）
 *   - roleName        角色名（单一值场景）
 *   - oldRoleName     角色变更前
 *   - newRoleName     角色变更后
 *   - permissionName  权限名
 *   - projectName     项目名
 *   - ip              IP 地址
 *   - fileName/filePath 文件名/路径
 */

/** 从 params 中按候选 key 列表读取首个非空值 */
function readParam(
  log: AuditLog,
  keys: string[],
  fallback?: string | null
): string | null {
  const params = log.params;
  if (params && typeof params === 'object') {
    for (const key of keys) {
      const value = params[key];
      if (value !== undefined && value !== null && value !== '') {
        return String(value);
      }
    }
  }
  return fallback ?? null;
}

/** 操作者名称：优先昵称，其次用户名，最后 email */
function actorName(log: AuditLog): string {
  return log.user.nickname || log.user.username || log.user.email || '-';
}

/** 资源名称快照（resourceName 缺失时回退资源 ID） */
function resourceName(log: AuditLog): string {
  return log.resourceName || log.resourceId || '-';
}

/** 动作 → 模板映射（未覆盖的动作回退到动作名 + 资源名） */
const ACTION_TEMPLATES: Record<string, (log: AuditLog) => string> = {
  // —— 权限/角色变更 ——
  PERMISSION_GRANT: (log) =>
    t('{user} 授予 {target} 权限 {permission}', {
      user: actorName(log),
      target: readParam(log, ['targetUserName']) || '-',
      permission: readParam(log, ['permissionName', 'permission']) || '-',
    }),
  PERMISSION_REVOKE: (log) =>
    t('{user} 撤销 {target} 的权限 {permission}', {
      user: actorName(log),
      target: readParam(log, ['targetUserName']) || '-',
      permission: readParam(log, ['permissionName', 'permission']) || '-',
    }),
  ROLE_CREATE: (log) =>
    t('{user} 创建角色 {role}', {
      user: actorName(log),
      role: resourceName(log),
    }),
  ROLE_UPDATE: (log) =>
    t('{user} 更新角色 {role}', {
      user: actorName(log),
      role: resourceName(log),
    }),
  ROLE_DELETE: (log) =>
    t('{user} 删除角色 {role}', {
      user: actorName(log),
      role: resourceName(log),
    }),
  // —— 项目生命周期 ——
  PROJECT_CREATE: (log) =>
    t('{user} 创建项目 {project}', {
      user: actorName(log),
      project: readParam(log, ['projectName', 'name']) || resourceName(log),
    }),
  PROJECT_DELETE: (log) =>
    t('{user} 删除项目 {project}', {
      user: actorName(log),
      project: readParam(log, ['projectName', 'name']) || resourceName(log),
    }),
  PROJECT_UPDATE: (log) =>
    t('{user} 更新项目设置 {project}', {
      user: actorName(log),
      project: readParam(log, ['projectName', 'name']) || resourceName(log),
    }),
  PROJECT_TRANSFER: (log) =>
    t('{user} 将项目 {project} 转让给 {target}', {
      user: actorName(log),
      project: readParam(log, ['projectName', 'name']) || resourceName(log),
      target: readParam(log, ['targetUserName']) || '-',
    }),
  // —— 成员变更 ——
  ADD_MEMBER: (log) =>
    t('{user} 添加 {target} 为成员（角色 {role}）', {
      user: actorName(log),
      target: readParam(log, ['targetUserName']) || '-',
      role: readParam(log, ['roleName']) || '-',
    }),
  UPDATE_MEMBER: (log) =>
    t('{user} 将 {target} 的角色从 {oldRole} 改为 {newRole}', {
      user: actorName(log),
      target: readParam(log, ['targetUserName']) || '-',
      oldRole: readParam(log, ['oldRoleName', 'fromRole']) || '-',
      newRole: readParam(log, ['newRoleName', 'toRole']) || '-',
    }),
  REMOVE_MEMBER: (log) =>
    t('{user} 移除成员 {target}', {
      user: actorName(log),
      target: readParam(log, ['targetUserName']) || '-',
    }),
  TRANSFER_OWNERSHIP: (log) =>
    t('{user} 将项目 {project} 的所有权转让给 {target}', {
      user: actorName(log),
      project: readParam(log, ['projectName', 'name']) || resourceName(log),
      target: readParam(log, ['targetUserName']) || '-',
    }),
  // —— 文件危险操作 ——
  FILE_DELETE: (log) =>
    t('{user} 删除文件 {file}', {
      user: actorName(log),
      file: readParam(log, ['fileName', 'filePath', 'name']) || resourceName(log),
    }),
  FILE_SHARE: (log) =>
    // params.shareAction === 'revoke' 时为撤销分享（share.service revokeShare 埋点）
    log.params?.shareAction === 'revoke'
      ? t('{user} 取消分享文件 {file}', {
          user: actorName(log),
          file:
            readParam(log, ['fileName', 'filePath', 'name']) || resourceName(log),
        })
      : t('{user} 分享文件 {file}', {
          user: actorName(log),
          file:
            readParam(log, ['fileName', 'filePath', 'name']) || resourceName(log),
        }),
  // —— 文件变更（项目操作历史核心）——
  FILE_CREATE: (log) =>
    t('{user} 新增图纸 {file}', {
      user: actorName(log),
      file: readParam(log, ['fileName', 'filePath', 'name']) || resourceName(log),
    }),
  FILE_UPDATE: (log) =>
    t('{user} 修改图纸 {file}', {
      user: actorName(log),
      file: readParam(log, ['fileName', 'filePath', 'name']) || resourceName(log),
    }),
  // —— 节点操作（文件夹创建/重命名/移动/复制/恢复）——
  FOLDER_CREATE: (log) =>
    t('{user} 新建文件夹 {folder}', {
      user: actorName(log),
      folder: readParam(log, ['fileName', 'name']) || resourceName(log),
    }),
  NODE_RENAME: (log) =>
    t('{user} 将 {oldName} 重命名为 {newName}', {
      user: actorName(log),
      oldName: readParam(log, ['oldName']) || '-',
      newName: readParam(log, ['newName', 'fileName', 'name']) || resourceName(log),
    }),
  NODE_MOVE: (log) =>
    t('{user} 移动 {name}', {
      user: actorName(log),
      name: readParam(log, ['newName', 'fileName', 'name']) || resourceName(log),
    }),
  NODE_COPY: (log) =>
    t('{user} 复制 {name}', {
      user: actorName(log),
      name: readParam(log, ['fileName', 'name']) || resourceName(log),
    }),
  NODE_RESTORE: (log) =>
    t('{user} 从回收站恢复 {name}', {
      user: actorName(log),
      name: readParam(log, ['restoredName', 'fileName', 'name']) || resourceName(log),
    }),
  // —— 账号安全 ——
  USER_CHANGE_PASSWORD: (log) =>
    t('{user} 修改了密码', { user: actorName(log) }),
  USER_DEACTIVATE: (log) =>
    t('{user} 停用账号 {target}', {
      user: actorName(log),
      target: readParam(log, ['targetUserName']) || '-',
    }),
  USER_UNBIND_EMAIL: (log) => t('{user} 解绑了邮箱', { user: actorName(log) }),
  USER_UNBIND_PHONE: (log) =>
    t('{user} 解绑了手机号', { user: actorName(log) }),
  USER_UNBIND_WECHAT: (log) =>
    t('{user} 解绑了微信', { user: actorName(log) }),
  // —— 安全类：IP 黑名单 ——
  IP_BLACKLIST_ADD: (log) =>
    t('{user} 将 {ip} 加入 IP 黑名单', {
      user: actorName(log),
      ip: readParam(log, ['ip', 'ipAddress']) || '-',
    }),
  IP_BLACKLIST_REMOVE: (log) =>
    t('{user} 将 {ip} 移出 IP 黑名单', {
      user: actorName(log),
      ip: readParam(log, ['ip', 'ipAddress']) || '-',
    }),
  // —— 高频读（仅失败记录）——
  USER_LOGIN: (log) => t('{user} 登录失败', { user: actorName(log) }),
  FILE_UPLOAD: (log) =>
    t('{user} 上传文件 {file} 失败', {
      user: actorName(log),
      file: readParam(log, ['fileName', 'filePath', 'name']) || resourceName(log),
    }),
  FILE_DOWNLOAD: (log) =>
    t('{user} 下载文件 {file} 失败', {
      user: actorName(log),
      file: readParam(log, ['fileName', 'filePath', 'name']) || resourceName(log),
    }),
  // —— 过渡保留：auth 门面 ——
  USER_REGISTER: (log) => t('{user} 注册了账号', { user: actorName(log) }),
  USER_VERIFY_EMAIL: (log) => t('{user} 验证了邮箱', { user: actorName(log) }),
  USER_LOGOUT: (log) => t('{user} 登出了系统', { user: actorName(log) }),
  USER_BIND_EMAIL: (log) => t('{user} 绑定了邮箱', { user: actorName(log) }),
  USER_BIND_PHONE: (log) => t('{user} 绑定了手机号', { user: actorName(log) }),
  USER_REBIND_EMAIL: (log) =>
    t('{user} 重新绑定了邮箱', { user: actorName(log) }),
  USER_REBIND_PHONE: (log) =>
    t('{user} 重新绑定了手机号', { user: actorName(log) }),
  USER_BIND_WECHAT: (log) => t('{user} 绑定了微信', { user: actorName(log) }),
  // —— 过渡保留：alert ——
  ALERT_RESOLVE: (log) =>
    t('{user} 解决了告警 {alert}', {
      user: actorName(log),
      alert: resourceName(log),
    }),
};

/** 按 action 渲染审计记录的可读描述（未知 action 回退动作名 + 资源名） */
export function getActionDescription(log: AuditLog): string {
  const renderer = ACTION_TEMPLATES[log.action];
  if (renderer) {
    return renderer(log);
  }
  return t('{action}（{resource}）', {
    action: log.action,
    resource: resourceName(log),
  });
}

/**
 * 不含操作者的描述（操作历史弹窗专用：操作者由头像+名字独立展示，避免重复）。
 * 渲染时把 user 字段置空并清理前导空格，如 "{user} 新增图纸 drawing.dwg" → "新增图纸 drawing.dwg"。
 */
export function getActionDetail(log: AuditLog): string {
  const renderer = ACTION_TEMPLATES[log.action];
  if (!renderer) return resourceName(log);
  const text = renderer({
    ...log,
    user: { ...log.user, nickname: '', username: '', email: '' },
  });
  return text.replace(/^\s+/, '').trim();
}
