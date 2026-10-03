import { describe, it, expect } from 'vitest'
import { precheckTransfer, type TransferRoot, type TransferSettings } from './transferPolicy'

const project = (id: string): TransferRoot => ({ id, name: `项目${id}`, domain: 'project' })
const personal = (id: string): TransferRoot => ({ id, name: '个人空间', domain: 'personalSpace' })
const library = (id: string): TransferRoot => ({ id, name: '资源库', domain: 'library' })

const ALL: TransferSettings = {
  transferOutToProject: 'ALL',
  transferOutToPersonalSpace: 'ALL',
  transferOutToLibrary: 'ALL',
  transferInFromProject: 'ALL',
  transferInFromPersonalSpace: 'ALL',
  transferInFromLibrary: 'ALL',
}

describe('precheckTransfer 六域矩阵预判（二期 g）', () => {
  it('同根（同项目）恒允许，无策略约束', () => {
    const r = project('p1')
    expect(precheckTransfer(r, r, 'move', ALL, ALL).allowed).toBe(true)
    expect(precheckTransfer(r, r, 'copy', null, null).allowed).toBe(true)
  })

  it('项目→个人空间：出向 ALL 允许 move/copy', () => {
    expect(precheckTransfer(project('p1'), personal('ps'), 'move', ALL, null).allowed).toBe(true)
    expect(precheckTransfer(project('p1'), personal('ps'), 'copy', ALL, null).allowed).toBe(true)
  })

  it('项目→个人空间：出向 COPY_ONLY 仅允许 copy，拒绝 move', () => {
    const src: TransferSettings = { ...ALL, transferOutToPersonalSpace: 'COPY_ONLY' }
    expect(precheckTransfer(project('p1'), personal('ps'), 'copy', src, null).allowed).toBe(true)
    expect(precheckTransfer(project('p1'), personal('ps'), 'move', src, null).allowed).toBe(false)
  })

  it('项目→个人空间：出向 NONE 全拒绝', () => {
    const src: TransferSettings = { ...ALL, transferOutToPersonalSpace: 'NONE' }
    expect(precheckTransfer(project('p1'), personal('ps'), 'move', src, null).allowed).toBe(false)
    expect(precheckTransfer(project('p1'), personal('ps'), 'copy', src, null).allowed).toBe(false)
  })

  it('个人空间→项目：入向 MOVE_ONLY 仅允许 move，拒绝 copy', () => {
    const tgt: TransferSettings = { ...ALL, transferInFromPersonalSpace: 'MOVE_ONLY' }
    expect(precheckTransfer(personal('ps'), project('p1'), 'move', null, tgt).allowed).toBe(true)
    expect(precheckTransfer(personal('ps'), project('p1'), 'copy', null, tgt).allowed).toBe(false)
  })

  it('个人空间→项目：入向字段为 null（查询成功但未配置）→ 按默认放行（对齐后端 modeAllows(null → true)）', () => {
    const tgt: TransferSettings = { ...ALL, transferInFromPersonalSpace: null }
    expect(precheckTransfer(personal('ps'), project('p1'), 'move', null, tgt).allowed).toBe(true)
    expect(precheckTransfer(personal('ps'), project('p1'), 'copy', null, tgt).allowed).toBe(true)
  })

  it('项目→项目：出向与入向都需允许（双查）', () => {
    const src: TransferSettings = { ...ALL, transferOutToProject: 'ALL' }
    const tgt: TransferSettings = { ...ALL, transferInFromProject: 'NONE' }
    // 出向允许但入向拒绝 → 整体拒绝
    expect(precheckTransfer(project('p1'), project('p2'), 'move', src, tgt).allowed).toBe(false)
    // 出向拒绝但入向允许 → 整体拒绝
    const src2: TransferSettings = { ...ALL, transferOutToProject: 'NONE' }
    const tgt2: TransferSettings = { ...ALL, transferInFromProject: 'ALL' }
    expect(precheckTransfer(project('p1'), project('p2'), 'move', src2, tgt2).allowed).toBe(false)
    // 双允许 → 通过
    expect(precheckTransfer(project('p1'), project('p2'), 'move', src, ALL).allowed).toBe(true)
  })

  it('源为库：move 恒拒绝（系统规则），copy 允许', () => {
    expect(precheckTransfer(library('lib'), project('p1'), 'move', null, ALL).allowed).toBe(false)
    expect(precheckTransfer(library('lib'), project('p1'), 'copy', null, ALL).allowed).toBe(true)
    expect(precheckTransfer(library('lib'), personal('ps'), 'move', null, null).allowed).toBe(false)
  })

  it('源项目设置缺失（null）→ 保守拒绝', () => {
    const v = precheckTransfer(project('p1'), personal('ps'), 'move', null, null)
    expect(v.allowed).toBe(false)
    expect(v.reasonKey).toBe('源项目未开放跨项目转移')
  })

  it('目标项目设置缺失（null）→ 保守拒绝', () => {
    const v = precheckTransfer(personal('ps'), project('p1'), 'move', null, null)
    expect(v.allowed).toBe(false)
    expect(v.reasonKey).toBe('当前项目未开放跨项目转移')
  })

  it('策略拒绝时带 reasonKey 与 {action} 插值参数', () => {
    const src: TransferSettings = { ...ALL, transferOutToPersonalSpace: 'COPY_ONLY' }
    const v = precheckTransfer(project('p1'), personal('ps'), 'move', src, null)
    expect(v.allowed).toBe(false)
    expect(v.reasonKey).toBe('源项目跨项目策略不允许{action}，已禁止')
    expect(v.reasonParams).toEqual({ action: '移动' })
  })

  it('库→库 move 拒绝，copy 允许（同 domain 不同 id 仍走矩阵）', () => {
    expect(precheckTransfer(library('lib1'), library('lib2'), 'move', null, null).allowed).toBe(false)
    expect(precheckTransfer(library('lib1'), library('lib2'), 'copy', null, null).allowed).toBe(true)
  })
})
