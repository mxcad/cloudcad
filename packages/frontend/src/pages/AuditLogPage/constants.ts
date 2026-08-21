import { t } from '@/languages';
import { AuditAction, ResourceType } from './types';
import type { AuditFilters } from './types';

// 操作类型中文映射（模块级 t()，与原文件行为一致）
const ACTION_NAME_MAP: Record<string, string> = {
  PERMISSION_GRANT: t('授予权限'),
  PERMISSION_REVOKE: t('撤销权限'),
  ROLE_CREATE: t('创建角色'),
  ROLE_UPDATE: t('更新角色'),
  ROLE_DELETE: t('删除角色'),
  PROJECT_CREATE: t('创建项目'),
  PROJECT_DELETE: t('删除项目'),
  PROJECT_UPDATE: t('更新项目设置'),
  PROJECT_TRANSFER: t('转让项目'),
  ADD_MEMBER: t('添加成员'),
  UPDATE_MEMBER: t('更新成员'),
  REMOVE_MEMBER: t('移除成员'),
  TRANSFER_OWNERSHIP: t('转让所有权'),
  FILE_DELETE: t('删除文件'),
  FILE_SHARE: t('分享文件'),
  FILE_CREATE: t('新增图纸'),
  FILE_UPDATE: t('修改图纸'),
  FOLDER_CREATE: t('新建文件夹'),
  NODE_RENAME: t('重命名'),
  NODE_MOVE: t('移动'),
  NODE_COPY: t('复制'),
  NODE_RESTORE: t('从回收站恢复'),
  USER_CHANGE_PASSWORD: t('修改密码'),
  USER_DEACTIVATE: t('停用账号'),
  USER_UNBIND_EMAIL: t('解绑邮箱'),
  USER_UNBIND_PHONE: t('解绑手机'),
  USER_UNBIND_WECHAT: t('解绑微信'),
  IP_BLACKLIST_ADD: t('加入 IP 黑名单'),
  IP_BLACKLIST_REMOVE: t('移出 IP 黑名单'),
  USER_LOGIN: t('用户登录'),
  FILE_UPLOAD: t('上传文件'),
  FILE_DOWNLOAD: t('下载文件'),
  USER_REGISTER: t('注册账号'),
  USER_VERIFY_EMAIL: t('验证邮箱'),
  USER_LOGOUT: t('用户登出'),
  USER_BIND_EMAIL: t('绑定邮箱'),
  USER_BIND_PHONE: t('绑定手机'),
  USER_REBIND_EMAIL: t('重新绑定邮箱'),
  USER_REBIND_PHONE: t('重新绑定手机'),
  USER_BIND_WECHAT: t('绑定微信'),
  ALERT_RESOLVE: t('解决告警'),
};

// 资源类型中文映射
const RESOURCE_TYPE_MAP: Record<string, string> = {
  SYSTEM: t('系统'),
  USER: t('用户'),
  ROLE: t('角色'),
  PERMISSION: t('权限'),
  PROJECT: t('项目'),
  FILE: t('文件'),
  FOLDER: t('文件夹'),
  ALERT: t('告警'),
  IpBlacklistEntry: t('IP 黑名单'),
};

export const AUDIT_ACTIONS = Object.values(AuditAction);
export const RESOURCE_TYPES = Object.values(ResourceType);

export const DEFAULT_FILTERS: AuditFilters = {
  userId: '',
  action: [],
  resourceType: [],
  resourceId: '',
  projectId: '',
  startDate: '',
  endDate: '',
  success: '',
};

export const getActionDisplayName = (action: string): string =>
  t(ACTION_NAME_MAP[action] || action);

export const getResourceTypeDisplayName = (resourceType: string): string =>
  t(RESOURCE_TYPE_MAP[resourceType] || resourceType);

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};
