import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import type { IRoleRepository, RoleRecord } from '@cloudcad/contracts';

@Injectable()
export class RoleRepository implements IRoleRepository {
  constructor(private readonly prisma: DatabaseService) {}

  async findByName(name: string): Promise<RoleRecord | null> {
    return this.prisma.role.findFirst({ where: { name } }) as any;
  }
}
