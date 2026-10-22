/**
 * 文件名合法性规则——跨端共享的纯判定。
 *
 * 新建文件夹/新建图纸/重命名共用同一套规则（空名 / 长度 / 非法字符 /
 * 控制字符 / Windows 保留名 / 首尾点）。过去 PC `utils/fileUtils.ts`
 * `validateFolderName` 与移动端 `utils/validateName.ts` 逐字节各写一份；
 * 这里收敛为唯一判定，错误文案（i18n）留在各端按 reasonCode 映射。
 */

/** 不合法原因码（端包据此映射 i18n 文案）。 */
export type FileNameReason =
  | 'empty'
  | 'too_long'
  | 'illegal_chars'
  | 'control_chars'
  | 'reserved_name'
  | 'dot_edges';

export type FileNameCheckResult =
  { valid: true } | { valid: false; reason: FileNameReason };

const ILLEGAL_CHARS = /[<>:"|?*/\\]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F]/u;
const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/**
 * 判定文件名合法性。`maxLength` 缺省 255（两端现行口径）。
 * 判定顺序即优先级：空 → 长度 → 非法字符 → 控制字符 → 保留名 → 首尾点。
 */
export function checkFileName(
  name: string,
  maxLength = 255
): FileNameCheckResult {
  const trimmed = name.trim();

  if (!trimmed) return { valid: false, reason: 'empty' };
  if (trimmed.length > maxLength) return { valid: false, reason: 'too_long' };
  if (ILLEGAL_CHARS.test(trimmed))
    return { valid: false, reason: 'illegal_chars' };
  if (CONTROL_CHARS.test(trimmed))
    return { valid: false, reason: 'control_chars' };
  if (RESERVED_NAMES.test(trimmed))
    return { valid: false, reason: 'reserved_name' };
  if (trimmed.startsWith('.') || trimmed.endsWith('.'))
    return { valid: false, reason: 'dot_edges' };

  return { valid: true };
}

/** 图纸类源文件扩展名：另存为时这一层属于「格式」而不是「名字」 */
const DRAWING_EXTENSIONS = ['.dwg', '.dxf', '.dwt'];
/** 引擎内部容器扩展名（后端节点名会带这一层，如 `plan.dwg.mxweb`） */
const MXWEB_EXTENSION = '.mxweb';

/**
 * 去掉图纸名尾部的「格式扩展名」，得到另存为对话框的默认基名。
 *
 * 节点名可能是 `plan.dwg`（上传原图）或 `plan.dwg.mxweb`（历史另存为留下的
 * 双层扩展名），两者都必须归一到 `plan`。只剥一层会滚雪球：打开
 * `plan.dwg.mxweb` 再另存为 DWG 会得到 `plan.dwg.dwg`、另存为 MXWEB 会继续
 * 产出 `plan.dwg.mxweb`，一个分支都没处理干净。
 *
 * 只认已知扩展名：`v1.2`、`plan(final)` 这类没有格式后缀的名字原样返回，
 * 不做「最后一个点」的猜测式截断。
 */
export function stripDrawingExtension(fileName: string): string {
  let name = fileName.trim();
  while (name.toLowerCase().endsWith(MXWEB_EXTENSION)) {
    name = name.slice(0, -MXWEB_EXTENSION.length);
  }
  const lower = name.toLowerCase();
  for (const ext of DRAWING_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      name = name.slice(0, -ext.length);
      break;
    }
  }
  return name;
}

/**
 * 去掉引擎内部容器扩展名 `.mxweb`（可叠多层），得到**给用户看的图纸名**。
 *
 * `.mxweb` 是本系统的存储容器，不是用户的图纸格式：节点名 `计划.dwg.mxweb`
 * 在编辑器标题栏、分享页、导出文件名里都应显示为 `计划.dwg`。不清这一层，
 * 用户看到的是内部标识，且引擎导出时会拿它当原始名再叠一层，
 * 变成 `计划.dwg.mxweb.mxweb`。
 *
 * 只剥 `.mxweb`，`.dwg`/`.dxf` 等真实格式后缀保留——它们对用户是有意义的信息。
 * 剥空（名字本身就叫 `.mxweb`）时返回空串，由调用方决定兜底文案。
 */
export function stripMxwebContainer(fileName: string): string {
  let name = fileName.trim();
  while (name.toLowerCase().endsWith(MXWEB_EXTENSION)) {
    name = name.slice(0, -MXWEB_EXTENSION.length);
  }
  return name;
}
