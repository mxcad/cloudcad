/**
 * 跨项目转移策略预判（二期 g，ADR-0054 六域矩阵的前端镜像）
 *
 * 判定口径已收敛到 @cloudcad/platform 的 evaluateCrossProjectTransfer（与 PC 共用），
 * 与后端 node-mutation.guard.ts 的 assertCrossProjectTransferPolicy 一一对应：
 *   - 源为库 → move 恒拒绝（copy 豁免源权限）
 *   - 出向：源为项目 → 查 transferOutTo{目标域}
 *   - 入向：目标为项目 → 查 transferInFrom{源域}
 *   - 设置缺失（null）→ 保守拒绝（与 PC crossProjectPaste 语义一致）
 * 本文件只做入参映射（TransferRoot → {id, domain}）+ 枚举→本端 i18n 源串映射
 * （reasonKey/reasonParams 供 UI 展示）。后端仍是最终裁决（权限/配额/策略）。
 */
import { projectControllerGetProject } from '@cloudcad/api-sdk/sdk.gen'
import type { CrossProjectTransferModeEnum } from '@cloudcad/api-sdk/types.gen'
import {
  evaluateCrossProjectTransfer as platformEvaluateCrossProjectTransfer,
  type TransferBlockReason,
} from '@cloudcad/platform'

export type TransferMode = CrossProjectTransferModeEnum | null

export interface TransferSettings {
  transferOutToProject?: TransferMode
  transferOutToPersonalSpace?: TransferMode
  transferOutToLibrary?: TransferMode
  transferInFromProject?: TransferMode
  transferInFromPersonalSpace?: TransferMode
  transferInFromLibrary?: TransferMode
}

export type RootDomain = 'project' | 'personalSpace' | 'library'

export interface TransferRoot {
  id: string
  name: string
  domain: RootDomain
}

export interface TransferVerdict {
  allowed: boolean
  /** 被拒原因 i18n 源文本 key（reasonParams 供 {action} 插值） */
  reasonKey?: string
  reasonParams?: Record<string, string>
}

/** 被拒原因枚举 → 本端 i18n 源串（action=true 表示需 {action} 插值参数） */
const REASON_TEXT: Record<TransferBlockReason, { text: string; action?: boolean }> = {
  SOURCE_PROJECT_FORBIDDEN: { text: '源项目未开放跨项目转移' },
  TARGET_PROJECT_FORBIDDEN: { text: '当前项目未开放跨项目转移' },
  SOURCE_MODE_MISMATCH: { text: '源项目跨项目策略不允许{action}，已禁止', action: true },
  TARGET_MODE_MISMATCH: { text: '当前项目跨项目策略不允许{action}，已禁止', action: true },
  LIBRARY_MOVE_FORBIDDEN: { text: '不能从资源库移出文件' },
}

export function evaluateCrossProjectTransfer(
  source: TransferRoot,
  target: TransferRoot,
  operation: 'move' | 'copy',
  sourceSettings: TransferSettings | null,
  targetSettings: TransferSettings | null,
): TransferVerdict {
  // 判定口径已收敛到 @cloudcad/platform（与 PC 共用，6 域矩阵 + 库-move 预判），
  // 本文件只做入参映射 + 枚举→本端 i18n 源串映射。
  const verdict = platformEvaluateCrossProjectTransfer({
    operation,
    source: { id: source.id, domain: source.domain },
    target: { id: target.id, domain: target.domain },
    sourceSettings: sourceSettings ?? null,
    targetSettings: targetSettings ?? null,
  })

  if (verdict.allowed || !verdict.reason) return { allowed: verdict.allowed }
  const { text, action } = REASON_TEXT[verdict.reason]
  return {
    allowed: verdict.allowed,
    reasonKey: text,
    ...(action ? { reasonParams: { action: operation === 'move' ? '移动' : '复制' } } : {}),
  }
}

/** 读项目转移设置（ProjectDto 6 字段）；失败返回 null（预判保守拒绝） */
export async function fetchProjectTransferSettings(projectId: string): Promise<TransferSettings | null> {
  try {
    const res = await projectControllerGetProject({ path: { projectId } })
    if (res.error) return null
    const p = res.data as unknown as TransferSettings | undefined
    if (!p) return null
    return {
      transferOutToProject: p.transferOutToProject ?? null,
      transferOutToPersonalSpace: p.transferOutToPersonalSpace ?? null,
      transferOutToLibrary: p.transferOutToLibrary ?? null,
      transferInFromProject: p.transferInFromProject ?? null,
      transferInFromPersonalSpace: p.transferInFromPersonalSpace ?? null,
      transferInFromLibrary: p.transferInFromLibrary ?? null,
    }
  } catch {
    return null
  }
}
