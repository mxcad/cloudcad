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
 * 检查 accessToken 是否已过期（解析 JWT payload 中的 exp 字段）
 * @returns true 表示 token 已过期或无法解析，false 表示 token 仍然有效
 */
export const isAccessTokenExpired = (): boolean => {
  try {
    const token = getAccessToken();
    if (!token) return true;
    const payload = JSON.parse(atob(token.split('.')[1] || ''));
    if (!payload.exp) return true;
    // exp 是秒级时间戳，转换为毫秒后与当前时间比较
    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
};

// WeChat Temp Token (sessionStorage)
export const setWechatTempToken = (token: string): void => {
  sessionStorage.setItem('wechatTempToken', token);
};
