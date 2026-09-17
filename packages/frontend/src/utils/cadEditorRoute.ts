export function parseCADEditorRoute(pathname: string): string | null {
  const match = pathname.match(/^\/cad-editor\/([^/]+)$/);
  return match?.[1] ?? null;
}

export function isHomeRoute(pathname: string): boolean {
  return pathname === '/' || pathname === '' || pathname === '/cad-editor';
}

/**
 * 是否是 CAD 编辑器入口路径。`/` 空路径同样命中：App 路由会把它们重定向进编辑器。
 * 「返回地址」不能指向这些路径，否则点「项目管理」等于回到当前界面。
 */
export function isCadEditorEntry(path: string): boolean {
  return path.startsWith('/cad-editor') || isHomeRoute(path);
}

/**
 * 构造「打开图纸前的返回地址」（cad-editor URL 的 back 参数值）。
 *
 * 已在 CAD 编辑器内时（例如侧边栏版本历史打开另一个版本）不能记录当前地址——
 * 那会让 back 递归套娃（/cad-editor?...&back=/cad-editor?...），
 * 最终点「项目管理」被带回编辑器。此时沿用当前 URL 里已有的 back；
 * 它自己也指向编辑器（历史套娃残留）或不存在时不携带。
 */
export function getCadEditorBackUrl(): string | null {
  const { pathname, search } = window.location;
  if (!isCadEditorEntry(pathname)) return pathname + search;
  const back = new URLSearchParams(search).get('back');
  return back && !isCadEditorEntry(back) ? back : null;
}
