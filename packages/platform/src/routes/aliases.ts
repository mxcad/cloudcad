/**
 * PC ↔ 移动端路由别名映射表——跨端 URL 互通的单一事实源。
 *
 * 背景：用户在 PC 上复制地址栏 URL 发给别人，对方用手机打开应当落到对应界面。
 * 过去只有 CAD 编辑器一个场景做到了（`mobileRedirect` 里一句正则把
 * `/cad-editor/:fileId` 提为 `?fileId=`），`/projects`、`/personal-space`、
 * `/library`、`/shares`、`/member-center`、`/profile` 全部落空——手机端打开这些
 * URL 会渲染出 PC 的桌面版外壳。
 *
 * 两端 UI 栈不同（React history 路由 / Vue hash 路由），部署 base 也不同
 * （`/` vs `/mxcad_mobile/`），所以 URL 字面不可能完全相同。这里的不变量是
 * **URL 表达业务语义，端由部署位置 + 这张翻译表决定**。
 *
 * 加条目前先问：这条语义在移动端真的有意义吗？桌面管理端功能（`/admin/*`）
 * 不进表，落到降级提示页。
 */

import { compilePathPattern, type PathSegment } from './match';

/** 单条映射：PC canonical path → 移动端目标 */
export interface RouteAlias {
  /** PC 端 canonical 路径，`:param` 为路径参数 */
  pcPath: string;
  /** 编译后的 pattern（导出为常量供解析器复用，避免重复编译） */
  pcPattern: PathSegment[];
  /** 移动端目标路径（hash 路由内的 path），同样支持 `:param` 承接同名参数 */
  mobilePath: string;
  /** 编译后的移动端 pattern */
  mobilePattern: PathSegment[];
  /** 从 path 参数提升为 query 的映射：{ 目标 query 名: path 参数名 } */
  queryFromParams?: Record<string, string>;
  /** 落地时固定注入的 query */
  fixedQuery?: Record<string, string>;
}

/** 移动端 → PC 的页面级反向映射（文件级精确返回由各端自己处理） */
export interface MobileToPcAlias {
  mobilePath: string;
  mobilePattern: PathSegment[];
  pcPath: string;
  pcPattern: PathSegment[];
}

function alias(
  pcPath: string,
  mobilePath: string,
  extra: { queryFromParams?: Record<string, string>; fixedQuery?: Record<string, string> } = {}
): RouteAlias {
  return {
    pcPath,
    pcPattern: compilePathPattern(pcPath),
    mobilePath,
    mobilePattern: compilePathPattern(mobilePath),
    ...extra,
  };
}

/**
 * PC → 移动端映射表。
 *
 * 移动端 `/shell` 根 = CAD 编辑器（游客可用），需要打开具体文件时靠 query：
 * `?fileId=` / `?library=` / `?shareToken=` / `?hash=`，由移动端的
 * `useFileLoader` 统一读取。因此所有「打开某文件」类语义都落到 `/shell`。
 */
