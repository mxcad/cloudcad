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

/**
 * 无节点（游客 / 公开图纸）转换完成 SSE 通道（per 文件 hash）。
 *
 * 游客无 token，订阅不了 per-user 通道；前端经公开 SSE 端点
 * `GET /mxcad/conversion/file-stream?hash=<hash>` 订阅。无节点转换在后台完成
 * （成功/失败）后在 `CONVERSION_FILE_CHANNEL(hash)` 上 emit `{ hash, status }`，
 * 前端收到即打开 mxweb（latest-wins：只打开最后打开的那个文件）。
 */
export const CONVERSION_FILE_CHANNEL = (hash: string): string =>
  `conversion-file.changed.${hash}`;

/** 事件负载：无节点转换完成 */
export interface ConversionFileSseEvent {
  hash: string;
  status: 'COMPLETED' | 'FAILED';
}
