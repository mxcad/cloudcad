/**
 * FileSystemNodeDto → ListItem 格式化工具
 *
 * 用于将 api-sdk 返回的节点数据适配到 UnifiedFileList 组件的 ListItem 类型。
 */
import type { FileSystemNodeDto } from '@cloudcad/api-sdk/types.gen'

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
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatTime(isoString: string): string {
  const now = new Date()
  const target = new Date(isoString)
  const diffMs = now.getTime() - target.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) {
    const h = target.getHours().toString().padStart(2, '0')
    const m = target.getMinutes().toString().padStart(2, '0')
    return `${h}:${m}`
  }
  if (diffDay < 7) return `${diffDay} 天前`
  if (diffDay < 30) return `${Math.floor(diffDay / 7)} 周前`
  if (diffDay < 365) return `${Math.floor(diffDay / 30)} 个月前`
  return `${Math.floor(diffDay / 365)} 年前`
}
