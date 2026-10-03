import { projectControllerGetProject } from '@/api-sdk';
import type { TransferMode } from '@/types/filesystem';
import {
  evaluateCrossProjectTransfer as platformEvaluateCrossProjectTransfer,
  type TransferDomain,
} from '@cloudcad/platform';

/**
 * 跨项目转移（粘贴/移动/复制）策略评估 —— 对齐后端
 * packages/backend/src/file-operations/node-mutation.guard.ts 的 6 域转移矩阵。
 *
 * 矩阵要点（与后端一一对应）：
 * - 出向：源为项目时，按「目标归属根类型」查 transferOut* 字段（→项目/个人空间/库）；
 * - 入向：目标为项目时，按「源归属根类型」查 transferIn* 字段；
 * - 非项目根（个人空间/库）无配置字段 → 恒允许，由归属权限兜底；
 * - 查询失败（settings 为 null）→ 保守拒绝（无法确认策略，UI 先行禁用）；
 * - 字段为 null（查询成功但未配置）→ 按默认放行（对齐后端 modeAllows(null → true)）。
 */

/** 操作类型：move=移动（含剪贴板剪切/粘贴），copy=复制 */
export type TransferOperation = 'move' | 'copy';

/** 归属根类型（对齐后端 OwnershipNode root type；仅 PROJECT 根有 6 域 transfer 字段） */
export type TransferRootKind = 'project' | 'personal-space' | 'library';

/**
 * 视图模式 → 归属根类型（useFileBrowserActions / useFileSystemUrlEffects 等共用，
 * 消除 `mode === 'personal-space' ? ... : 'project'` 的散落推导）
 */
export function resolveRootKindFromMode(
  mode: 'project' | 'personal-space'
): TransferRootKind {
  return mode === 'personal-space' ? 'personal-space' : 'project';
}

/** 项目 6 域 transfer 设置（与 ProjectDto / TransferSettings 对齐） */
export interface ProjectTransferSettings {
  transferOutToProject?: TransferMode | null;
  transferOutToPersonalSpace?: TransferMode | null;
  transferOutToLibrary?: TransferMode | null;
  transferInFromProject?: TransferMode | null;
  transferInFromPersonalSpace?: TransferMode | null;
  transferInFromLibrary?: TransferMode | null;
}

/**
 * 跨项目转移被拒绝的原因（值为 i18n 原文 key，可带 {action} 插值）。
 * action 由调用方按操作类型传入：move → 「移动」，copy → 「复制」。
 */
export const TRANSFER_BLOCK_REASONS = {
  /** 源项目出向策略查询失败（settings 为 null），无法确认允许 → 保守拒绝 */
  SOURCE_PROJECT_FORBIDDEN: '源项目未开放跨项目转移',
  /** 目标项目入向策略查询失败（settings 为 null），无法确认允许 → 保守拒绝 */
  TARGET_PROJECT_FORBIDDEN: '当前项目未开放跨项目转移',
  /** 源项目出向策略与操作类型不匹配（如仅 COPY_ONLY 但当前为移动） */
  SOURCE_MODE_MISMATCH: '源项目跨项目策略不允许{action}，已禁止',
  /** 目标项目入向策略与操作类型不匹配 */
  TARGET_MODE_MISMATCH: '当前项目跨项目策略不允许{action}，已禁止',
  /** 源为资源库且操作为移动 → 系统规则恒拒绝（copy 豁免） */
  LIBRARY_MOVE_FORBIDDEN: '不能从资源库移出文件',
} as const;

export type TransferBlockReasonKey =
  (typeof TRANSFER_BLOCK_REASONS)[keyof typeof TRANSFER_BLOCK_REASONS];

export interface CrossProjectTransferVerdict {
  allowed: boolean;
  crossProject: boolean;
  reasonKey?: TransferBlockReasonKey;
}

/** PC 归属根类型（`'personal-space'` kebab）→ platform 域（`'personalSpace'` camel） */
function toPlatformDomain(kind: TransferRootKind): TransferDomain {
  return kind === 'personal-space' ? 'personalSpace' : kind;
}

/**
 * 评估跨项目转移是否允许（粘贴/移动/复制共用）。
 * 判定口径已收敛到 `@cloudcad/platform` 的 `evaluateCrossProjectTransfer`
 * （6 域矩阵 + 库-move 预判，与移动端共用）；本函数只做入参映射 + 枚举→i18n 源串映射。
 */
