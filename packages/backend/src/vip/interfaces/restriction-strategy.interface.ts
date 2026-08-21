export const RESTRICTION_STRATEGY = 'RESTRICTION_STRATEGY';

export interface RestrictionContext {
  userId: string;
  projectId?: string;
  incrementBytes?: number;
  tierLevel: number;
  tierConfig: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface RestrictionResult {
  allowed: boolean;
  key: string;
  message?: string;
  messageKey?: string;
  messageArgs?: Record<string, unknown>;
  current?: number;
  limit?: number;
  configLimit?: number;
  need?: number;
}

export interface RestrictionStrategy {
  readonly key: string;
  check(ctx: RestrictionContext): Promise<RestrictionResult>;
}
