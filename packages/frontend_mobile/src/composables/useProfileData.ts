/**
 * 个人中心资料域：用户档案读取 + 存储配额 + 展示派生值 + 用户名/昵称编辑。
 *
 * 数据源：
 *   GET /users/profile/me  → UserProfile（后端 UserProfileResponseDto）
 *   GET /users/stats/me    → UserDashboardStatsDto.storage（个人空间配额）
 *   PATCH /users/profile/me → 用户名（后端限每月 3 次）/ 昵称
 *
 * 头像、邮箱/手机绑定换绑、改密各自独立 composable，成功后经 loadProfile 回读。
 */
import { computed, ref } from 'vue'
import {
  usersControllerGetDashboardStats,
  usersControllerGetProfile,
  usersControllerUpdateProfile,
} from '@cloudcad/api-sdk/sdk.gen'
import { showFailToast, showSuccessToast } from 'vant'
import { t } from '@/languages'
import { unwrap, errMsg } from '@/utils/apiError'
import { maskPhone, membershipBadge, membershipExpiry } from '@/utils/profileDisplay'

/** 后端 UserProfileResponseDto（仅声明移动端实际消费的字段） */
export interface UserProfile {
  id?: string
  username?: string
  nickname?: string
  phone?: string | null
  phoneVerified?: boolean
  email?: string
  avatar?: string
  /** 0=VIP0 免费；1/2/3...=有效会员档位 */
  membershipTierLevel?: number
  membershipTier?: string
  membershipExpiresAt?: string | null
  isVip?: boolean
  /** 手机/微信注册用户可能未设置密码 */
  hasPassword?: boolean
  /** 绑定的微信 openid（有值即可用微信验证/绑定态展示） */
  wechatId?: string | null
  provider?: string
  /** ACTIVE / INACTIVE / SUSPENDED（UserStatus） */
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  role?: { id: string; name: string; description?: string; isSystem: boolean }
  createdAt?: string
  updatedAt?: string
}

/** 个人空间存储配额（UserDashboardStatsDto.storage） */
export interface StorageInfo {
  used: number
  total: number
  remaining: number
  usagePercent: number
}

/** 账号信息行 */
export interface AccountEntry {
  label: string
  value: string
  action: string
  /** 已验证标记：邮箱=已绑定；手机号=phoneVerified */
  verified?: boolean
}

export type ProfileTextField = 'username' | 'nickname'

