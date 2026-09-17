export const isValidToken = (token: string | null): boolean => {
  return (
    !!token &&
    token !== 'undefined' &&
    token !== 'null' &&
    token.trim().length > 0
  );
};

export const getValidToken = (): string | null => {
  const token = localStorage.getItem('accessToken');
  return isValidToken(token) ? token : null;
};

// Access Token
export const getAccessToken = (): string | null => {
  const token = localStorage.getItem('accessToken');
  return isValidToken(token) ? token : null;
};

export const setAccessToken = (token: string): void => {
  localStorage.setItem('accessToken', token);
};

export const removeAccessToken = (): void => {
  localStorage.removeItem('accessToken');
};

// Refresh Token
export const getRefreshToken = (): string | null => {
  const token = localStorage.getItem('refreshToken');
  return isValidToken(token) ? token : null;
};

export const setRefreshToken = (token: string): void => {
  localStorage.setItem('refreshToken', token);
};

export const removeRefreshToken = (): void => {
  localStorage.removeItem('refreshToken');
};

/**
 * 解码 JWT payload 段（base64url → JSON）。
 * JWT 标准用 base64url（-/_），而 atob 只认 base64（+/）：payload 含 UUID
 * （sub/jti）时编码结果几乎必然含 - 或 _，直接 atob 会抛异常。
 * 解析失败返回 null。
 */
export const decodeJwtPayload = (
  token: string
): Record<string, unknown> | null => {
  try {
    const segment = token.split('.')[1] || '';
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    // atob 返回 latin1 二进制串，多字节 UTF-8（如中文用户名）须经 TextDecoder
    // 还原，直接 JSON.parse 会得到乱码
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
};

/**
 * 检查 accessToken 是否已过期（解析 JWT payload 中的 exp 字段）
 * @returns true 表示 token 已过期或无法解析，false 表示 token 仍然有效
 */
export const isAccessTokenExpired = (): boolean => {
  const token = getAccessToken();
  if (!token) return true;
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return true;
  // exp 是秒级时间戳，转换为毫秒后与当前时间比较
  return (payload.exp as number) * 1000 <= Date.now();
};

// WeChat Temp Token (sessionStorage)
export const setWechatTempToken = (token: string): void => {
  sessionStorage.setItem('wechatTempToken', token);
};
