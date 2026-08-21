import type { RoleRecord } from '../domain/user.types';

export const ROLE_REPOSITORY = 'ROLE_REPOSITORY';

export interface IRoleRepository {
  findByName(name: string): Promise<RoleRecord | null>;
}
