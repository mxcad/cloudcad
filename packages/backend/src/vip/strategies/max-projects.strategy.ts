import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  type RestrictionStrategy,
  type RestrictionContext,
  type RestrictionResult,
} from '../interfaces/restriction-strategy.interface';
import { QUOTA_KEYS } from '../quota-keys';

@Injectable()
export class MaxProjectsStrategy implements RestrictionStrategy {
  readonly key = QUOTA_KEYS.MAX_PROJECTS;

  constructor(private prisma: DatabaseService) {}

  async check(ctx: RestrictionContext): Promise<RestrictionResult> {
    const maxProjects =
      (ctx.tierConfig[QUOTA_KEYS.MAX_PROJECTS] as number | undefined) ?? 0;
    if (maxProjects <= 0) {
      return { allowed: true, key: QUOTA_KEYS.MAX_PROJECTS };
    }

    const projectCount = await this.prisma.fileSystemNode.count({
      where: { ownerId: ctx.userId, nodeType: 'PROJECT', deletedAt: null },
    });

    const additional =
      ctx.metadata?.predictedAdditional !== undefined
        ? Number(ctx.metadata.predictedAdditional)
        : 1;

    if (projectCount + additional > maxProjects) {
      return {
        allowed: false,
        key: QUOTA_KEYS.MAX_PROJECTS,
        messageKey: 'error.quota.max_projects_exceeded',
        messageArgs: { current: projectCount, limit: maxProjects },
        current: projectCount,
        limit: maxProjects,
        configLimit: maxProjects,
        need: projectCount + additional - maxProjects,
      };
    }

    return {
      allowed: true,
      key: QUOTA_KEYS.MAX_PROJECTS,
      current: projectCount,
      limit: maxProjects,
      configLimit: maxProjects,
    };
  }
}
