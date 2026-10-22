import { describe, expect, it } from 'vitest'
import {
  passwordComplexityMessage,
  passwordLengthLabel,
  passwordPolicyHint,
  passwordRequirementLabel,
} from './passwordPolicy'

/**
 * 动态性门禁：口令策略文案必须由传入的生效值推导。
 * 若有人把文案改回写死数字的静态串，这些用例会红
 * （喂 12/2 的文案里必须出现 12 与 2）。
 */
describe('passwordPolicy（移动端口令策略唯一出口）', () => {
  it('提示跟随生效值动态推导（secure 基线 10/3）', () => {
    const hint = passwordPolicyHint({ minLength: 10, minCategories: 3 })
    expect(hint).toContain('10')
    expect(hint).toContain('中至少 3 类')
  })

  it('提示跟随生效值动态推导（非默认值 12/2 必须出现在文案中）', () => {
    const hint = passwordPolicyHint({ minLength: 12, minCategories: 2 })
    expect(hint).toContain('12')
    expect(hint).toContain('中至少 2 类')
  })

  it('minCategories=0（normal 模式）→ 只说长度，不提类别', () => {
    const hint = passwordPolicyHint({ minLength: 6, minCategories: 0 })
    expect(hint).toContain('6')
    expect(hint).not.toContain('中至少')
  })

  it('minCategories=4 → 要求四类齐全，无「至少 N 类」措辞', () => {
    const hint = passwordPolicyHint({ minLength: 10, minCategories: 4 })
    expect(hint).toContain('10')
    expect(hint).not.toContain('中至少')
  })

  it('minLength=0 且 minCategories=0 → 无复杂度要求', () => {
    expect(passwordPolicyHint({ minLength: 0, minCategories: 0 })).toBe('无密码复杂度要求')
  })

  it('清单标签跟随生效值', () => {
    expect(passwordLengthLabel(12)).toContain('12')
    expect(passwordComplexityMessage(2)).toContain('中至少 2 类')
  })

  it('清单项文案由生效策略推导（非默认值 12/2 必须出现）', () => {
    const policy = { minLength: 12, minCategories: 2 }
    expect(passwordRequirementLabel({ key: 'length', ok: true }, policy)).toContain('12')
    expect(passwordRequirementLabel({ key: 'categories', ok: false }, policy)).toContain('中至少 2 类')
  })
})
