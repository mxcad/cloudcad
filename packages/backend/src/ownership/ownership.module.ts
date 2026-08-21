import { Module } from '@nestjs/common';
import { RolesModule } from '../roles/roles.module';
import { PermissionModule } from '../permission/permission.module';
import { OwnershipPermissionFactory } from './factories/ownership-permission.factory';
import { ProjectPermissionStrategy } from './strategies/project-permission.strategy';
import { PersonalPermissionStrategy } from './strategies/personal-permission.strategy';
import { LibraryPermissionStrategy } from './strategies/library-permission.strategy';

@Module({
  imports: [RolesModule, PermissionModule],
  providers: [
    OwnershipPermissionFactory,
    ProjectPermissionStrategy,
    PersonalPermissionStrategy,
    LibraryPermissionStrategy,
  ],
  exports: [
    OwnershipPermissionFactory,
  ],
})
export class OwnershipModule {}
