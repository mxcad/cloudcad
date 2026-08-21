import { HttpException, HttpStatus } from '@nestjs/common';

export interface QuotaExceededExceptionDetails {
  restrictionKey: string;
  current?: number;
  limit?: number;
  configLimit?: number;
  need?: number;
  metadata?: Record<string, unknown>;
}

export class QuotaExceededException extends HttpException {
  constructor(message: string, details: QuotaExceededExceptionDetails) {
    super(
      {
        code: 'QUOTA_EXCEEDED',
        message,
        ...details,
      },
      HttpStatus.FORBIDDEN,
    );
    this.name = 'QuotaExceededException';
  }
}
