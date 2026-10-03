/**
 * 跨项目转移（移动/复制）策略预判——跨端共享的纯判定。
 *
 * 对齐后端 `packages/backend/src/file-operations/node-mutation.guard.ts` 的 6 域转移矩阵，
 * 并统一两端此前的分叉：
 * - PC `lib/crossProjectPaste.ts`（入参 id+rootKind、reasonKey 为 i18n 源串、无库-move 预判）；
 * - 移动端 `utils/transferPolicy.ts`（入参 TransferRoot、reasonKey+reasonParams、**多一条「源为库且 move 恒拒绝」**）。
 *
 * 口径决策（产品已定）：
 * ① 库-move 禁令收进预判层（源为库且 move 恒拒绝，copy 豁免）——两端统一，PC 原在 UI 层；
 * ② 入参统一为 `{ source, target }`（`{ id, domain }`）；
 * ③ reason 统一为**枚举**（非 i18n 文案，文案映射留端包）。
 *
 * 后端仍是最终裁决（权限/配额/策略），这里只做「确认前禁用 + 被拒原因」的前端预判。
 */

export type TransferDomain = 'project' | 'personalSpace' | 'library';

export type TransferOperation = 'move' | 'copy';

export type TransferMode = 'NONE' | 'COPY_ONLY' | 'MOVE_ONLY' | 'ALL';

export interface TransferRootRef {
  id: string;
  domain: TransferDomain;
}

/** 项目 6 域 transfer 设置（与 ProjectDto / TransferSettings 对齐） */
export interface TransferSettings {
  transferOutToProject?: TransferMode | null;
  transferOutToPersonalSpace?: TransferMode | null;
  transferOutToLibrary?: TransferMode | null;
  transferInFromProject?: TransferMode | null;
  transferInFromPersonalSpace?: TransferMode | null;
  transferInFromLibrary?: TransferMode | null;
}

/** 被拒原因枚举（文案映射留端包：PC 走 TRANSFER_BLOCK_REASONS，移动端走本端 i18n 源串） */
export type TransferBlockReason =
  | 'SOURCE_PROJECT_FORBIDDEN'
  | 'TARGET_PROJECT_FORBIDDEN'
  | 'SOURCE_MODE_MISMATCH'
  | 'TARGET_MODE_MISMATCH'
  | 'LIBRARY_MOVE_FORBIDDEN';

export interface TransferVerdict {
  allowed: boolean;
  /** 是否跨项目（同根为 false） */
  crossProject: boolean;
  /** 被拒原因（allowed 为 false 时有值） */
  reason?: TransferBlockReason;
}

/** 出向字段选择：源为项目时，按目标域类型取 transferOut* 字段（对齐后端 TRANSFER_OUT_FIELD） */
const TRANSFER_OUT_FIELD: Record<TransferDomain, keyof TransferSettings> = {
  project: 'transferOutToProject',
  personalSpace: 'transferOutToPersonalSpace',
  library: 'transferOutToLibrary',
};

/** 入向字段选择：目标为项目时，按源域类型取 transferIn* 字段（对齐后端 TRANSFER_IN_FIELD） */
const TRANSFER_IN_FIELD: Record<TransferDomain, keyof TransferSettings> = {
  project: 'transferInFromProject',
  personalSpace: 'transferInFromPersonalSpace',
  library: 'transferInFromLibrary',
};

/**
 * 策略是否放行指定操作（对齐后端 modeAllows）：
 * ALL 全放行；COPY_ONLY 仅复制；MOVE_ONLY 仅移动；NONE 拒绝。
 * 仅处理非 null 设置——null/undefined 字段按默认放行（后端 modeAllows(null → true)），
 * 只有「整份 settings 查询失败（null）」才由调用方保守拒绝。
 */
function operationAllows(
  operation: TransferOperation,
  setting: TransferMode
): boolean {
  if (setting === 'ALL') return true;
  if (operation === 'copy') return setting === 'COPY_ONLY';
  return setting === 'MOVE_ONLY';
}

export function evaluateCrossProjectTransfer(params: {
  operation: TransferOperation;
  source: TransferRootRef;
  target: TransferRootRef;
  /** 源项目 6 域设置（source.domain !== 'project' 时无需传） */
  sourceSettings: TransferSettings | null;
  /** 目标项目 6 域设置（target.domain !== 'project' 时无需传） */
  targetSettings: TransferSettings | null;
}): TransferVerdict {
  const { operation, source, target, sourceSettings, targetSettings } = params;

  // 同根（同项目/同个人空间/同库）无跨项目策略约束
  if (source.id === target.id && source.domain === target.domain) {
    return { allowed: true, crossProject: false };
  }

  // 源为库：move 恒拒绝（系统规则，copy 豁免源权限）
  if (source.domain === 'library' && operation === 'move') {
    return { allowed: false, crossProject: true, reason: 'LIBRARY_MOVE_FORBIDDEN' };
  }

  // 出向：源为项目时，按目标域类型查 transferOut* 字段
  if (source.domain === 'project') {
    if (sourceSettings == null) {
      // 查询失败（策略未知）→ 保守拒绝
      return {
        allowed: false,
        crossProject: true,
        reason: 'SOURCE_PROJECT_FORBIDDEN',
      };
    }
    const setting = sourceSettings[TRANSFER_OUT_FIELD[target.domain]];
    // 字段为 null/undefined → 按默认放行（对齐后端 modeAllows(null → true)）；
    // 仅非 null 且与操作不匹配时才拒绝
    if (setting != null && !operationAllows(operation, setting)) {
      return {
        allowed: false,
        crossProject: true,
        reason: 'SOURCE_MODE_MISMATCH',
      };
    }
  }

  // 入向：目标为项目时，按源域类型查 transferIn* 字段
  if (target.domain === 'project') {
    if (targetSettings == null) {
      // 查询失败（策略未知）→ 保守拒绝
      return {
        allowed: false,
        crossProject: true,
        reason: 'TARGET_PROJECT_FORBIDDEN',
      };
    }
    const setting = targetSettings[TRANSFER_IN_FIELD[source.domain]];
    // 字段为 null/undefined → 按默认放行（对齐后端 modeAllows(null → true)）；
    // 仅非 null 且与操作不匹配时才拒绝
    if (setting != null && !operationAllows(operation, setting)) {
      return {
        allowed: false,
        crossProject: true,
        reason: 'TARGET_MODE_MISMATCH',
      };
    }
  }

  return { allowed: true, crossProject: true };
}
