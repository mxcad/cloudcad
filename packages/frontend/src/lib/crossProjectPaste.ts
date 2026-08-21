import { projectControllerGetProject } from '@/api-sdk';
import type { TransferMode } from '@/types/filesystem';

/**
 * 跨项目转移（粘贴/移动/复制）策略评估 —— 对齐后端
 * packages/backend/src/file-operations/node-mutation.guard.ts 的 6 域转移矩阵。
 *
 * 矩阵要点（与后端一一对应）：
 * - 出向：源为项目时，按「目标归属根类型」查 transferOut* 字段（→项目/个人空间/库）；
 * - 入向：目标为项目时，按「源归属根类型」查 transferIn* 字段；
 * - 非项目根（个人空间/库）无配置字段 → 恒允许，由归属权限兜底；
 * - 查询失败（settings 为 null）→ 保守拒绝（无法确认策略，UI 先行禁用）。
 */

/** 操作类型：move=移动（含剪贴板剪切/粘贴），copy=复制 */
export type TransferOperation = 'move' | 'copy';

/** 归属根类型（对齐后端 OwnershipNode root type；仅 PROJECT 根有 6 域 transfer 字段） */
export type TransferRootKind = 'project' | 'personal-space' | 'library';

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
  /** 源项目出向策略缺失/查询失败，无法确认允许 → 保守拒绝 */
  SOURCE_PROJECT_FORBIDDEN: '源项目未开放跨项目转移',
  /** 目标项目入向策略缺失/查询失败，无法确认允许 → 保守拒绝 */
  TARGET_PROJECT_FORBIDDEN: '当前项目未开放跨项目转移',
  /** 源项目出向策略与操作类型不匹配（如仅 COPY_ONLY 但当前为移动） */
  SOURCE_MODE_MISMATCH: '源项目跨项目策略不允许{action}，已禁止',
  /** 目标项目入向策略与操作类型不匹配 */
  TARGET_MODE_MISMATCH: '当前项目跨项目策略不允许{action}，已禁止',
} as const;

export type TransferBlockReasonKey =
  (typeof TRANSFER_BLOCK_REASONS)[keyof typeof TRANSFER_BLOCK_REASONS];

export interface CrossProjectTransferVerdict {
  allowed: boolean;
  crossProject: boolean;
  reasonKey?: TransferBlockReasonKey;
}

/** 出向字段选择：源为项目时，按目标域类型取 transferOut* 字段（对齐后端 TRANSFER_OUT_FIELD） */
const TRANSFER_OUT_FIELD: Record<
  TransferRootKind,
  keyof ProjectTransferSettings
> = {
  project: 'transferOutToProject',
  'personal-space': 'transferOutToPersonalSpace',
  library: 'transferOutToLibrary',
};

/** 入向字段选择：目标为项目时，按源域类型取 transferIn* 字段（对齐后端 TRANSFER_IN_FIELD） */
const TRANSFER_IN_FIELD: Record<
  TransferRootKind,
  keyof ProjectTransferSettings
> = {
  project: 'transferInFromProject',
  'personal-space': 'transferInFromPersonalSpace',
  library: 'transferInFromLibrary',
};

/**
 * 策略是否放行指定操作（对齐后端 modeAllows）：
 * ALL 全放行；COPY_ONLY 仅复制；MOVE_ONLY 仅移动；NONE 拒绝。
 * 注意：此处仅处理非 null 设置，null 由调用方在 evaluate 中按「保守拒绝」处理
 * （区别于后端「非项目根 null=恒允许」——前端无法区分查询失败与非项目根，
 * 故由调用方通过 rootKind 跳过检查，真正进入检查时 null 即视为不可确认）。
 */
function operationAllows(
  operation: TransferOperation,
  setting: TransferMode
): boolean {
  if (setting === 'ALL') return true;
  if (operation === 'copy') return setting === 'COPY_ONLY';
  return setting === 'MOVE_ONLY';
}

/**
 * 评估跨项目转移是否允许（粘贴/移动/复制共用）。
 *
 * 判定规则（与后端 6 域矩阵一致）：
 * - 同项目或任一侧域非项目根（sourceRootKind / targetRootKind 非 'project'）时，
 *   仅对项目侧做策略检查；非项目侧无字段恒允许。
 * - 出向：sourceRootKind === 'project' 时查 sourceSettings[transferOut*目标域]；
 * - 入向：targetRootKind === 'project' 时查 targetSettings[transferIn*源域]；
 * - 两向都放行才 allowed；任一设置缺失（null）→ 保守拒绝（FORBIDDEN）。
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

  if (
    !sourceProjectId ||
    !targetProjectId ||
    sourceProjectId === targetProjectId
  ) {
    return { allowed: true, crossProject: false };
  }

  // 出向：源为项目时，按目标域类型查 transferOut* 字段
  if (sourceRootKind === 'project') {
    const field = TRANSFER_OUT_FIELD[targetRootKind];
    const setting = sourceSettings?.[field];
    if (setting == null || !operationAllows(operation, setting)) {
      return {
        allowed: false,
        crossProject: true,
        reasonKey:
          setting == null
            ? TRANSFER_BLOCK_REASONS.SOURCE_PROJECT_FORBIDDEN
            : TRANSFER_BLOCK_REASONS.SOURCE_MODE_MISMATCH,
      };
    }
  }

  // 入向：目标为项目时，按源域类型查 transferIn* 字段
  if (targetRootKind === 'project') {
    const field = TRANSFER_IN_FIELD[sourceRootKind];
    const setting = targetSettings?.[field];
    if (setting == null || !operationAllows(operation, setting)) {
      return {
        allowed: false,
        crossProject: true,
        reasonKey:
          setting == null
            ? TRANSFER_BLOCK_REASONS.TARGET_PROJECT_FORBIDDEN
            : TRANSFER_BLOCK_REASONS.TARGET_MODE_MISMATCH,
      };
    }
  }

  return { allowed: true, crossProject: true };
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