export function useProfileData() {
  const profile = ref<UserProfile>({})
  const loading = ref(true)
  const error = ref('')

  async function loadProfile() {
    loading.value = true
    error.value = ''
    try {
      profile.value = unwrap(await usersControllerGetProfile())
    } catch (e) {
      console.error('[Profile] loadProfile:', e)
      error.value = t('加载失败')
    } finally {
      loading.value = false
    }
  }

  // ═══ 存储配额用量（D-12）═══
  // 失败静默（配额条不显示），不把整页打成错误态——资料本身已加载成功
  const storageInfo = ref<StorageInfo | null>(null)

  async function loadStats() {
    try {
      const data = unwrap<{ storage?: StorageInfo }>(await usersControllerGetDashboardStats())
      const s = data.storage
      if (s && typeof s.total === 'number' && s.total > 0) storageInfo.value = s
    } catch (e) {
      console.error('[Profile] loadStats:', e)
      storageInfo.value = null
    }
  }

  const storagePercent = computed(() => {
    const s = storageInfo.value
    if (!s) return null
    const pct = typeof s.usagePercent === 'number' ? s.usagePercent : (s.total > 0 ? (s.used / s.total) * 100 : 0)
    return Math.min(Math.max(pct, 0), 100)
  })

  const storageColor = computed(() => {
    const pct = storagePercent.value ?? 0
    if (pct > 90) return 'var(--error, #ef4444)'
    if (pct > 70) return 'var(--warning, #f59e0b)'
    return 'var(--accent, #00a99e)'
  })

  // ── 显示值（字段映射集中在 @/utils/profileDisplay，契约由 spec 锁定）──
  const isVip = computed(() => !!profile.value.isVip)
  const vipBadge = computed(() => membershipBadge(profile.value))
  const vipExpireDate = computed(() => membershipExpiry(profile.value))

  // 会员到期预警（D-11）：有效会员且剩余 ≤7 天；expiresAt 为 null 表示永久，不算到期
  const vipDaysRemaining = computed(() => {
    const raw = profile.value.membershipExpiresAt
    if (!profile.value.isVip || !raw) return null
    const expire = new Date(raw).getTime()
    if (Number.isNaN(expire)) return null
    return Math.ceil((expire - Date.now()) / 86400000)
  })
  const vipExpiringSoon = computed(() => {
    const days = vipDaysRemaining.value
    return days !== null && days > 0 && days <= 7
  })

  // 账号元信息（D-02）：角色按 name === 'ADMIN' 判定（与 PC usePermission.isAdmin 同口径）
  const roleLabel = computed(() => (profile.value.role?.name === 'ADMIN' ? t('系统管理员') : t('普通用户')))
  const statusLabel = computed(() =>
    profile.value.status === 'INACTIVE' ? t('未激活') : profile.value.status === 'SUSPENDED' ? t('已禁用') : t('正常')
  )
  const statusTone = computed(() =>
    profile.value.status === 'ACTIVE' ? 'ok' : profile.value.status === 'INACTIVE' ? 'warn' : 'err'
  )
  const createdAtText = computed(() => {
    const raw = profile.value.createdAt
    if (!raw) return ''
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
  })

  const accountGroup = computed<AccountEntry[]>(() => [
    { label: t('用户名'), value: profile.value.username ?? '—', action: 'edit-username' },
    { label: t('昵称'), value: profile.value.nickname ?? '—', action: 'edit-nickname' },
    {
      label: t('邮箱'),
      value: profile.value.email ?? '—',
      action: 'edit-email',
      // 后端无 emailVerified 字段：邮箱绑定即视为已验证
      verified: !!profile.value.email,
    },
    {
      label: t('手机号'),
      value: maskPhone(profile.value.phone) || '—',
      action: 'edit-phone',
      // 手机号有独立 phoneVerified 标记（后台导入/管理员代绑可能未验证）
      verified: !!profile.value.phone && profile.value.phoneVerified === true,
    },
  ])

  const securityGroup = computed(() => [
    { label: profile.value.hasPassword === false ? t('设置密码') : t('修改密码'), value: '', action: 'change-password' },
  ])

  // ═══ 用户名 / 昵称编辑 ═══
  const showTextDialog = ref(false)
  const editField = ref<ProfileTextField>('nickname')
  const editValue = ref('')
  const savingText = ref(false)

  const textMaxLength = computed(() => (editField.value === 'username' ? 20 : 50))
  const textPlaceholder = computed(() =>
    editField.value === 'username' ? t('请输入用户名（3-20 个字符）') : t('请输入昵称（最多 50 个字符）')
  )
  const canSubmitText = computed(() => {
    const v = editValue.value.trim()
    if (!v) return false
    if (editField.value === 'username') return v.length >= 3
    return true
  })

  function openTextEdit(field: ProfileTextField) {
    editField.value = field
    editValue.value = field === 'username' ? (profile.value.username ?? '') : (profile.value.nickname ?? '')
    showTextDialog.value = true
  }

  async function onTextConfirm() {
    if (!canSubmitText.value || savingText.value) return
    savingText.value = true
    try {
      const body = editField.value === 'username'
        ? { username: editValue.value.trim() }
        : { nickname: editValue.value.trim() }
      unwrap(await usersControllerUpdateProfile({ body }))
      showSuccessToast(editField.value === 'username' ? t('用户名已更新') : t('昵称已更新'))
      showTextDialog.value = false
      await loadProfile()
    } catch (e) {
      showFailToast(errMsg(e, t('更新失败')))
    } finally {
      savingText.value = false
    }
  }

  return {
    profile,
    loading,
    error,
    loadProfile,
    storageInfo,
    loadStats,
    storagePercent,
    storageColor,
    isVip,
    vipBadge,
    vipExpireDate,
    vipDaysRemaining,
    vipExpiringSoon,
    roleLabel,
    statusLabel,
    statusTone,
    createdAtText,
    accountGroup,
    securityGroup,
    showTextDialog,
    editField,
    editValue,
    savingText,
    textMaxLength,
    textPlaceholder,
    canSubmitText,
    openTextEdit,
    onTextConfirm,
  }
}
