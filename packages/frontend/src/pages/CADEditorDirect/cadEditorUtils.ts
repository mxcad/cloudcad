/**
 * CAD Editor 路由解析工具函数
 *
 * 从 CADEditorDirect.tsx 提取的纯函数，用于判断 CAD 编辑器路由状态。
 */

/**
 * 解析路由，判断是否为 CAD 编辑器路由
 * @param pathname 当前路径
 * @returns 如果匹配 /cad-editor/:fileId，返回 fileId；否则返回 null
 */
export function parseCADEditorRoute(pathname: string): string | null {
  const match = pathname.match(/^\/cad-editor\/([^/]+)$/);
  return match?.[1] ?? null;
}

/**
 * 判断是否为主页路由（/ 或 /cad-editor 无文件ID）
 */
export function isHomeRoute(pathname: string): boolean {
  return pathname === '/' || pathname === '' || pathname === '/cad-editor';
}
