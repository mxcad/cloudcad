/**
 * 文件节点状态（FileStatus）词表 —— PC 前端唯一出口。
 *
 * 值与后端 Prisma `FileStatus` 枚举一致（UPLOADING / PROCESSING / COMPLETED /
 * FAILED / DELETED）。此前这 5 个值以字符串字面量散在 8 个文件里，全仓无单点
 * 定义，改任一处只能靠全仓 grep。
 *
 * 更实质的问题在「就绪判据」的两套口径：`waitForFileReady` 按
 * `fileHash && path` 判就绪、按裸 `'FAILED'` 判失败；`waitForConversion` 按
 * `fileStatus === 'COMPLETED'` 判就绪、按 `{FAILED, DELETED}` 判失败。判据互不
 * 重叠时，同一张图纸一条入口能开、另一条干等满 120s 超时——同一份缓存给出相反
 * 结论。这里把状态值与判定谓词收进一处，两个轮询只保留各自的时序与副作用。
 *
 * 刻意不合并成单一 `waitForNodeReady`：两者打的是不同端点（node 详情 vs
 * conversion 状态）、返回形状不同（节点 DTO vs ConversionStatus）、副作用不同
 * （waitForFileReady 驱动 loading 进度与转换队列刷新/广播，waitForConversion 无副作用
 * 且自带 autoTrigger 与 FAILED 重试）。判据层面的分叉才是上面那个 bug 的根因，已在此收口；
 * 传输层口径也已对齐（两个轮询都显式处理 SDK 不抛错时落在 `response.error` 的失败）。
 *
 * 本模块只定义状态值与判定谓词，不含轮询 / 触发 / IO（那是 hooks 与 services 的职责）。
 */

export const FILE_STATUS = {
  /** 上传中 */
  UPLOADING: 'UPLOADING',
  /** 格式转换中 */
  PROCESSING: 'PROCESSING',
  /** 转换完成 */
  COMPLETED: 'COMPLETED',
  /** 转换失败 */
  FAILED: 'FAILED',
  /** 已删除（回收站；转换/落盘失败后节点被删时也落到这里） */
  DELETED: 'DELETED',
} as const;

export type FileStatusValue = (typeof FILE_STATUS)[keyof typeof FILE_STATUS];

/**
 * 终态失败集合：FAILED（转换失败）与 DELETED（转换/落盘失败后节点被删，或移入回收站）。
 * 两者都必须**立即**终止等待，继续轮询只会空等满超时（默认 60×2s=120s）。
 */
export const TERMINAL_FAILURE_STATUSES: ReadonlySet<FileStatusValue> = new Set([
  FILE_STATUS.FAILED,
  FILE_STATUS.DELETED,
]);

/** 是否终态失败。null/undefined 视为未知，不判失败。 */
export function isTerminalFailureStatus(
  status: string | null | undefined
): status is FileStatusValue {
  return !!status && TERMINAL_FAILURE_STATUSES.has(status as FileStatusValue);
}

/**
 * 是否转换失败（**不含** DELETED）。
 *
 * 「转换失败」徽标的口径：DELETED 的节点可能从未进入转换（直接被删、或在回收站），
 * 给它挂「转换失败」标签是把「不知道」伪装成「已知失败」，故此处不并入终态集合。
 */
export function isFailedStatus(status: string | null | undefined): boolean {
  return status === FILE_STATUS.FAILED;
}

/** 是否转换完成（节点级状态口径）。 */
export function isCompletedStatus(status: string | null | undefined): boolean {
  return status === FILE_STATUS.COMPLETED;
}

/**
 * 是否已在转换中——「是否需要触发一次转换」的判据：非 PROCESSING 才需要触发。
 */
export function isProcessingStatus(status: string | null | undefined): boolean {
  return status === FILE_STATUS.PROCESSING;
}

/** 是否上传中（队列面板把 UPLOADING 归为 pending）。 */
export function isUploadingStatus(status: string | null | undefined): boolean {
  return status === FILE_STATUS.UPLOADING;
}

/** 是否已删除。 */
export function isDeletedStatus(status: string | null | undefined): boolean {
  return status === FILE_STATUS.DELETED;
}

/**
 * 产物是否真的就位——引擎打开口径的**唯一就绪判据**。
 *
 * `path` 由落盘时才写入，是产物已就位的最强信号；`fileHash` 是产物身份。
 * 就绪 = 两者齐备，**不**等价于 `fileStatus === 'COMPLETED'`：后者会把
 * 「状态还没翻到 COMPLETED 但 path 已就位」的节点误判为未就绪，进而 autoTrigger
 * 重发一次转换 + 最长 120s 轮询，而另一条入口对同一文件秒开。
 */
export function hasReadyArtifact<
  T extends { fileHash?: string | null; path?: string | null },
>(node: T | null | undefined): node is T & { fileHash: string; path: string } {
  return !!node && !!node.fileHash && !!node.path;
}
