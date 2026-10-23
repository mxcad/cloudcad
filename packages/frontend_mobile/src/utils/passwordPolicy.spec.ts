import { describe, expect, it } from 'vitest'
import {
  passwordComplexityMessage,
  passwordLengthLabel,
  passwordPlaceholder,
  passwordRequirementLabel,
} from './passwordPolicy'

/**
 * 动态性门禁：口令策略文案必须由传入的生效值推导。
 * 若有人把文案改回写死数字的静态串，这些用例会红
 * （喂 12/2 的文案里必须出现 12 与 2）。
 */
describe('passwordPolicy（移动端口令策略唯一出口）', () => {
  it('placeholder 跟随生效值动态推导（secure 基线 10/3）', () => {
    expect(passwordPlaceholder({ minLength: 10, minCategories: 3 })).toContain('10')
  })

  it('placeholder 跟随生效值动态推导（非默认值 12/2 必须出现在文案中）', () => {
    expect(passwordPlaceholder({ minLength: 12, minCategories: 2 })).toContain('12')
  })

  it('placeholder 只放最小长度，完整要求交清单与错误文案（防单行框截断）', () => {
    expect(passwordPlaceholder({ minLength: 10, minCategories: 3 })).toBe('至少 10 位')
    expect(passwordPlaceholder({ minLength: 10, minCategories: 4 })).toBe('至少 10 位')
  })

  it('minLength=0（无长度要求）→ 回落到通用提示，不出现「至少 0 位」', () => {
    expect(passwordPlaceholder({ minLength: 0, minCategories: 0 })).toBe('请输入密码')
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
