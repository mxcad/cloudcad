import { describe, it, expect } from 'vitest'
import {
  membershipBadge,
  membershipExpiry,
  maskPhone,
  avatarInitial,
  displayName,
  type ProfileLike,
} from './profileDisplay'

/**
 * 字段契约锁定：会员显示必须读后端 UserProfileResponseDto 的真实字段
 * （isVip / membershipTier / membershipTierLevel / membershipExpiresAt）。
 *
 * 回归背景：移动端曾按 membershipLevel / membershipExpireAt / wechatBound 取值，
 * 后端无这些字段 → 会员徽章永不显示、微信恒显示"未绑定"。
 */
describe('membershipBadge', () => {
  it('读 membershipTier', () => {
    expect(membershipBadge({ isVip: true, membershipTier: 'VIP2' })).toBe('VIP2')
  })

  it('membershipTier 缺失时回落 membershipTierLevel', () => {
    expect(membershipBadge({ isVip: true, membershipTierLevel: 3 })).toBe('VIP3')
  })

  it('membershipTier 优先于 membershipTierLevel', () => {
    expect(membershipBadge({ isVip: true, membershipTier: 'VIP2', membershipTierLevel: 3 })).toBe('VIP2')
  })

  it('免费用户不显示徽章', () => {
    expect(membershipBadge({ isVip: false, membershipTier: 'VIP1' })).toBeNull()
    expect(membershipBadge({})).toBeNull()
  })

  it('有效会员但档位字段缺失时不显示徽章', () => {
    expect(membershipBadge({ isVip: true })).toBeNull()
  })

  it('已废弃的错误字段名不得驱动徽章（回归锁定）', () => {
    // 带上 isVip 让"是否会员"的门关闭，只测档位取自哪个字段
    const legacy = {
      isVip: true,
      membershipLevel: 'VIP2',
      membershipExpireAt: '2026-12-31T00:00:00.000Z',
      wechatBound: true,
    }
    expect(membershipBadge(legacy as ProfileLike)).toBeNull()
  })
})

describe('membershipExpiry', () => {
  it('格式化到期日为 YYYY-MM-DD', () => {
    expect(membershipExpiry({ isVip: true, membershipExpiresAt: '2026-12-31T23:59:59.000Z' })).toBe('2026-12-31')
  })

  it('永久会员（到期时间为 null）返回 null', () => {
    expect(membershipExpiry({ isVip: true, membershipExpiresAt: null })).toBeNull()
  })

  it('免费用户返回 null', () => {
    expect(membershipExpiry({ isVip: false, membershipExpiresAt: '2026-12-31T00:00:00.000Z' })).toBeNull()
  })

  it('时间非法返回 null', () => {
    expect(membershipExpiry({ isVip: true, membershipExpiresAt: 'not-a-date' })).toBeNull()
  })

  it('已废弃的错误字段名不得驱动到期日（回归锁定）', () => {
    const legacy = { isVip: true, membershipExpireAt: '2026-12-31T00:00:00.000Z' }
    expect(membershipExpiry(legacy as ProfileLike)).toBeNull()
  })
})

describe('maskPhone', () => {
  it('脱敏中国大陆手机号', () => {
    expect(maskPhone('13800138000')).toBe('138****8000')
  })

  it('未绑定返回空串', () => {
    expect(maskPhone(null)).toBe('')
    expect(maskPhone('')).toBe('')
    expect(maskPhone(undefined)).toBe('')
  })

  it('位数不足原样返回', () => {
    expect(maskPhone('12345')).toBe('12345')
  })
})

describe('avatarInitial / displayName', () => {
  it('头像取名字首字符', () => {
    expect(avatarInitial('张工')).toBe('张')
    expect(avatarInitial('  admin')).toBe('a')
    expect(avatarInitial('')).toBe('?')
    expect(avatarInitial(null)).toBe('?')
  })

  it('显示名昵称优先，回落用户名', () => {
    expect(displayName({ nickname: '小张', username: 'zhang' })).toBe('小张')
    expect(displayName({ nickname: '   ', username: 'zhang' })).toBe('zhang')
    expect(displayName({ username: 'zhang' })).toBe('zhang')
    expect(displayName({})).toBe('')
  })
})
