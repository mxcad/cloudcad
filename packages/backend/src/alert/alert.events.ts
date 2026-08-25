/**
 * AlertService 领域事件常量（#311）
 * 通过 @nestjs/event-emitter 全局总线发布，AlertNotificationService 订阅消费
 */

/** 告警触发/刷新后发布，payload 为 AlertRecord */
export const ALERT_RAISED_EVENT = 'alert.raised';

/** 告警解决（自动恢复或手动兜底）后发布，payload 为已置 RESOLVED 的 AlertRecord */
export const ALERT_RESOLVED_EVENT = 'alert.resolved';
