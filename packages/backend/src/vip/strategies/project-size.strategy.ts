import { Injectable } from '@nestjs/common';
import {
  type RestrictionStrategy,
  type RestrictionContext,
  type RestrictionResult,
} from '../interfaces/restriction-strategy.interface';
import { QUOTA_KEYS } from '../quota-keys';
import { StorageUsageService } from '../storage-usage/storage-usage.service';

@Injectable()
export class ProjectSizeStrategy implements RestrictionStrategy {
  readonly key = QUOTA_KEYS.PROJECT_SIZE;

  constructor(private readonly storageUsageService: StorageUsageService) {}

  async check(ctx: RestrictionContext): Promise<RestrictionResult> {
    const limitMB =
      (ctx.tierConfig[QUOTA_KEYS.PROJECT_SIZE] as number | undefined) ?? 0;
    if (limitMB <= 0) {
      return { allowed: true, key: QUOTA_KEYS.PROJECT_SIZE };
    }

    if (!ctx.projectId) {
      return { allowed: true, key: QUOTA_KEYS.PROJECT_SIZE };
    }

    const current = await this.storageUsageService.usageSize({
      kind: 'project',
      projectId: ctx.projectId,
    });

    const limitBytes = limitMB * 1024 * 1024;
    const increment = ctx.incrementBytes ?? 0;

    if (current + increment > limitBytes) {
      return {
        allowed: false,
        key: QUOTA_KEYS.PROJECT_SIZE,
        messageKey: 'error.quota.project_size_exceeded',
        messageArgs: { limit: limitMB },
        current: current + increment,
        limit: limitBytes,
        configLimit: limitMB,
      };
    }

    return {
      allowed: true,
      key: QUOTA_KEYS.PROJECT_SIZE,
      current: current + increment,
      limit: limitBytes,
      configLimit: limitMB,
    };
  }
}
