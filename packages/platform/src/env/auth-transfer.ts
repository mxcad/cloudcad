/**
 * 跨端认证凭证搬运契约。
 *
 * PC 端跳转到移动端时把登录态拼进 URL query，移动端加载后从 query 读出写回
 * localStorage（两端是不同 origin / 端口，localStorage 互不可见）。
 *
 * 这份协议过去是两端各写一半：PC `utils/mobileRedirect.ts` 手拼参数名，
 * 移动端 `composables/useUser.ts` 手解析同名参数。中间没有共享的常量定义，
 * 改一边忘了另一边就是静默失效。这里把参数名与构造/解析收敛为唯一实现。
 */

/** 搬运用的 query 参数名。两端共用，禁止各自硬编码。 */
export const AUTH_TRANSFER_QUERY = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  user: 'user',
  /** 标记「桌面端 → 移动端自动跳转」，避免移动端误判为登录弹窗而关闭标签页 */
  isRedirect: '_redirect',
} as const;

export type AuthTransferParamKey =
  (typeof AUTH_TRANSFER_QUERY)[keyof typeof AUTH_TRANSFER_QUERY];

/** 待搬运的登录态。user 是已序列化的 JSON 字符串。 */
export interface AuthTransferCredentials {
  accessToken: string;
  refreshToken?: string;
  user?: string;
}

export interface BuildAuthTransferOptions {
  /** 是否标记为「自动跳转」（PC→移动端）。移动端据此决定是否关闭自身标签页。 */
  markRedirect?: boolean;
}

/** 构造待拼进 URL 的凭证 query。仅返回字段映射，不操作 URL。 */
export function buildAuthTransferQuery(
  credentials: AuthTransferCredentials,
  options: BuildAuthTransferOptions = {}
): Record<string, string> {
  const out: Record<string, string> = {};

  if (credentials.accessToken) {
    out[AUTH_TRANSFER_QUERY.accessToken] = credentials.accessToken;
    if (credentials.refreshToken) {
      out[AUTH_TRANSFER_QUERY.refreshToken] = credentials.refreshToken;
    }
    if (credentials.user) {
      out[AUTH_TRANSFER_QUERY.user] = credentials.user;
    }
  }

  if (options.markRedirect) {
    out[AUTH_TRANSFER_QUERY.isRedirect] = '1';
  }

  return out;
}

/** query 读取接口。URLSearchParams 天然满足。 */
export interface QuerySource {
  get(name: string): string | null;
}

export interface ParsedAuthTransfer {
  credentials: AuthTransferCredentials | null;
  isRedirect: boolean;
}

/**
 * 解析 URL query 中的搬运凭证。
 *
 * 无 accessToken 时 credentials 为 null（调用方据此跳过写入 localStorage）。
 * isRedirect 独立判定——即使无凭证，自动跳转标记仍可能有用。
 */
export function parseAuthTransferQuery(
  source: QuerySource
): ParsedAuthTransfer {
  const accessToken = source.get(AUTH_TRANSFER_QUERY.accessToken);
  const isRedirect = source.get(AUTH_TRANSFER_QUERY.isRedirect) === '1';

  if (!accessToken) {
    return { credentials: null, isRedirect };
  }

  const refreshToken = source.get(AUTH_TRANSFER_QUERY.refreshToken) ?? undefined;
  const user = source.get(AUTH_TRANSFER_QUERY.user) ?? undefined;

  return {
    credentials: { accessToken, refreshToken, user },
    isRedirect,
  };
}

/** 需要被清除的搬运参数名列表，供调用方从 URL 里剥离。 */
export function authTransferParamNames(): string[] {
  return Object.values(AUTH_TRANSFER_QUERY);
}
