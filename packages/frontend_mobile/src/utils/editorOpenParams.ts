// 编辑器打开参数（URL query → 结构化对象）单一解析出口。
//
// 此前 useFileLoader / plugins/mxcad / useVersionHistory / home/index.vue 各自从
// window.location.search 手工 new URLSearchParams + params.get('fileId') 等散写，
// 参数名拼错或新增参数时静默漏读。收敛为本模块 parseEditorOpenParams 唯一出口。
//
// 注意 hash 有 fileHash 别名（历史兼容），version 是 'v'（不是 'version'）。
export const EDITOR_OPEN_PARAM_KEYS = {
  fileId: 'fileId',
  nodeId: 'nodeId',
  hash: 'hash',
  fileHash: 'fileHash',
  fileName: 'fileName',
  version: 'v',
  shareToken: 'shareToken',
  library: 'library',
  collabWorkId: 'collabWorkId',
  collabDrawingId: 'drawingId',
  collabProjectId: 'projectId',
  back: 'back',
} as const

export interface EditorOpenParams {
  fileId: string | null
  nodeId: string | null
  hash: string | null
  fileName: string | null
  version: number | undefined
  shareToken: string | null
  library: string | null
  collabWorkId: string | null
  collabDrawingId: string | null
  collabProjectId: string | null
  back: string | null
}

export function parseEditorOpenParams(search: string): EditorOpenParams {
  const params = new URLSearchParams(search)
  let version: number | undefined
  const rawVersion = params.get(EDITOR_OPEN_PARAM_KEYS.version)
  if (rawVersion) {
    const num = parseInt(rawVersion, 10)
    version = Number.isNaN(num) ? undefined : num
  }
  return {
    fileId: params.get(EDITOR_OPEN_PARAM_KEYS.fileId),
    nodeId: params.get(EDITOR_OPEN_PARAM_KEYS.nodeId),
    hash:
      params.get(EDITOR_OPEN_PARAM_KEYS.hash) ||
      params.get(EDITOR_OPEN_PARAM_KEYS.fileHash),
    fileName: params.get(EDITOR_OPEN_PARAM_KEYS.fileName),
    version,
    shareToken: params.get(EDITOR_OPEN_PARAM_KEYS.shareToken),
    library: params.get(EDITOR_OPEN_PARAM_KEYS.library),
    collabWorkId: params.get(EDITOR_OPEN_PARAM_KEYS.collabWorkId),
    collabDrawingId: params.get(EDITOR_OPEN_PARAM_KEYS.collabDrawingId),
    collabProjectId: params.get(EDITOR_OPEN_PARAM_KEYS.collabProjectId),
    back: params.get(EDITOR_OPEN_PARAM_KEYS.back),
  }
}
