import { Injectable } from '@nestjs/common';
import {
  type RestrictionStrategy,
  type RestrictionContext,
  type RestrictionResult,
} from '../interfaces/restriction-strategy.interface';
import { QUOTA_KEYS } from '../quota-keys';
import { StorageUsageService } from '../storage-usage/storage-usage.service';

@Injectable()
export class PersonalStorageStrategy implements RestrictionStrategy {
  readonly key = QUOTA_KEYS.PERSONAL_STORAGE;

  constructor(private readonly storageUsageService: StorageUsageService) {}

  async check(ctx: RestrictionContext): Promise<RestrictionResult> {
    const limitMB =
      (ctx.tierConfig[QUOTA_KEYS.PERSONAL_STORAGE] as number | undefined) ?? 0;
    if (limitMB <= 0) {
      return { allowed: true, key: QUOTA_KEYS.PERSONAL_STORAGE };
    }

    const current = await this.storageUsageService.usageSize({
      kind: 'personal',
      userId: ctx.userId,
    });

    const limitBytes = limitMB * 1024 * 1024;
    const increment = ctx.incrementBytes ?? 0;

    if (current + increment > limitBytes) {
      return {
        allowed: false,
        key: QUOTA_KEYS.PERSONAL_STORAGE,
        messageKey: 'error.quota.personal_storage_exceeded',
        messageArgs: { limit: limitMB },
        current: current + increment,
        limit: limitBytes,
        configLimit: limitMB,
      };
    }

    return {
      allowed: true,
      key: QUOTA_KEYS.PERSONAL_STORAGE,
      current: current + increment,
      limit: limitBytes,
      configLimit: limitMB,
    };
  }
}
