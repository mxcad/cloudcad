/**
 * S4-3 转换任务状态变更 SSE 事件通道（单一事实源）。
 *
 * per-user 通道：`AsyncConversionService.updateNodeStatus` 终态变更后在
 * `CONVERSION_TASK_CHANNEL(ownerId)` 上 emit `{ nodeId, status }`；
 * `ConversionTaskSseService` 订阅同一通道，向前端 EventSource 推送刷新信号。
 * 面板数据源是「当前用户可访问的云端任务」，故按 ownerId 分通道（一个 EventSource
 * 连接覆盖该用户全部任务）；项目成员（非 owner）无独立通道，靠面板轮询兜底。
 */
export const CONVERSION_TASK_CHANNEL = (userId: string): string =>
  `conversion-task.changed.${userId}`;

/** 事件负载：节点终态变更 */
export interface ConversionTaskSseEvent {
  nodeId: string;
  status: string;
}
