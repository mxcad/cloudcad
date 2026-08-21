// 模块级常量会在 SPA 导航后失效（首次加载时 pathname 可能不是 CAD 路由），
// 因此提供动态判断函数，由调用方在渲染时求值。
export const isCADRoute = (): boolean =>
  location.pathname === '/' || location.pathname.startsWith('/cad-editor');
