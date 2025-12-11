/**
 * 项目相关类型定义
 */

import { ProjectStatus, ProjectMemberRole, Permission } from './enums';

export interface Project {
  /** 项目ID */
  id: string;
  /** 项目名称 */
  name: string;
  /** 项目描述 */
  description?: string;
  /** 项目状态 */
  status: ProjectStatus;
  /** 项目所有者ID */
  ownerId: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

export interface CreateProjectDto {
  /** 项目名称 */
  name: string;
  /** 项目描述 */
  description?: string;
}

export interface UpdateProjectDto {
  /** 项目名称 */
  name?: string;
  /** 项目描述 */
  description?: string;
  /** 项目状态 */
  status?: ProjectStatus;
}

export interface ProjectMember {
  /** 成员ID */
  id: string;
  /** 用户ID */
  userId: string;
  /** 项目ID */
  projectId: string;
  /** 成员角色 */
  role: ProjectMemberRole;
  /** 加入时间 */
  joinedAt: string;
}

export interface AddProjectMemberDto {
  /** 用户ID */
  userId: string;
  /** 成员角色 */
  role: ProjectMemberRole;
}

export interface UpdateProjectMemberDto {
  /** 成员角色 */
  role: ProjectMemberRole;
}

export interface ProjectWithMembers extends Project {
  /** 项目成员 */
  members: (ProjectMember & {
    user: {
      id: string;
      email: string;
      username: string;
      nickname?: string;
      avatar?: string;
    };
  })[];
  /** 用户在项目中的角色 */
  userRole?: ProjectMemberRole;
  /** 用户在项目中的权限 */
  userPermissions?: Permission[];
}