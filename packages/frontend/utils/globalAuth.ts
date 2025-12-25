/**
 * 全局认证管理器
 * 为所有HTTP请求（axios、fetch、XMLHttpRequest）自动添加JWT token
 */

// 获取JWT token的统一方法
export const getAuthToken = (): string | null => {
  return localStorage.getItem('accessToken');
};

// 注意：axios认证拦截器已在apiService.ts中设置，避免重复设置导致冲突
export const setupAxiosAuth = (): void => {
  console.log('✅ Axios 认证由 apiService.ts 统一管理');
};

// 暂时禁用fetch全局认证，避免与axios冲突
export const setupFetchAuth = (): void => {
  console.log('⚠️ Fetch 全局认证已禁用，使用axios统一管理');
};

// 暂时禁用XMLHttpRequest全局认证，避免与axios冲突
export const setupXHRAuth = (): void => {
  console.log('⚠️ XMLHttpRequest 全局认证已禁用，使用axios统一管理');
};

// 简化的全局认证设置（只使用axios统一管理）
export const setupGlobalAuth = (): void => {
  console.log('🔐 设置全局认证（仅axios）...');
  
  // axios认证由apiService.ts统一管理，包含token刷新逻辑
  setupAxiosAuth();
  
  console.log('✅ 全局认证设置完成');
};

// 导出便捷方法
export const ensureAuthenticated = (): void => {
  const token = getAuthToken();
  if (!token) {
    console.warn('⚠️ 未找到JWT token，某些请求可能失败');
  }
};