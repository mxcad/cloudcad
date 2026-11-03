/**
 * 外部参照文件命名契约——跨端（PC/移动端/后端）共用的纯变换。
 *
 * 外部参照的「逻辑名 → 磁盘名 / 访问路径段 / 显示名」此前散落在 10+ 处各写各的
 * 假设：登录态与游客态各自拼 `.mxweb`、检查存在与文件解析用不同候选、前端查看
 * 与引擎加载用相反 URL 形态。任何一处被改动都会与其它处失配——这是「外部参照
 * 一改动就出问题」的根源。本文件把命名约定收敛为唯一事实源。
 *
 * 约定（单一事实源）：
 * - **逻辑名**：外部参照在图纸里的名字（`block.dwg`、`image.png`），不含 `.mxweb`。
 * - **磁盘名**：CAD 类（.dwg/.dxf/.dwt）落盘为 `{逻辑名}.mxweb`；图片/其它原名。
 * - **访问路径段**：统一传逻辑名、**不拼 `.mxweb`**，由后端按候选集统一兜底
 *   （前端不感知 `.mxweb` 容器这一层，改动只在一处）。
 * - **显示名**：磁盘名剥 `.mxweb` 容器。
 *
 * 准入（ADR-0070）：纯函数/纯数据、不绑框架、不绑端（无 navigator/window 读取）、
 * 重复已成立（原先 ≥10 处各自拼 `.mxweb`）。
 */

import { DRAWING_EXTENSIONS, MXWEB_EXTENSION, stripMxwebContainer } from './name-rules'

/** 判定是否为 CAD 类外部参照名（.dwg/.dxf/.dwt）。只认已知扩展名，不猜点号。 */
export function isCadExtRefName(logicalName: string): boolean {
  const lower = logicalName.trim().toLowerCase()
  return DRAWING_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * 外部参照逻辑名 → 磁盘存储名。
 *
 * CAD 类外部参照在磁盘上以 `{逻辑名}.mxweb` 存储（引擎产物被拷贝/重命名到这一层），
 * 图片/其它类型用原名。这是「磁盘名」的唯一判据，所有写入与读取必须共用。
 */
export function extRefDiskFileName(logicalName: string): string {
  return isCadExtRefName(logicalName) ? `${logicalName}${MXWEB_EXTENSION}` : logicalName
}

/** 去掉图纸名尾部的「格式扩展名」（`block.dwg` → `block`），供旧格式兼容候选用。 */
export function extRefBaseName(logicalName: string): string {
  let name = stripMxwebContainer(logicalName.trim())
  const lower = name.toLowerCase()
  for (const ext of DRAWING_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      name = name.slice(0, -ext.length)
      break
    }
  }
  return name
}

/**
 * 外部参照磁盘候选名（按优先级，检查存在/解析/下载共用）。
 *
 * 候选顺序：标准磁盘名（CAD 为 `{name}.mxweb`，其它原名）→ 逻辑名本身 →
 * 旧格式兼容（`{baseName}.mxweb`，去扩展名）。此前 `checkExtReferenceExists`
 * 只查标准名、`findFileInDir` 走「原名 + `.mxweb` 兜底」两套互不相同的候选，
 * 同一文件「解析能命中、检查存在却报缺失」。统一到这里后两端一致。
 */
export function extRefDiskCandidates(logicalName: string): string[] {
  const name = logicalName.trim()
  if (!name) return []
  const diskName = extRefDiskFileName(name)
  const candidates = [diskName]
  if (diskName !== name) candidates.push(name)
  if (isCadExtRefName(name)) {
    const baseName = extRefBaseName(name)
    if (baseName && baseName !== name && baseName !== diskName) {
      candidates.push(`${baseName}${MXWEB_EXTENSION}`)
    }
  }
  return candidates
}

/**
 * 外部参照访问 URL 路径段（唯一形态）。
 *
 * 统一为 `{hash}/{逻辑名}`，**不含 `.mxweb`**——`.mxweb` 容器层由后端
 * `findFileInDir` 按候选集兜底。此前前端「查看」拼 `.mxweb`、引擎 resolver 不拼，
 * 两种形态并存；收敛到这里后前端所有入口（查看/下载/引擎解析）一致。
 */
export function extRefAccessPath(hash: string, logicalName: string): string {
  return `${hash}/${logicalName}`
}

/**
 * 外部参照显示名：磁盘名剥 `.mxweb` 容器（`block.dwg.mxweb` → `block.dwg`）。
 *
 * 查看/下载/编辑器标题等用户可见处统一用它，避免残留内部容器层
 * （游客态查看曾把 `block.dwg.mxweb` 当显示名）。
 */
export function extRefDisplayName(name: string): string {
  return stripMxwebContainer(name)
}
