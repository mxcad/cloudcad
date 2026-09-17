/**
 * 用户档案显示层：后端 UserProfileResponseDto → 移动端展示值。
 *
 * 字段名严格对齐后端 `src/users/dto/user-response.dto.ts` 的 UserProfileResponseDto。
 * 历史上移动端曾按 `membershipLevel` / `membershipExpireAt` / `wechatBound`
 * 取值——这些字段在后端不存在，导致会员徽章永不显示、微信恒显示"未绑定"。
 * 本模块是唯一读会员字段的出口，字段契约由 profileDisplay.spec.ts 锁定。
 *
 * 文案交给 UI 层（VoerkaI18n）：这里返回结构化值，null 表示"不适用"。
 */

export interface ProfileLike {
  username?: string
  nickname?: string
  phone?: string | null
  email?: string
  /** 是否有效会员（tierLevel > 0 且未过期） */
  isVip?: boolean
  /** 会员档位，如 VIP1/VIP2 */
  membershipTier?: string
  /** 会员等级，0=免费 */
  membershipTierLevel?: number
  /** 会员到期时间，null=永久 */
  membershipExpiresAt?: string | null
}

/** 会员档位标签；免费用户或字段缺失返回 null（由 UI 决定是否显示徽章） */
export function membershipBadge(p: ProfileLike): string | null {
  if (!p.isVip) return null
  if (p.membershipTier) return p.membershipTier
  if (p.membershipTierLevel != null) return `VIP${p.membershipTierLevel}`
  return null
}

/** 会员到期日（YYYY-MM-DD）；非会员、永久会员或时间非法返回 null */
export function membershipExpiry(p: ProfileLike): string | null {
  if (!p.isVip) return null
  if (!p.membershipExpiresAt) return null
  const date = new Date(p.membershipExpiresAt)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

/** 手机号脱敏（保留前 3 位与后 4 位）；未绑定返回空串 */
export function maskPhone(phone?: string | null): string {
  if (!phone || phone.length < 11) return phone ?? ''
  return phone.slice(0, 3) + '****' + phone.slice(7)
}

/** 头像首字母；无名字返回占位符 */
export function avatarInitial(name?: string | null): string {
  return name?.trim()?.[0] ?? '?'
}

/** 账号显示名：昵称优先，回落用户名 */
export function displayName(p: ProfileLike): string {
  return p.nickname?.trim() || p.username?.trim() || ''
}
