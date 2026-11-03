/////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
/////////////////////////////////////////////////////////////////////////////////

import type { ConversionOptions } from '../interfaces/file-conversion.interface';

/**
 * 「摄入方向」（CAD 源 → mxweb）转换参数唯一出口。
 *
 * 摄入方向的所有转换都建预加载数据——`createPreloadingData: true` 是区分
 * 「摄入方向（打开/上传/外部参照）」与「导出下载方向（mxweb → dwg/pdf/…）」
 * 的方向标记。此前该标记散在 8 个调用点各写一份，任一处漏抄都会让那条路径
 * 不建预加载数据，且外部参照轮询（checkMissingReferences）永远等不到。
 *
 * `debugNodeId` 声明为**必填**（值可为 `undefined`）：失败调试信息
 * （saveConversionDebugInfo）只在该字段非空时落盘。此前它是选填，8 条摄入路径里
 * 有多条静默漏传，外部参照 DWG 上传与无节点转换失败时完全不落失败现场，
 * 只能靠裸 stdout 日志排障。改为必填后，「没有节点可挂」的路径必须显式给值——
 * 漏传变成编译错误而非默认静默。
 *
 * 无节点（未登录/游客/公开图纸/外部参照/内部流水线）路径现用稳定标识兜底做落盘目录名
 * （通常为文件 hash，无 hash 时用输出文件名），失败现场与有节点路径一样落盘——
 * 否则未登录用户转换失败同样丢原因（只看到一句远端文案、引擎输出从不过线）。
 */
export type IngestConversionInput = {
  /** 源文件路径 */
  srcPath: string;
  /** 文件哈希 */
  fileHash: string;
  /** 失败调试信息落盘的目录标识：有节点用 nodeId，无节点用文件 hash/输出文件名兜底 */
  debugNodeId: string | undefined;
} & Omit<
  ConversionOptions,
  'srcPath' | 'fileHash' | 'createPreloadingData' | 'debugNodeId'
>;

export function buildIngestConversionOptions(
  input: IngestConversionInput
): ConversionOptions {
  return {
    ...input,
    createPreloadingData: true,
  };
}
