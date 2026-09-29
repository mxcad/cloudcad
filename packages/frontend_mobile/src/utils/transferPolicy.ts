/**
 * 跨项目转移策略预判（二期 g，ADR-0054 六域矩阵的前端镜像）
 *
 * 与后端 node-mutation.guard.ts 的 assertCrossProjectTransferPolicy 一一对应：
 *   - 源为库 → move 恒拒绝（copy 豁免源权限）
 *   - 出向：源为项目 → 查 transferOutTo{目标域}
 *   - 入向：目标为项目 → 查 transferInFrom{源域}
 *   - 设置缺失（null）→ 保守拒绝（与 PC crossProjectPaste 语义一致）
 * 后端仍是最终裁决（权限/配额/策略），这里只做「确认前禁用+被拒原因」的前端预判。
 */
import { projectControllerGetProject } from '@cloudcad/api-sdk/sdk.gen'
import type { CrossProjectTransferModeEnum } from '@cloudcad/api-sdk/types.gen'

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

function modeAllows(mode: TransferMode, operation: 'move' | 'copy'): boolean {
  if (mode === null || mode === undefined) return true // 非项目根恒允许
  if (mode === 'ALL') return true
  if (mode === 'COPY_ONLY') return operation === 'copy'
  if (mode === 'MOVE_ONLY') return operation === 'move'
  return false // NONE
}

export function evaluateCrossProjectTransfer(
  source: TransferRoot,
  target: TransferRoot,
  operation: 'move' | 'copy',
  sourceSettings: TransferSettings | null,
  targetSettings: TransferSettings | null,
): TransferVerdict {
  // 同根（同项目/同个人空间）无跨项目策略约束
  if (source.domain === target.domain && source.id === target.id) return { allowed: true }

  const action = operation === 'move' ? '移动' : '复制'

  // 源为库：move 恒拒绝（系统规则，copy 豁免）
  if (source.domain === 'library' && operation === 'move') {
    return { allowed: false, reasonKey: '不能从资源库移出文件' }
  }

  // 出向：源为项目
  if (source.domain === 'project') {
    const field =
      target.domain === 'project'
        ? 'transferOutToProject'
        : target.domain === 'personalSpace'
          ? 'transferOutToPersonalSpace'
          : 'transferOutToLibrary'
    const mode = sourceSettings?.[field]
    if (mode === null || mode === undefined) {
      return { allowed: false, reasonKey: '源项目未开放跨项目转移' }
    }
    if (!modeAllows(mode, operation)) {
      return { allowed: false, reasonKey: '源项目跨项目策略不允许{action}，已禁止', reasonParams: { action } }
    }
  }

  // 入向：目标为项目
  if (target.domain === 'project') {
    const field =
      source.domain === 'project'
        ? 'transferInFromProject'
        : source.domain === 'personalSpace'
          ? 'transferInFromPersonalSpace'
          : 'transferInFromLibrary'
    const mode = targetSettings?.[field]
    if (mode === null || mode === undefined) {
      return { allowed: false, reasonKey: '当前项目未开放跨项目转移' }
    }
    if (!modeAllows(mode, operation)) {
      return { allowed: false, reasonKey: '当前项目跨项目策略不允许{action}，已禁止', reasonParams: { action } }
    }
  }

  return { allowed: true }
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
