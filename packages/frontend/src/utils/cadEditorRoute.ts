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

/**
 * CAD 编辑器 URL 的唯一合成出口（由「当前开着的文件身份」派生，不由各调用方手拼）。
 *
 * 规则：无云端节点身份的文件（新建图纸、本地 mxweb、外部参照）URL 不携带
 * 任何身份参数——`fileId` 路径段、`nodeId`、`hash` 一律不出现；
 * 只有云端节点文件才写 `/cad-editor/:fileId`。
 * `back`（返回地址）不属于文件身份，跨文件切换时保留。
 */
export function buildCadEditorUrl(params: {
  /** 云端节点 ID；空串 = 无云端节点（新建图纸 / 本地 mxweb） */
  fileId: string;
  /** 父节点 / 项目 ID，随节点文件写入 ?nodeId= */
  parentId?: string | null;
  /** 资源库文件（图纸库 / 图块库） */
  libraryKey?: 'drawing' | 'block' | null;
  /** 本地任务（游客/公开路径）按 fileHash 打开时的标识 */
  fileHash?: string | null;
  /** 文件名，随 ?hash= 写入（刷新后保留显示名） */
  fileName?: string | null;
  /** 跨文件切换保留的返回地址 */
  back?: string | null;
  /** 打开某个版本时的版本号 */
  version?: string | null;
}): string {
  const path = params.fileId ? `/cad-editor/${params.fileId}` : '/cad-editor';
  const search = new URLSearchParams();
  if (params.fileHash && !params.fileId) {
    search.set('hash', params.fileHash);
    if (params.fileName) search.set('fileName', params.fileName);
  }
  if (params.fileId) {
    if (params.libraryKey) {
      search.set('library', params.libraryKey);
    } else if (params.parentId) {
      search.set('nodeId', params.parentId);
    }
  }
  if (params.version) search.set('v', params.version);
  if (params.back) search.set('back', params.back);

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
