/**
 * filterPasteCycleItems：粘贴环防护。
 *
 * 场景：剪切文件夹 A → 进入 A（或 A 的子目录）→ 粘贴。A 是粘贴目标的祖先，
 * 移动/复制 A 到自身子树会成环，须剔除；其余剪贴板项不受影响。
 */
import { describe, it, expect } from 'vitest'
import { filterPasteCycleItems } from './pasteCycleGuard'

describe('filterPasteCycleItems', () => {
  it('剔除位于目标祖先链上的项，保留其余项', () => {
    // 面包屑：root → A → B，粘贴目标 = B 内；剪贴板含 A（祖先）与 C（无关）
    expect(filterPasteCycleItems(['A', 'C'], ['root', 'A', 'B'])).toEqual(['C'])
  })

  it('粘贴目标自身在剪贴板中时剔除（项不能移入/复制到自身）', () => {
    expect(filterPasteCycleItems(['A', 'B'], ['root', 'A', 'B'])).toEqual([])
  })

  it('无祖先链（根级粘贴）时全部保留', () => {
    expect(filterPasteCycleItems(['A', 'C'], [])).toEqual(['A', 'C'])
  })

  it('全部项都在祖先链上时返回空数组（调用方据此提示「没有可粘贴的项目」）', () => {
    expect(filterPasteCycleItems(['A', 'B'], ['root', 'A', 'B'])).toEqual([])
  })

  it('祖先链含重复 id 不影响判定（Set 语义）', () => {
    expect(filterPasteCycleItems(['A', 'C'], ['A', 'A', 'B'])).toEqual(['C'])
  })

  it('空剪贴板返回空数组', () => {
    expect(filterPasteCycleItems([], ['root', 'A'])).toEqual([])
  })
})
