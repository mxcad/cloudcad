import { SetMetadata } from '@nestjs/common';
import { FileAccessRole } from '../enums/permissions.enum';

export const FILE_PERMISSION_KEY = 'filePermission';
export const FilePermission = (...roles: FileAccessRole[]) =>
  SetMetadata(FILE_PERMISSION_KEY, roles);
