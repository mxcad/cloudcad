export const isValidToken = (token: string | null): boolean => {
  return !!token && token !== 'undefined' && token !== 'null' && token.trim().length > 0;
};

export const getValidToken = (): string | null => {
  const token = localStorage.getItem('accessToken');
  return isValidToken(token) ? token : null;
};
