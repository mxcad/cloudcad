import { BasePolicy } from './base-policy';
import {
  IPermissionPolicy,
  PolicyContext,
  PolicyEvaluationResult,
  PolicyConfigSchema,
} from '../interfaces/permission-policy.interface';

/**
 * 时间策略配置
 */
export interface TimePolicyConfig {
  /** 允许的时间段（开始时间，格式：HH:mm） */
  startTime: string;
  /** 允许的时间段（结束时间，格式：HH:mm） */
  endTime: string;
  /** 允许的工作日（0=周日, 1=周一, ..., 6=周六） */
  allowedDays?: number[];
  /** 时区（默认为系统时区） */
  timezone?: string;
}

/**
 * 时间策略
 *
 * 基于时间段的访问控制，可以配置允许访问的时间范围和工作日
 */
export class TimePolicy extends BasePolicy implements IPermissionPolicy {
  private config: TimePolicyConfig;

  constructor(policyId: string, config: TimePolicyConfig) {
    super(policyId);
    this.config = config;
  }

  getType(): string {
    return 'TIME';
  }

  getName(): string {
    return '时间策略';
  }

  getDescription(): string {
    return `基于时间段的访问控制，允许在 ${this.config.startTime}-${this.config.endTime} 访问`;
  }

  async evaluate(context: PolicyContext): Promise<PolicyEvaluationResult> {
    const currentTime = context.time || new Date();
    const hour = currentTime.getHours();
    const minute = currentTime.getMinutes();
    const day = currentTime.getDay();

    // 解析开始和结束时间
    const [startHour, startMinute] = this.parseTime(this.config.startTime);
    const [endHour, endMinute] = this.parseTime(this.config.endTime);

    // 计算当前时间的分钟数
    const currentMinutes = hour * 60 + minute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    // 检查是否在允许的时间范围内
    let inTimeRange = false;
    if (startMinutes <= endMinutes) {
      // 同一天内的时间范围（如 09:00 - 18:00）
      inTimeRange =
        currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      // 跨天的时间范围（如 22:00 - 06:00）
      inTimeRange =
        currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }

    if (!inTimeRange) {
      return this.createDeniedResult(
        `当前时间 ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} 不在允许的时间范围 ${this.config.startTime}-${this.config.endTime} 内`
      );
    }

    // 检查是否在允许的工作日内
    if (this.config.allowedDays && this.config.allowedDays.length > 0) {
      if (!this.config.allowedDays.includes(day)) {
        const dayNames = [
          '周日',
          '周一',
          '周二',
          '周三',
          '周四',
          '周五',
          '周六',
        ];
        return this.createDeniedResult(
          `当前是 ${dayNames[day]}，不在允许的工作日内`
        );
      }
    }

    return this.createAllowedResult();
  }

  /**
   * 解析时间字符串（格式：HH:mm）
   */
  private parseTime(timeStr: string): [number, number] {
    const parts = timeStr.split(':');
    if (parts.length !== 2) {
      throw new Error(`无效的时间格式: ${timeStr}`);
    }
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    if (
      isNaN(hour) ||
      isNaN(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      throw new Error(`无效的时间值: ${timeStr}`);
    }
    return [hour, minute];
  }

  validateConfig(config: Record<string, unknown>): boolean {
    if (!super.validateConfig(config)) {
      return false;
    }

    const timeConfig = config as unknown as TimePolicyConfig;

    // 验证时间格式
    try {
      this.parseTime(timeConfig.startTime);
      this.parseTime(timeConfig.endTime);
    } catch (error) {
      this.logger.warn(`时间格式验证失败: ${error.message}`);
      return false;
    }

    // 验证工作日范围
    if (timeConfig.allowedDays) {
      for (const day of timeConfig.allowedDays) {
        if (day < 0 || day > 6) {
          this.logger.warn(`无效的工作日值: ${day}`);
          return false;
        }
      }
    }

    return true;
  }

  getConfigSchema(): PolicyConfigSchema {
    return {
      properties: {
        startTime: {
          type: 'string',
          description: '允许访问的开始时间（格式：HH:mm）',
          default: '09:00',
        },
        endTime: {
          type: 'string',
          description: '允许访问的结束时间（格式：HH:mm）',
          default: '18:00',
        },
        allowedDays: {
          type: 'array',
          description: '允许访问的工作日（0=周日, 1=周一, ..., 6=周六）',
          items: {
            type: 'number',
            description: '工作日（0-6）',
            minimum: 0,
            maximum: 6,
          },
        },
        timezone: {
          type: 'string',
          description: '时区（默认为系统时区）',
          default: 'Asia/Shanghai',
        },
      },
      required: ['startTime', 'endTime'],
    };
  }
}
