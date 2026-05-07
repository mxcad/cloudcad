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
