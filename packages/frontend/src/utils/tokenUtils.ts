export const isValidToken = (token: string | null): boolean => {
  return !!token && token !== 'undefined' && token !== 'null' && token.trim().length > 0;
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
export const getWechatTempToken = (): string | null => {
  return sessionStorage.getItem('wechatTempToken');
};

export const setWechatTempToken = (token: string): void => {
  sessionStorage.setItem('wechatTempToken', token);
};

export const removeWechatTempToken = (): void => {
  sessionStorage.removeItem('wechatTempToken');
};

/**
 * 检查并刷新 token
 * 如果当前 token 即将过期（少于 60 秒有效期），使用 refreshToken 获取新的 accessToken
 * @returns 有效的 token 或 null
 */
export const refreshTokenIfNeeded = async (): Promise<string | null> => {
  const currentToken = getValidToken();

  // 检查 token 是否过期（解析 JWT payload 的 exp 字段）
  if (currentToken) {
    try {
      const payload = JSON.parse(atob(currentToken.split('.')[1] || ''));
      const now = Math.floor(Date.now() / 1000);
      // 如果还有 60 秒以上才过期，直接返回
      if (payload.exp && payload.exp > now + 60) {
        return currentToken;
      }
    } catch {
      // 解析失败，尝试刷新
    }
  }

  // Token 过期或不存在，尝试刷新
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return currentToken; // 没 refresh token，返回现有 token（可能为 null）
  }

  try {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const response = await fetch(`${apiBaseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      const newToken = data?.data?.accessToken || data?.accessToken;
      if (newToken) {
        setAccessToken(newToken);
        return newToken;
      }
    }
  } catch {
    // 刷新失败，继续使用现有 token
  }

  return currentToken;
};