export function evaluateCrossProjectTransfer(params: {
  operation: TransferOperation;
  sourceProjectId: string;
  targetProjectId: string;
  /** 源归属根类型（默认 'project'：粘贴/移动源均为项目视图） */
  sourceRootKind?: TransferRootKind;
  /** 目标归属根类型（默认 'project'） */
  targetRootKind?: TransferRootKind;
  /** 源项目 6 域设置（sourceRootKind !== 'project' 时无需传） */
  sourceSettings?: ProjectTransferSettings | null;
  /** 目标项目 6 域设置（targetRootKind !== 'project' 时无需传） */
  targetSettings?: ProjectTransferSettings | null;
}): CrossProjectTransferVerdict {
  const {
    operation,
    sourceProjectId,
    targetProjectId,
    sourceRootKind = 'project',
    targetRootKind = 'project',
    sourceSettings,
    targetSettings,
  } = params;

  // 同项目/无 id：无跨项目约束（保留原短路，避免空 id 误入 6 域检查）
  if (
    !sourceProjectId ||
    !targetProjectId ||
    sourceProjectId === targetProjectId
  ) {
    return { allowed: true, crossProject: false };
  }

  // 判定口径已收敛到 @cloudcad/platform（与移动端共用，含库-move 预判），
  // 本文件只做入参映射 + 枚举→i18n 源串映射。
  const verdict = platformEvaluateCrossProjectTransfer({
    operation,
    source: { id: sourceProjectId, domain: toPlatformDomain(sourceRootKind) },
    target: { id: targetProjectId, domain: toPlatformDomain(targetRootKind) },
    sourceSettings: sourceSettings ?? null,
    targetSettings: targetSettings ?? null,
  });

  return {
    allowed: verdict.allowed,
    crossProject: verdict.crossProject,
    reasonKey: verdict.reason
      ? TRANSFER_BLOCK_REASONS[verdict.reason]
      : undefined,
  };
}

/** 剪贴板模式（向后兼容粘贴场景） */
export type ClipboardMode = 'copy' | 'cut';

/**
 * 评估跨项目粘贴是否允许（剪贴板薄封装：cut → move，copy → copy）。
 * 粘贴目标恒为当前项目（project），源为剪贴板源项目（project）。
 */
export function evaluateCrossProjectPaste(params: {
  mode: ClipboardMode;
  sourceProjectId: string;
  targetProjectId: string;
  /** 源项目 transferOutToProject（复制/剪切时快照；缺失视为查询失败 → 保守拒绝） */
  sourceTransferOut?: TransferMode | null;
  /** 目标项目 transferInFromProject */
  targetTransferIn?: TransferMode | null;
}): CrossProjectTransferVerdict {
  const { mode, sourceProjectId, targetProjectId } = params;
  return evaluateCrossProjectTransfer({
    operation: mode === 'cut' ? 'move' : 'copy',
    sourceProjectId,
    targetProjectId,
    sourceSettings:
      params.sourceTransferOut == null
        ? null
        : { transferOutToProject: params.sourceTransferOut },
    targetSettings:
      params.targetTransferIn == null
        ? null
        : { transferInFromProject: params.targetTransferIn },
  });
}

/**
 * 查询项目 6 域 transfer 设置（仅 PROJECT 根有字段）。
 * 非项目根/权限不足/网络失败返回 null（调用方按保守拒绝处理）。
 */
export async function fetchProjectTransferSettings(
  projectId: string
): Promise<ProjectTransferSettings | null> {
  try {
    const res = await projectControllerGetProject({
      path: { projectId },
    });
    const data = res.data;
    if (!data || typeof data !== 'object') return null;
    return {
      transferOutToProject: data.transferOutToProject ?? null,
      transferOutToPersonalSpace: data.transferOutToPersonalSpace ?? null,
      transferOutToLibrary: data.transferOutToLibrary ?? null,
      transferInFromProject: data.transferInFromProject ?? null,
      transferInFromPersonalSpace: data.transferInFromPersonalSpace ?? null,
      transferInFromLibrary: data.transferInFromLibrary ?? null,
    };
  } catch {
    return null;
  }
}