export const ROUTE_ALIASES: RouteAlias[] = [
  // ── CAD 编辑器 ──
  alias('/', '/shell'),
  alias('/cad-editor', '/shell'),
  alias('/cad-editor/:fileId', '/shell', { queryFromParams: { fileId: 'fileId' } }),

  // ── 项目与文件 ──
  // /recent、/favorites、/files 在 PC 端本身就 redirect 到 /projects，一并列出
  // 是为了让「用户正在这些中间路径上被跳到移动端」时能落到同一处。
  alias('/projects', '/shell/file'),
  alias('/recent', '/shell/file'),
  alias('/favorites', '/shell/file'),
  alias('/files', '/shell/file'),
  alias('/projects/:projectId/files', '/shell/file/project/:projectId'),
  // PC 侧的 :nodeId 是文件夹定位语义（FileSystemManager 的 folder mode），
  // 不是「打开 CAD 文件」——后者才用 ?fileId=。这里按原语义搬成 nodeId。
  // 注意降级：移动端尚未消费 ?nodeId=（需要按节点钻取文件夹，见阶段 2.3 余项），
  // 落地到项目根目录而不进入该节点。
  alias('/projects/:projectId/files/:nodeId', '/shell/file/project/:projectId', {
    queryFromParams: { nodeId: 'nodeId' },
  }),

  // ── 个人空间 ──
  // 移动端文件浏览页内含 personal 域 tab，用 domain query 指定初始域。
  // 同理，?nodeId= 目前未被移动端消费，落在个人空间根。
  alias('/personal-space', '/shell/file', { fixedQuery: { domain: 'personal' } }),
  alias('/personal-space/:nodeId', '/shell/file', {
    fixedQuery: { domain: 'personal' },
    queryFromParams: { nodeId: 'nodeId' },
  }),

  // ── 图纸库 / 图块库 ──
  // 移动端库是浮在画布上的抽屉而非独立路由，落地到壳根并带 query 打开文件。
  alias('/library/:libraryType', '/shell', {
    queryFromParams: { library: 'libraryType' },
  }),
  alias('/library/:libraryType/:nodeId', '/shell', {
    queryFromParams: { library: 'libraryType', fileId: 'nodeId' },
  }),

  // ── 分享 / 会员 / 个人中心 ──
  alias('/shares', '/shell/share'),
  alias('/member-center', '/shell/member'),
  alias('/billing', '/shell/member'),
  alias('/profile', '/shell/profile'),

  // ── 认证页：两端同名原生实现，映射到自身 ──
  alias('/login', '/login'),
  alias('/register', '/register'),
  alias('/verify-email', '/verify-email'),
  alias('/verify-phone', '/verify-phone'),
  alias('/forgot-password', '/forgot-password'),
  alias('/reset-password', '/reset-password'),
];

/**
 * 移动端 → PC 的页面级反向映射，用于移动端「用电脑端打开」入口。
 *
 * 刻意只覆盖页面级语义。文件级的精确返回（`/projects/:id/files/:nodeId` 还是
 * `/personal-space/:nodeId`）依赖当前文件的 projectId / path 上下文，各端编辑器
 * 状态里才有，不适合放静态表。
 */
function mobileAlias(mobilePath: string, pcPath: string): MobileToPcAlias {
  return {
    mobilePath,
    mobilePattern: compilePathPattern(mobilePath),
    pcPath,
    pcPattern: compilePathPattern(pcPath),
  };
}

export const MOBILE_TO_PC_ALIASES: MobileToPcAlias[] = [
  mobileAlias('/shell', '/cad-editor'),
  mobileAlias('/shell/file', '/projects'),
  mobileAlias('/shell/file/project/:projectId', '/projects/:projectId/files'),
  mobileAlias('/shell/share', '/shares'),
  mobileAlias('/shell/member', '/member-center'),
  mobileAlias('/shell/profile', '/profile'),
  mobileAlias('/login', '/login'),
  mobileAlias('/register', '/register'),
  mobileAlias('/verify-email', '/verify-email'),
  mobileAlias('/verify-phone', '/verify-phone'),
  mobileAlias('/forgot-password', '/forgot-password'),
  mobileAlias('/reset-password', '/reset-password'),
];

/**
 * PC 有但移动端刻意不支持的语义——命中时不跳转，保持桌面端现状。
 *
 * 这些是桌面管理端能力，手机上没有对应需求。宁可留在 PC，
 * 也不要把一个 40 列的管理表格推到 375px 的屏幕上。
 */
export const NON_MAPPABLE_PC_PREFIXES: string[] = [
  '/admin',
  '/dashboard',
  '/users',
  '/roles',
  '/audit-logs',
  '/system-monitor',
  '/runtime-config',
  '/privacy',
  '/terms',
  '/device',
  '/session-transfer',
  '/logo',
];
