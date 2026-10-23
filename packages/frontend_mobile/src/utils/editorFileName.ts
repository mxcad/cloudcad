import { stripMxwebContainer } from '@cloudcad/platform';
import { t } from '@/languages';
import { useEditorStore } from '@/stores/editor';
import { readToken } from './authSession';

/**
 * 引擎默认空模板文件名。与 PC 端 mxcadHelpers 的 EMPTY_DOCUMENT_NAMES 逐字一致：
 * 引擎 ready 后先打开空模板，未真正打开图纸时引擎 currentFileName 就是它，
 * 直接显示会让标题栏露出内部模板名。
 */
const EMPTY_DOCUMENT_NAMES = ['empty_template.mxweb', 'empty.mxweb'];

/** 引擎当前文件是否为默认空模板。唯一判据，勿在他处硬编码模板文件名 */
export function isEmptyDocumentName(name: string | null | undefined): boolean {
  return !!name && EMPTY_DOCUMENT_NAMES.includes(name);
}

/** 命令式登录态：与 useUser().isAuthenticated 同一语义（access token 是否存在） */
function hasSessionToken(): boolean {
  return !!readToken();
}

/**
 * 编辑器当前文件标识（含 [协同中]/[未登录] 前缀）；无文件/默认空模板返回 ''。
 * 与 PC 端 editorDisplayName 同一套规则，前缀之间与文件名之间统一用 ' - ' 连接。
 *
 * authenticated 由调用方传入时标题响应登录态变化；不传则现读 localStorage，保持
 * 命令式调用点的原语义。默认值必须是命令式读取而非 composable——本函数会在
 * computed/render 期被调用，在 render 期调 useUser() 会命中 Vue 的 onMounted 告警。
 */
export function editorDisplayName(
  fileName: string | null | undefined,
  authenticated = hasSessionToken()
): string {
  let inCollaboration = false;
  try {
    inCollaboration = useEditorStore().state.isInCollaboration;
  } catch {
    // pinia 未安装时按「非协同」降级，只影响前缀不丢文件名
  }

  const prefixes: string[] = [];
  if (inCollaboration) prefixes.push(t('[协同中]'));
  if (!authenticated) prefixes.push(t('[未登录]'));

  if (!fileName || isEmptyDocumentName(fileName)) return prefixes.join(' - ');
  // 剥掉存储容器层 `.mxweb`（可叠多层），保留 .dwg/.dxf 等真实格式后缀——
  // 与 PC 端 toDisplayFileName 同一口径，节点名 `plan.dwg.mxweb` 显示为 `plan.dwg`
  const displayName = stripMxwebContainer(fileName);
  if (!displayName) return prefixes.join(' - ');
  return prefixes.length === 0
    ? displayName
    : `${prefixes.join(' - ')} - ${displayName}`;
}
