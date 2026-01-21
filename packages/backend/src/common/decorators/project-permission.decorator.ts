import { SetMetadata } from '@nestjs/common';
import { NodeAccessRole } from '../enums/permissions.enum';

export const NODE_PERMISSION_KEY = 'nodePermission';

/**
 * 节点权限装饰器
 * 用于控制对 FileSystemNode（项目、文件夹、文件）的访问
 * @param roles 允许访问的角色
 */
export const NodePermission = (...roles: NodeAccessRole[]) =>
  SetMetadata(NODE_PERMISSION_KEY, roles);

// 保持向后兼容
export const PROJECT_PERMISSION_KEY = NODE_PERMISSION_KEY;
export const ProjectPermission = (...roles: NodeAccessRole[]) =>
  SetMetadata(NODE_PERMISSION_KEY, roles);
