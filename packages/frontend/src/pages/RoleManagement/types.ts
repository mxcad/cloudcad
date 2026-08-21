export type SystemRole = {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

/**
 * 项目角色模板（isSystem=true, projectId=null）：创建项目时的默认角色，
 * 由系统管理员维护；项目创建时复制为项目自己的角色（ADR-00XX）。
 */
export type ProjectRoleTemplate = {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
  _count: {
    members: number;
  };
};

export type RoleType = 'system' | 'project';
