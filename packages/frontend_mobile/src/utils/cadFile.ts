/**
 * CAD 图纸文件判定（与 PC CAD_EXTENSIONS = ['.dwg', '.dxf', '.mxweb'] 同口径）。
 *
 * 用于单条目菜单「外部参照管理」入口：外部参照只存在于 CAD 图纸，
 * 非 CAD 文件不展示该菜单项（对齐 PC fileActionConfig 的 isCadFile visibilityCheck）。
 */
const CAD_EXTENSIONS = ['.dwg', '.dxf', '.mxweb']

export function isCadFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return CAD_EXTENSIONS.some((ext) => lower.endsWith(ext))
}
