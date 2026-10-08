/**
 * 认证状态三元组（accessToken / refreshToken / user）的原子读写唯一出口。
 *
 * browserStorage.ts 只保证「单键」容错（隐私模式/SSR/配额满安全降级）；
 * 「多键要么全成要么全无」的原子语义在本层解决：登录同时落三键、登出同时清
 * 三键。若写入中途失败（配额满 / 存储不可用）即回滚已写键到写入前旧值，避免
 * 「accessToken 已写、user 未写」的崩溃中点半状态（旧实现三键各自独立 write，
 * 中途失败会留下半状态，下次启动读到有 token 无 user 的异常组合）。
 *
 * localStorage 无事务，原子性用「失败回滚」近似：写按固定顺序
 * （accessToken → refreshToken → user），任一 write 返回 false 即把已处理键
 * 恢复旧值（旧值 null → 清除）。erase 静默视为成功——清除失败影响小，残留旧值
 * 会被下次登录覆盖，且登出清理不应因单键失败而中断。
 *
 * 业务侧禁止再各自 `setAccessToken + setRefreshToken + setUser` 三连 /
 * `removeAccessToken + removeRefreshToken + removeUser` 三连；单键操作仍走
 * tokenUtils 的 helper（其底层已是 browserStorage 唯一出口）。
 */
import { read, write, erase, readJson, writeJson } from '@/lib/browserStorage';
import type { UserDto } from '@/api-sdk';

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserDto | null;
}

/**
 * 部分更新：字段缺省（undefined）= 不动该键；null = 清除该键；值 = 写入该键。
 * 用于「只更新 token 保留 user」（刷新 / 部分登录）与「三键全写」（完整登录）。
 */
export type AuthStatePatch = Partial<{
  accessToken: string | null;
  refreshToken: string | null;
  user: UserDto | null;
}>;

const K = { access: 'accessToken', refresh: 'refreshToken', user: 'user' } as const;

/** 读认证三元组（各键独立读，缺失 / 存储不可用 → null）。 */
export function loadAuthState(): AuthState {
  return {
    accessToken: read(K.access),
    refreshToken: read(K.refresh),
    user: readJson<UserDto>(K.user),
  };
}

/**
 * 原子写认证三元组（支持部分更新）。
 * @returns true=所有指定键落盘成功；false=失败且已回滚到写入前旧值（调用方可
 *          据此提示登录失败；即使忽略返回值，回滚也已保证不留下半状态）。
 */
export function saveAuthState(patch: AuthStatePatch): boolean {
  type Step = { key: string; old: string | null; run: () => boolean };
  const steps: Step[] = [];

  if (patch.accessToken !== undefined) {
    steps.push({
      key: K.access,
      old: read(K.access),
      run:
        patch.accessToken != null
          ? () => write(K.access, patch.accessToken as string)
          : () => {
              erase(K.access);
              return true;
            },
    });
  }
  if (patch.refreshToken !== undefined) {
    steps.push({
      key: K.refresh,
      old: read(K.refresh),
      run:
        patch.refreshToken != null
          ? () => write(K.refresh, patch.refreshToken as string)
          : () => {
              erase(K.refresh);
              return true;
            },
    });
  }
  if (patch.user !== undefined) {
    steps.push({
      key: K.user,
      old: read(K.user),
      run:
        patch.user != null
          ? () => writeJson(K.user, patch.user as UserDto)
          : () => {
              erase(K.user);
              return true;
            },
    });
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step || !step.run()) {
      // 回滚：已处理键恢复写入前旧值（旧值 null → 清除刚写入的键）
      for (let j = 0; j <= i; j++) {
        const s = steps[j];
        if (!s) continue;
        if (s.old != null) write(s.key, s.old);
        else erase(s.key);
      }
      return false;
    }
  }
  return true;
}

/** 原子清认证三元组：固定顺序清三键（erase 静默，登出清理不因单键失败中断）。 */
export function clearAuthState(): void {
  erase(K.access);
  erase(K.refresh);
  erase(K.user);
}
