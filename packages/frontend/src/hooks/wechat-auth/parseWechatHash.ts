import type { WechatAuthResult } from '@/utils/wechat-auth-result';

export interface ParseWechatHashOptions {
  hash: string;
  /** isPopup === true：弹窗自身，写入 localStorage 供主窗口通过 storage 事件接收，然后关闭 */
  onPopup: (result: WechatAuthResult) => void;
  /** 非弹窗（桌面 EXE 回调等）：直接处理结果 */
  onResult: (result: WechatAuthResult) => void;
}

/**
 * 解析微信授权回调 hash（#wechat_result=...）。
 * 解析成功时清除 hash（history.replaceState）；解析失败静默（旧行为）。
 * 返回是否消费了 hash。
 */
export function parseWechatHash(options: ParseWechatHashOptions): boolean {
  const { hash, onPopup, onResult } = options;
  if (!hash.includes('wechat_result')) return false;
  try {
    const hashValue = hash.split('wechat_result=')[1];
    if (!hashValue) return false;
    const result = JSON.parse(
      decodeURIComponent(hashValue)
    ) as WechatAuthResult;
    // bind/deactivate 等非 login 用途的回调不归 login 实例消费：
    // 保留 hash（不 replaceState、不触发回调）交给对应页面（Profile
    // bind/deactivate 实例）处理；否则 hash 被清掉后绑定/注销流程静默失效
    // （Profile 懒加载晚于 AuthContext 挂载，此前 hash 已被本函数吞掉）。
    if (result.purpose && result.purpose !== 'login') return false;
    window.history.replaceState(null, '', window.location.pathname);
    if (result.isPopup === true) {
      onPopup(result);
    } else {
      onResult(result);
    }
    return true;
  } catch {
    // 保持原有行为：解析失败静默
    return false;
  }
}
