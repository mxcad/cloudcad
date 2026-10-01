import { t } from '@/languages';
import { useEditorState } from '@/composables/useEditorState';
import { useUser } from '@/composables/useUser';

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

/**
 * 编辑器当前文件标识（含 [协同中]/[未登录] 前缀）；无文件/默认空模板返回 ''。
 * 与 PC 端 editorDisplayName 同一套规则，前缀之间与文件名之间统一用 ' - ' 连接。
 * 读全局会话态，故只在编辑器页面（已有 pinia 与 store）内调用。
 */
export function editorDisplayName(fileName: string | null | undefined): string {
  let inCollaboration = false;
  let authenticated = true;
  try {
    inCollaboration = useEditorState().state.isInCollaboration;
    authenticated = useUser().isAuthenticated.value;
  } catch {
    // 会话态不可用时按「非协同、已登录」降级，只影响前缀不丢文件名
  }

  const prefixes: string[] = [];
  if (inCollaboration) prefixes.push(t('[协同中]'));
  if (!authenticated) prefixes.push(t('[未登录]'));

  if (!fileName || isEmptyDocumentName(fileName)) return prefixes.join(' - ');
  return prefixes.length === 0
    ? fileName
    : `${prefixes.join(' - ')} - ${fileName}`;
}
