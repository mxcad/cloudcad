import { SetMetadata } from '@nestjs/common';
import { ProjectRole } from '../enums/permissions.enum';

export const NODE_PERMISSION_KEY = 'nodePermission';

/**
 * 节点权限装饰器
 * 用于控制对 FileSystemNode（项目、文件夹、文件）的访问
 * @param roles 允许访问的角色
 */
export const NodePermission = (...roles: ProjectRole[]) =>
  SetMetadata(NODE_PERMISSION_KEY, roles);
