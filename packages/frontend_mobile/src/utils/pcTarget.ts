/**
 * 移动端 → PC 端「用电脑端打开」的唯一出口
 *
 * 移动端的路径有两类来源：
 * 1. 移动端原生路由（`/shell/file/project/:projectId`）—— 经 @cloudcad/platform
 *    的 MOBILE_TO_PC_ALIASES 翻译成 PC canonical 路径（`/projects/:id/files`）；
 * 2. 移动端路由表里不存在的路径（用户手输、或抄来的本来就是 PC 路径）——
 *    原样交给 PC，由 PC 自己的路由表兜底。
 *
 * 两种情况都必须有出路，否则用户在移动端看到的就是一个死页。
 */
import { resolvePcPath } from '@cloudcad/platform'
import { getPcBaseUrl } from './navigateBack'

/** 移动端 path → PC 端可访问的完整 URL（不搬运 query：PC 语义不同，搬了反而错） */
export function buildPcUrlForPath(mobilePathname: string): string {
  const pcPath = resolvePcPath({ mobilePathname }) ?? mobilePathname
  return `${getPcBaseUrl()}${pcPath}`
}
