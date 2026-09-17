import { onUnmounted, onMounted, ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import {
  authControllerGetWechatAuthUrl,
  authControllerPollWechatTransaction,
} from '@cloudcad/api-sdk/sdk.gen'
import { t } from '@/languages'
import { toError, errorCode, errorDetail, errMsg } from '@/utils/authFeedback'
import { showAccountDeactivatedDialog } from '@/utils/authFeedback'

/**
 * 微信登录（移动端原生流程，与 PC useWechatAuth 的 login purpose 同源）。
 *
 * 关键差异：移动端传 `client: 'mobile'`，后端据此选 `scope=snsapi_userinfo`
 * （整页跳转 + 手机号授权）而非 PC 的 `snsapi_login`（桌面扫码弹窗）。
 * 因此移动端不做弹窗轮询（storage 事件）——只走整页跳转 + 事务轮询：
 *   open() → 微信授权 → 后端回调重定向回 `#/login?wechat_txn=<txn>` → 本 hook 轮询。
 *
 * `isPopup: 'false'` 时后端必然创建事务（wechat-callback.service.ts:42-45），
 * 所以回调只可能带 wechat_txn，不需要解析 `#wechat_result=` hash 回跳。
 *
 * 轮询间隔 2s × 60 次（与 PC 一致），不要改：改小会打爆后端，改大用户感知卡顿。
 */
export const WECHAT_POLL_INTERVAL_MS = 2000
export const WECHAT_POLL_MAX_ATTEMPTS = 60

export interface WechatLoginHandlers {
  /** 登录成功（accessToken 已有）；restored 表示注销冷静期内自动恢复 */
  onLoginSuccess?: (data: {
    accessToken: string
    refreshToken?: string
    user?: unknown
    restored?: boolean
  }) => void
  /** 微信自动注册未开启/失败 → 需手动注册 */
  onNeedRegister?: (tempToken: string) => void
  /** 该微信需补绑邮箱 */
  onNeedBindEmail?: (tempToken: string) => void
  /** 该微信需补绑手机号 */
  onNeedBindPhone?: (tempToken: string) => void
  /** 微信登录入口显隐外的业务错误 */
  onError?: (message: string) => void
}

/** hash 路由下的回跳 origin：必须带 `/#`，否则后端拼出的 `/login?wechat_txn=` 走不到路由 */
export function hashRouterOrigin(): string {
  const base = window.location.href.split('#')[0].replace(/[?#].*$/, '')
  return `${base.replace(/\/$/, '')}/#`
}

function isPollResult(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function useWechatLogin(handlers: WechatLoginHandlers) {
  const opening = ref(false)
  const polling = ref(false)

  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null

  /** 拉授权链接并整页跳转微信 */
  async function open(): Promise<void> {
    if (opening.value) return
    opening.value = true
    try {
      const res = await authControllerGetWechatAuthUrl({
        query: {
          origin: hashRouterOrigin(),
          isPopup: 'false',
          purpose: 'login',
          client: 'mobile',
          txn: '',
        },
      })
      // SDK 不抛错：失败信息在 res.error
      if (res.error) throw toError(res.error)
      const { authUrl } = (res.data ?? {}) as { authUrl?: string }
      if (!authUrl) throw new Error(t('获取授权链接失败'))
      window.location.href = authUrl
    } catch (e) {
      handlers.onError?.(errMsg(e, t('获取授权链接失败')))
    } finally {
      opening.value = false
    }
  }

  async function poll(txn: string, attempt: number): Promise<void> {
    if (cancelled) return
    polling.value = true
    try {
      const res = await authControllerPollWechatTransaction({ query: { txn } })
      if (res.error) throw toError(res.error)
      const raw = res.data
      if (!isPollResult(raw)) return

      if (raw.status === 'expired') {
        handlers.onError?.(t('微信登录超时，请重试'))
        return
      }
      if (raw.status === 'rate_limited') {
        handlers.onError?.(t('请求过于频繁，请稍后再试'))
        return
      }
      if (raw.status !== 'completed') {
        scheduleNext(txn, attempt)
        return
      }

      if (raw.error) {
        const body = toError(raw)
        if (errorCode(body) === 'ACCOUNT_DEACTIVATED') {
          showAccountDeactivatedDialog(errorDetail(body, 'cleanupDays'))
        } else {
          handlers.onError?.(`${t('微信登录失败')}：${errMsg(body, body.message)}`)
        }
        return
      }

      switch (raw.action) {
        case 'login': {
          const accessToken = typeof raw.accessToken === 'string' ? raw.accessToken : ''
          if (accessToken) {
            handlers.onLoginSuccess?.({
              accessToken,
              refreshToken: typeof raw.refreshToken === 'string' ? raw.refreshToken : undefined,
              user: raw.user,
              restored: raw.restored === true,
            })
          }
          return
        }
        case 'need_register': {
          const tempToken = typeof raw.tempToken === 'string' ? raw.tempToken : ''
          if (tempToken) handlers.onNeedRegister?.(tempToken)
          return
        }
        case 'bind_email': {
          const tempToken = typeof raw.tempToken === 'string' ? raw.tempToken : ''
          if (tempToken) handlers.onNeedBindEmail?.(tempToken)
          return
        }
        case 'bind_phone': {
          const tempToken = typeof raw.tempToken === 'string' ? raw.tempToken : ''
          if (tempToken) handlers.onNeedBindPhone?.(tempToken)
          return
        }
        default:
          return
      }
    } catch (e) {
      if (!cancelled) handlers.onError?.(errMsg(e, t('微信登录失败，请重试')))
    } finally {
      polling.value = false
    }
  }

  function scheduleNext(txn: string, attempt: number) {
    if (cancelled) return
    if (attempt >= WECHAT_POLL_MAX_ATTEMPTS) {
      handlers.onError?.(t('微信登录超时，请重试'))
      return
    }
    timer = setTimeout(() => void poll(txn, attempt + 1), WECHAT_POLL_INTERVAL_MS)
  }

  function stop() {
    cancelled = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  onMounted(() => {
    cancelled = false
  })

  onUnmounted(stop)

  return {
    opening,
    polling,
    open,
    poll,
    stop,
  }
}

/** 从路由 query 取出待轮询的事务号（回调重定向写进来） */
export function takeWechatTxn(route: Pick<RouteLocationNormalizedLoaded, 'query'>): string | null {
  const txn = route.query.wechat_txn
  return typeof txn === 'string' && txn ? txn : null
}
