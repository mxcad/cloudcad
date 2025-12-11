import { SetMetadata } from '@nestjs/common';
import { ProjectMemberRole } from '../enums/permissions.enum';

export const PROJECT_PERMISSION_KEY = 'projectPermission';
export const ProjectPermission = (...roles: ProjectMemberRole[]) =>
  SetMetadata(PROJECT_PERMISSION_KEY, roles);
