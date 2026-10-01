/**
 * FileSystemNodeDto → ListItem 格式化工具
 *
 * 用于将 api-sdk 返回的节点数据适配到 UnifiedFileList 组件的 ListItem 类型。
 */
import type { FileSystemNodeDto } from '@cloudcad/api-sdk/types.gen'
import { relativeTime, formatBytes } from '@cloudcad/platform'

export interface FileListItem {
  id: string
  name: string
  ext: string
  size?: string
  time?: string
  isFolder?: boolean
  thumb?: string
  path?: string
  /** 节点类型（回收站里的项目根按项目图标展示，与普通文件夹区分） */
  nodeType?: string
  /** 是否根节点（回收站恢复分支：根节点走批量恢复接口） */
  isRoot?: boolean
  /** 原位置路径（回收站/搜索结果来源徽章，仅非空时渲染） */
  ancestorPath?: string
  /** 所属项目 id（版本历史 API 的 projectId 入参；个人空间文件为个人空间节点 id） */
  projectId?: string
  /** 文件状态（FAILED 显示「转换失败」红标，对齐 PC FileItemInfo failedBadge） */
  fileStatus?: string
  /** 节点描述（项目根卡片 footer 展示，2 行截断，对齐 PC FileItemInfo descriptionText） */
  description?: string
  /** 成员数量（项目根卡片元数据行，对齐 PC FileItemInfo metaStats） */
  memberCount?: number
}

export function formatNodeAsItem(node: FileSystemNodeDto): FileListItem {
  const ext = extractExtension(node.name)
  const size = node.size ? formatSize(node.size) : ''
  const time = node.updatedAt ? formatTime(node.updatedAt) : ''

  return {
    id: node.id,
    name: node.name,
    ext,
    size,
    time,
    isFolder: node.isFolder || node.nodeType === 'FOLDER',
    path: node.path,
    nodeType: node.nodeType,
    isRoot: node.isRoot,
    ancestorPath: node.ancestorPath,
    projectId: node.projectId,
    fileStatus: node.fileStatus,
    description: node.description,
    memberCount: node.memberCount,
  }
}

export function formatNodeAsItems(nodes: FileSystemNodeDto[]): FileListItem[] {
  return nodes.map(formatNodeAsItem)
}

export function extractExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  return name.slice(dot + 1).toUpperCase()
}

export function formatSize(bytes: number): string {
  return formatBytes(bytes)
}

export function formatTime(isoString: string): string {
  const r = relativeTime(isoString)
  if (r.tier === 'just_now') return '刚刚'
  switch (r.unit) {
    case 'minute':
      return `${r.value} 分钟前`
    case 'hour':
      return `${r.value} 小时前`
    case 'day':
      return `${r.value} 天前`
    case 'week':
      return `${r.value} 周前`
    case 'month':
      return `${r.value} 个月前`
    case 'year':
      return `${r.value} 年前`
  }
}
