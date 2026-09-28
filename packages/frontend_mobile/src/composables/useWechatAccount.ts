/**
 * 微信账户操作（bind / deactivate purpose，与 PC useWechatAuth 的对应 purpose 同源）。
 *
 * 移动端与登录同机制：整页跳转（client='mobile' → snsapi_userinfo），无事务轮询——
 * 后端回调直接重定向回页面并带 `#wechat_result=<json>`（code + state + purpose），
 * 由 Profile 页解析后消费（绑定调 bindWechat；注销把 code 写回注销表单）。
 *
 * 回跳路径：后端固定重定向到 PC 路径 `/profile#wechat_result=...`，移动端 Profile 页
 * 在 `/shell/profile`，靠路由表里的 `/profile` 别名路由（保留 hash 转发）衔接。
 */
import {
  authControllerGetWechatAuthUrl,
  authControllerBindWechat,
  authControllerUnbindWechat,
} from '@cloudcad/api-sdk/sdk.gen';
import { t } from '@/languages';
import { toError } from '@/utils/apiError';
import { hashRouterOrigin } from '@/composables/useWechatLogin';

export type WechatAccountPurpose = 'bind' | 'deactivate';

export interface WechatResultPayload {
  purpose: WechatAccountPurpose;
  code: string;
  state: string;
}

/** 解析微信授权回调 hash（#wechat_result=...）；非 bind/deactivate 或解析失败返回 null */
export function parseWechatResult(hash: string): WechatResultPayload | null {
  if (!hash.includes('wechat_result=')) return null;
  try {
    const raw = hash.split('wechat_result=')[1];
    const data = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    if (data.purpose !== 'bind' && data.purpose !== 'deactivate') return null;
    const code = typeof data.code === 'string' ? data.code : '';
    const state = typeof data.state === 'string' ? data.state : '';
    if (!code || !state) return null;
    return { purpose: data.purpose, code, state };
  } catch {
    return null;
  }
}

export function useWechatAccount() {
  /** 拉授权链接并整页跳转微信（回调后由后端重定向回页面带 #wechat_result） */
  async function openAuth(purpose: WechatAccountPurpose): Promise<void> {
    const res = await authControllerGetWechatAuthUrl({
      query: {
        origin: hashRouterOrigin(),
        isPopup: 'false',
        purpose,
        client: 'mobile',
        txn: '',
      },
    });
    // SDK 不抛错：失败信息在 res.error
    if (res.error) throw toError(res.error);
    const { authUrl } = (res.data ?? {}) as { authUrl?: string };
    if (!authUrl) throw new Error(t('获取授权链接失败'));
    window.location.href = authUrl;
  }

  /**
   * 绑定微信（回调 code/state 消费）。409（code=CONFLICT）= 该微信已绑定其他账号，
   * 抛错后由调用方询问是否接管（takeover=true 重试，旧账号需保留其他登录方式）。
   */
  async function bindWechat(
    code: string,
    state: string,
    takeover = false
  ): Promise<void> {
    const res = await authControllerBindWechat({
      body: { code, state, ...(takeover ? { takeover: true } : {}) },
    });
    if (res.error) throw toError(res.error);
    const data = (res.data ?? {}) as { success?: boolean; message?: string };
    if (data.success === false) throw new Error(data.message || t('绑定失败'));
  }

  /** 解绑微信（后端校验账号至少保留一种登录方式，否则 400） */
  async function unbindWechat(): Promise<void> {
    const res = await authControllerUnbindWechat();
    if (res.error) throw toError(res.error);
    const data = (res.data ?? {}) as { success?: boolean; message?: string };
    if (data.success === false) throw new Error(data.message || t('解绑失败'));
  }

  return { openAuth, bindWechat, unbindWechat };
}
