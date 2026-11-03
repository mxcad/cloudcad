/**
 * CAD 图纸文件判定（与 PC CAD_EXTENSIONS = ['.dwg', '.dxf', '.mxweb'] 同口径）。
 *
 * 用于单条目菜单「外部参照管理」入口：外部参照只存在于 CAD 图纸，
 * 非 CAD 文件不展示该菜单项（对齐 PC fileActionConfig 的 isCadFile visibilityCheck）。
 * 也用于普通「上传图纸」的格式门禁（accept 提示 + 前端过滤，对齐 PC MxCadUploader）。
 */
export const CAD_EXTENSIONS = ['.dwg', '.dxf', '.mxweb']

/** 引擎可直接读的源格式：不上传、以 blob URL 直接打开（见 useNativeFilePicker SOURCE_FORMATS） */
export function isCadFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return CAD_EXTENSIONS.some((ext) => lower.endsWith(ext))
}
