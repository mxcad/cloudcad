import { ref, type ComputedRef, type Ref } from 'vue'
import {
  showToast,
  showLoadingToast,
  closeToast,
  showDialog,
  showConfirmDialog,
  showSuccessToast,
  showFailToast,
} from 'vant'
import type { ActionSheetAction } from 'vant'
import {
  nodeControllerBatchDeleteNodes,
  nodeControllerUpdateNode,
  nodeControllerMoveNode,
  nodeControllerCopyNode,
  nodeControllerBatchMoveNodes,
  nodeControllerBatchCopyNodes,
  nodeControllerCreateFolder,
  nodeControllerDeleteNode,
  trashControllerRestoreTrashItems,
} from '@cloudcad/api-sdk/sdk.gen'
import type { BatchOperationResponseDto } from '@cloudcad/api-sdk/types.gen'
import { t } from '@/languages'
import type { FileListFilters } from '@/composables/useUnifiedFileList'
import { useFileSystemClipboard } from '@/stores/fileSystemClipboard'
import { useClipboardWrite } from '@/composables/useClipboardWrite'
import { useTransferTargets } from '@/composables/useTransferTargets'
import { useCrossProjectTransfer } from '@/composables/useCrossProjectTransfer'
import type { useFormatDownload } from '@/composables/useFormatDownload'
import type { useCreateDrawing } from '@/composables/useCreateDrawing'
import type { useUndoSnackbar } from '@/composables/useUndoSnackbar'
import { extractMoveCopyUndoIds } from '@/utils/moveCopyUndo'
import { filterPasteCycleItems } from '@/utils/pasteCycleGuard'
import { isCadFileName } from '@/utils/cadFile'
import { getNodeInfo } from '@/services/fileService'
import { warmupHistoricalVersion } from '@/services/versionWarmup'
import { showExternalReferenceManagePopup } from '@/plugins/vant/components/popup/showExternalReferenceManagePopup'
import { runUploadPool } from '@/utils/uploadPool'
import { calculateFileHash } from '@/utils/hashUtils'
import { uploadFile } from '@/services/mobileUploadService'
import { validateName } from '@/utils/validateName'
import { unwrap } from '@/utils/apiError'
import type { SelectionActionKey } from '../pages/shell/components/UnifiedFileList.vue'

/** 只读 ref（Ref 或 ComputedRef 皆可）：两页数据层来源既有 Ref 也有 ComputedRef，统一放宽避免可写性摩擦 */
type ReadRef<T> = Ref<T> | ComputedRef<T>

/** FAB 动作稳定 key（跨语言判别符，name 只给渲染用）——两页共用 */
export type FabActionKey = 'createFolder' | 'createDrawing' | 'uploadFile' | 'downloadTasks'

/**
 * 文件节点操作层（C2 深化：FileBrowserPage 个人空间 + ProjectDetailPage 项目 两页各一份 → 单一出口）。
 *
 * 两页差异全部收敛进 ctx（~10 处，其中 2 处结构性）：
 *  - reloadAfterOp：个人空间=loadNodes(保持分页) / 项目=refresh(回第一页)——语义不同，按页传入，**不可归一**
 *  - openItem / openHistoricalVersion / resolveParentId / folderPickerGuard / transferSource：页级回调
 *  - domain / spaceId / currentFolderId / breadcrumbs / rootId：数据层来源
 *  - pasteGate / pasteDisabledReason：个人=策略 / 项目=策略+FILE_CREATE 权限
 *  - formatDownload / createDrawing / undo / downloadOriginal：页级实例化的共享 composable
 *
 * 菜单项 menuActions 因权限门控模型结构性不同（个人空间零门控 vs 项目页 8 项 projectPermissions 逐项门控）
 * 留在各页；本 composable 只提供 onItemMenu/onMenuAction（按稳定 key 分派，key 由页级 menuActions 注入）。
 * 无参共享 composable（clipboard/clipboardWrite/transferTargets/crossTransfer）由本 composable 统一实例化。
 */
export interface FileNodeOpsContext {
  /** 操作后重载：个人空间=loadNodes(保持分页)；项目=refresh(回第一页)。两页语义不同，必须按页传入 */
  reloadAfterOp: () => Promise<void>
  /** 当前文件夹 id（粘贴目标/新建/上传的 parentId 基准） */
  currentFolderId: ReadRef<string | null>
  /** 面包屑（粘贴环防护 + 打开历史版本） */
  breadcrumbs: ReadRef<Array<{ id: string; name: string }>>
  /** 根 id（openVersionHistory 的 projectId 兜底） */
  rootId: ReadRef<string | null>
  /** 高级筛选 */
  setFilters: (filters: FileListFilters) => void
  /** 空间/项目根 id（剪贴板源根 + 跨根剪切比较） */
  spaceId: ReadRef<string | null>
  /** 个人空间根 id（文件夹选择器目标根含个人空间；惰性取一次） */
  personalSpaceId: ReadRef<string | null>
  /** 惰性确保个人空间根已取（幂等：已取则直接返回） */
  ensurePersonalSpaceId: () => Promise<void>
  /** 域（剪贴板 write 的 domain 参数） */
  domain: 'personalSpace' | 'project'
  /** 打开条目（个人空间=onPersonalItemClick；项目=enterFolder） */
  openItem: (item: { id: string; name: string; isFolder?: boolean; path?: string }) => void
  /** 打开历史版本（封装 openFromList 的 path/tab 差异） */
  openHistoricalVersion: (nodeId: string) => void
  /** 新建/上传的 parentId 兜底（个人=currentFolderId；项目=currentFolderId ?? projectId） */
  resolveParentId: () => string | null
  /** 文件夹选择器就绪判定（返回非空=就绪；个人=personalSpaceId；项目=currentFolderId ?? projectId） */
  folderPickerGuard: () => string | null
  /** 文件夹选择器源（crossTransfer.init 的 { id, name, domain }） */
  transferSource: () => { id: string; name: string; domain: 'personalSpace' | 'project' }
  /** 粘贴门控（个人=策略；项目=策略+FILE_CREATE 权限） */
  pasteGate: ComputedRef<boolean>
  pasteDisabledReason: ComputedRef<string | null>
  /** 原格式直下（useNodeDownload，页级实例化后注入，供 onMenuAction 与页级搜索/审计共用） */
  downloadOriginal: (id: string, name: string) => void
  /** 页级实例化的共享 composable（带页级回调） */
  formatDownload: ReturnType<typeof useFormatDownload>
  createDrawing: ReturnType<typeof useCreateDrawing>
  undo: ReturnType<typeof useUndoSnackbar>
}

export function useFileNodeOps(ctx: FileNodeOpsContext) {
  // 无参共享 composable：两页完全一致，统一在此实例化（避免两页各 new 一份）
  const clipboard = useFileSystemClipboard()
  const clipboardWrite = useClipboardWrite()
  const transferTargets = useTransferTargets()
  const crossTransfer = useCrossProjectTransfer()

  // ── 单条目操作菜单（A-03）──
  const menuTarget = ref<{ id: string; name: string; isFolder?: boolean; path?: string; projectId?: string } | null>(null)
  const showMenuSheet = ref(false)

  function onItemMenu(item: { id: string; name: string; isFolder?: boolean; path?: string; projectId?: string }) {
    menuTarget.value = item
    showMenuSheet.value = true
  }

  // 分派键用稳定 key 而非翻译后的 name：name 是运行时译文，任一语言文件改动
  // 都会让 `action.name === t('下载')` 静默错路由且编译器/单测都不报。name 只给渲染用。
  function onMenuAction(action: { name: string; key: string }) {
    showMenuSheet.value = false
    const target = menuTarget.value
    if (!target) return
    switch (action.key) {
      case 'open':
        ctx.openItem(target)
        break
      case 'download':
        // M9：CAD → 格式选择弹窗（转换下载）；非 CAD → 原格式直下（对齐 PC handleDownload 分流）
        if (isCadFileName(target.name)) ctx.formatDownload.openFormatDownload(target)
        else void ctx.downloadOriginal(target.id, target.name)
        break
      case 'folderDownload':
        void ctx.formatDownload.downloadFolder(target)
        break
      case 'share':
        openShare(target)
        break
      case 'externalRef':
        void openExternalRefManage(target)
        break
      case 'versionHistory':
        openVersionHistory(target)
        break
      case 'rename':
        renameTarget.value = target
        showRename.value = true
        break
      case 'move':
      case 'copy':
        openFolderPicker(action.key, [target])
        break
      case 'copyClipboard':
      case 'cut': {
        // A-29a：单条目剪贴板（对齐 PC copy_clipboard/cut；粘贴条由 UnifiedFileList 读取全局剪贴板展示）
        const mode = action.key === 'cut' ? 'cut' : 'copy'
        clipboardWrite.write([target.id], mode, ctx.spaceId.value ?? '', ctx.domain, ctx.currentFolderId.value ?? '')
        showSuccessToast(mode === 'cut' ? t('已剪切') : t('已复制'))
        break
      }
      case 'delete':
        batchDelete([target])
        break
    }
  }

  // ── 多选操作（B-03/B-17：move/copy 接线；Bug6：复制/剪切写剪贴板）──
  function onSelectionAction(action: SelectionActionKey, items: Array<{ id: string; name: string }>) {
    if (action === 'delete') {
      batchDelete(items)
    } else if (action === 'copy' || action === 'cut') {
      // 剪贴板（Bug6）：write 内部快照源域出向策略（跨项目粘贴预判用）
      clipboardWrite.write(items.map((i) => i.id), action, ctx.spaceId.value ?? '', ctx.domain, ctx.currentFolderId.value ?? '')
      showSuccessToast(
        action === 'cut'
          ? t('已剪切 {count} 项', { count: String(items.length) })
          : t('已复制 {count} 项', { count: String(items.length) }),
      )
    } else if (action === 'move') {
      openFolderPicker('move', items)
    } else if (action === 'download') {
      void ctx.formatDownload.downloadSelection(items)
    }
  }

  async function batchDelete(items: Array<{ id: string; name: string }>) {
    try {
      await showDialog({
        title: t('确认删除'),
        message: t('确定删除 {count} 个文件/文件夹？', { count: String(items.length) }),
        showCancelButton: true,
        className: 'dialog-danger',
      })
    } catch {
      return
    }

    showLoadingToast({ message: t('删除中...'), forbidClick: true })
    try {
      const res = await nodeControllerBatchDeleteNodes({
        body: { nodeIds: items.map((i) => i.id), permanently: false },
      })
      closeToast()
      unwrap(res)
      // 批量操作部分成功：透传成功/失败计数（对齐 PC「成功删除 N 项，M 项失败」）
      const data = res.data as BatchOperationResponseDto | undefined
      const failed = items.length > 1 ? (data?.failedCount ?? 0) : 0
      if (failed > 0) {
        showFailToast(t('成功删除 {n} 项，{m} 项失败', { n: String(data?.successCount ?? 0), m: String(failed) }))
      } else {
        showSuccessToast(t('删除成功'))
      }
      await ctx.reloadAfterOp()
      // 撤销：trash 恢复这批节点 + 刷新文件列表（单步撤销，顶替既有 snackbar）
      ctx.undo.trackUndo(t('已删除 {count} 个文件', { count: String(items.length) }), async () => {
        const r = await trashControllerRestoreTrashItems({ body: { itemIds: items.map((i) => i.id) } })
        unwrap(r)
        showSuccessToast(t('已恢复'))
        await ctx.reloadAfterOp()
      })
    } catch (e) {
      closeToast()
      showFailToast(t('删除失败'))
    }
  }

  /** 外部参照管理（列表直达，无需先打开编辑器）：按节点拉参照列表开管理面板（查看/下载/替换/上传+刷新）；
   *  比 PC 更正确——PC 列表菜单该项实际绑定当前编辑器上下文，移动端对点选文件生效 */
  async function openExternalRefManage(target: { id: string }) {
    await showExternalReferenceManagePopup({
      ctx: { identifier: target.id, isPublic: false },
      canManage: true,
    })
  }

  // ── 列表内分享入口（阶段 5）：文件项菜单 → ShareCurrentPopup（有效期/二维码/已有分享/撤销）──
  const showSharePopup = ref(false)
  const shareTarget = ref<{ id: string; name: string } | null>(null)

  function openShare(target: { id: string; name: string }) {
    shareTarget.value = target
    showSharePopup.value = true
  }

  // ── 列表内版本历史（二期 h）：VersionHistoryPopup 显式 target（projectId+path 取自节点）──
  const showVersionPopup = ref(false)
  const versionTarget = ref<{ projectId: string; filePath: string; fileId?: string } | null>(null)

  function openVersionHistory(target: { id: string; path?: string; projectId?: string }) {
    if (!target.path) {
      showToast(t('该文件没有版本信息'))
      return
    }
    versionTarget.value = {
      projectId: target.projectId ?? ctx.rootId.value ?? '',
      filePath: target.path,
      fileId: target.id,
    }
    showVersionPopup.value = true
  }

  /** 选中历史版本：先预热（H3，对齐 PC）——冷路径「分片下载 + bin→mxweb 转换」可能耗时数十秒，
   *  直接打开会被编辑器 60s 打开超时拖爆；预热完成（202→204）后才走统一打开入口（URL 带 ?v=） */
  async function onOpenHistoricalVersion(payload: { nodeId: string; revision: number }) {
    showLoadingToast({ message: t('正在准备历史版本文件，请稍候...'), forbidClick: false })
    try {
      const nodeInfo = await getNodeInfo(payload.nodeId)
      if (!nodeInfo.path) throw new Error(t('文件不存在或已被删除'))
      await warmupHistoricalVersion(nodeInfo.path, payload.revision)
    } catch (e) {
      showFailToast(e instanceof Error ? e.message : t('历史版本文件准备失败，请重试'))
      return
    }
    closeToast()
    const url = new URL(window.location.href)
    url.searchParams.set('v', String(payload.revision))
    history.replaceState(history.state, '', url.toString())
    ctx.openHistoricalVersion(payload.nodeId)
  }

  // ── 高级筛选（二期 d）：确认后交 composable 统一织入 getChildren/search 请求 ──
  const showFilterPopup = ref(false)

  function onFilterApply(filters: FileListFilters) {
    ctx.setFilters(filters)
  }

  const showRename = ref(false)
  const renameTarget = ref<{ id: string; name: string; isFolder?: boolean } | null>(null)

  async function onRenameConfirm(name: string) {
    const target = renameTarget.value
    if (!target) return
    showRename.value = false
    showLoadingToast({ message: t('重命名中...'), forbidClick: true })
    try {
      const res = await nodeControllerUpdateNode({
        path: { nodeId: target.id },
        body: { name },
      })
      closeToast()
      unwrap(res)
      showSuccessToast(t('重命名成功'))
      await ctx.reloadAfterOp()
      // 撤销：回写原名（对齐 PC rename undo rollback）
      ctx.undo.trackUndo(t('已重命名'), async () => {
        const r = await nodeControllerUpdateNode({ path: { nodeId: target.id }, body: { name: target.name } })
        unwrap(r)
        showSuccessToast(t('已撤销'))
        await ctx.reloadAfterOp()
      })
    } catch (e) {
      closeToast()
      showFailToast(t('重命名失败'))
    }
  }

  const showFolderPicker = ref(false)
  const folderPickerOp = ref<'move' | 'copy' | null>(null)
  const folderPickerItems = ref<Array<{ id: string; name: string }>>([])

  // ── Bug6 剪贴板粘贴：把剪贴板内容粘贴到当前文件夹（cut→move 成功后清空）──
  function onClearPaste() {
    clipboard.clearClipboard()
  }

  async function onPaste() {
    if (!clipboard.hasItems || !clipboard.mode) return
    // 粘贴被目标权限/跨项目策略禁止：粘贴条已禁用，这里兜底拦截（对齐 PC canPaste 门控）
    if (!ctx.pasteGate.value) {
      showFailToast(ctx.pasteDisabledReason.value || t('当前策略不允许粘贴'))
      return
    }
    const mode = clipboard.mode
    const targetId = ctx.currentFolderId.value ?? ctx.spaceId.value
    if (!targetId) {
      showFailToast(t('无法确定粘贴位置'))
      return
    }
    const op = mode === 'cut' ? 'move' : 'copy'
    // 跨根剪切（源=其他项目/个人空间）：文件将从源移走，二次确认（对齐 PC）
    if (mode === 'cut' && clipboard.sourceRootId && clipboard.sourceRootId !== (ctx.spaceId.value ?? '')) {
      try {
        await showConfirmDialog({
          title: t('跨项目移动'),
          message: t('将把 {count} 个项目移动到当前文件夹，源项目的文件将被移走，确定？', { count: String(clipboard.itemIds.length) }),
          confirmButtonText: t('确定'),
          cancelButtonText: t('取消'),
        })
      } catch {
        return
      }
    }
    // 环防护（对齐 PC D2）：剔除子树包含粘贴目标的剪贴板项（移入/复制到自身后代后端恒拒，先剔除避免批量部分失败）
    const pasteIds = filterPasteCycleItems(clipboard.itemIds, [
      ...ctx.breadcrumbs.value.map((b) => b.id),
      targetId,
    ])
    if (pasteIds.length === 0) {
      showFailToast(t('没有可粘贴的项目'))
      return
    }
    const items = pasteIds.map((id) => ({ id, name: '' }))
    void doMoveOrCopy({ id: targetId, name: '' }, op, items, true)
  }

  async function openFolderPicker(op: 'move' | 'copy', items: Array<{ id: string; name: string }>) {
    const ready = ctx.folderPickerGuard()
    if (!ready) {
      showFailToast(t('文件夹未就绪，请稍后再试'))
      return
    }
    folderPickerOp.value = op
    folderPickerItems.value = items
    // 拉目标根（含个人空间）+ 源转移设置；个人空间根惰性取一次（幂等，已取则跳过）
    await ctx.ensurePersonalSpaceId()
    await transferTargets.load(ctx.personalSpaceId.value)
    await crossTransfer.init(ctx.transferSource(), op)
    showFolderPicker.value = true
  }

  async function onPickerRootChange(rootId: string) {
    await crossTransfer.onRootChange(rootId, transferTargets.roots.value)
  }

  /** 后端错误透传：403 策略被拒/权限/配额 等文案直接展示，不吞成通用「移动失败」 */
  function transferErrorMessage(e: unknown, op: 'move' | 'copy'): string {
    const msg = e instanceof Error ? e.message : ''
    if (msg) return msg
    return op === 'move' ? t('移动失败') : t('复制失败')
  }

  async function doMoveOrCopy(
    folder: { id: string; name: string },
    op: 'move' | 'copy',
    items: Array<{ id: string; name: string }>,
    isClipboardPaste = false,
  ) {
    showLoadingToast({ message: isClipboardPaste ? t('粘贴中...') : op === 'move' ? t('移动中...') : t('复制中...'), forbidClick: true })
    try {
      const res = items.length === 1
        ? op === 'move'
          ? await nodeControllerMoveNode({ path: { nodeId: items[0].id }, body: { targetParentId: folder.id } })
          : await nodeControllerCopyNode({ path: { nodeId: items[0].id }, body: { targetParentId: folder.id } })
        : op === 'move'
          ? await nodeControllerBatchMoveNodes({ body: { nodeIds: items.map((i) => i.id), targetParentId: folder.id } })
          : await nodeControllerBatchCopyNodes({ body: { nodeIds: items.map((i) => i.id), targetParentId: folder.id } })
      closeToast()
      unwrap(res)
      // 批量操作部分成功：透传成功/失败计数（对齐 PC「成功移动 N 项，M 项失败」）
      const data = res.data as BatchOperationResponseDto | undefined
      const failed = items.length > 1 ? (data?.failedCount ?? 0) : 0
      if (failed > 0) {
        const n = String(data?.successCount ?? 0)
        const m = String(failed)
        showFailToast(op === 'move' ? t('成功移动 {n} 项，{m} 项失败', { n, m }) : t('成功复制 {n} 项，{m} 项失败', { n, m }))
      } else {
        showSuccessToast(isClipboardPaste ? t('粘贴成功') : op === 'move' ? t('移动成功') : t('复制成功'))
      }
      // ── 撤销（须在剪切+粘贴清空剪贴板前捕获源文件夹）──
      // 回滚目标=仅实际变化的项（move=successIds、copy=createdIds）；部分成功只回滚成功项（对齐 PC）
      const undoIds = extractMoveCopyUndoIds({
        op,
        isSingle: items.length === 1,
        singleResultId: (res.data as { id?: string } | undefined)?.id,
        batchData: data,
        originalIds: items.map((i) => i.id),
      })
      if (op === 'copy') {
        // 复制撤销：删除新建副本
        if (undoIds.length > 0) {
          ctx.undo.trackUndo(t('已复制 {count} 个文件', { count: String(undoIds.length) }), async () => {
            const r = await nodeControllerBatchDeleteNodes({ body: { nodeIds: undoIds, permanently: true } })
            unwrap(r)
            showSuccessToast(t('已撤销'))
            await ctx.reloadAfterOp()
          })
        }
      } else {
        // 移动撤销：把成功移动的节点移回源文件夹（剪切+粘贴=剪贴板源文件夹；直接移动=当前浏览文件夹）
        const sourceFolder = isClipboardPaste ? clipboard.sourceFolderId : (ctx.currentFolderId.value ?? '')
        if (undoIds.length > 0 && sourceFolder) {
          ctx.undo.trackUndo(t('已移动 {count} 个文件', { count: String(undoIds.length) }), async () => {
            const r = await nodeControllerBatchMoveNodes({ body: { nodeIds: undoIds, targetParentId: sourceFolder } })
            unwrap(r)
            showSuccessToast(t('已撤销'))
            await ctx.reloadAfterOp()
          })
        }
      }
      // 剪切粘贴：只要有项成功就清空剪贴板（对齐 PC movedIds.length>0；全失败保留可重试；复制粘贴保留）
      if (isClipboardPaste && op === 'move') {
        const moved = items.length === 1 ? 1 : (data?.successCount ?? 0)
        if (moved > 0) clipboard.clearClipboard()
      }
      await ctx.reloadAfterOp()
    } catch (e) {
      closeToast()
      showFailToast(transferErrorMessage(e, op))
    }
  }

  async function onFolderPickerSelect(folder: { id: string; name: string; rootId: string }) {
    const op = folderPickerOp.value
    const items = folderPickerItems.value
    if (!op) return
    showFolderPicker.value = false
    // 跨项目 move：源文件将被移走，二次确认（对齐 PC）
    if (op === 'move' && crossTransfer.isCrossProject.value) {
      try {
        await showConfirmDialog({
          title: t('跨项目移动'),
          message: t('将把 {count} 个项目移动到目标项目，源项目的文件将被移走，确定？', { count: String(items.length) }),
          confirmButtonText: t('确定'),
          cancelButtonText: t('取消'),
        })
      } catch {
        return // 取消
      }
    }
    void doMoveOrCopy(folder, op, items)
  }

  // ── 新建文件夹弹窗 ──
  const showCreateFolderDialog = ref(false)
  const folderNameInput = ref('')
  const showFabSheet = ref(false)

  function openCreateFolderDialog() {
    showCreateFolderDialog.value = true
    folderNameInput.value = ''
  }

  function onFabSheetSelect(action: ActionSheetAction & { key: FabActionKey }) {
    showFabSheet.value = false
    switch (action.key) {
      case 'createFolder':
        openCreateFolderDialog()
        break
      case 'createDrawing':
        ctx.createDrawing.openCreateDrawingDialog()
        break
      case 'uploadFile':
        triggerFileUpload()
        break
      case 'downloadTasks':
        ctx.formatDownload.showBatchPanel.value = true
        break
    }
  }

  async function onCreateFolderConfirm() {
    const name = folderNameInput.value.trim()
    const validation = validateName(name)
    if (!validation.valid) {
      showToast(validation.error || t('文件夹名称无效'))
      return
    }
    const parentId = ctx.resolveParentId()
    if (!parentId) return

    showCreateFolderDialog.value = false
    showLoadingToast({ message: t('创建中...'), forbidClick: true })
    try {
      const res = await nodeControllerCreateFolder({
        path: { parentId },
        body: { name },
      })
      closeToast()
      unwrap(res)
      showToast(t('文件夹创建成功'))
      await ctx.reloadAfterOp()
      // 撤销：彻底删除新建文件夹（对齐 PC createFolder undo rollback）
      const createdId = (res.data as { id?: string } | undefined)?.id
      if (createdId) {
        ctx.undo.trackUndo(t('已创建文件夹'), async () => {
          const r = await nodeControllerDeleteNode({ path: { nodeId: createdId }, query: { permanently: true } })
          unwrap(r)
          showSuccessToast(t('已撤销'))
          await ctx.reloadAfterOp()
        })
      }
    } catch (e) {
      closeToast()
      showToast(t('创建失败，请重试'))
    }
  }

  // ── 文件上传 ──
  const fileInputRef = ref<HTMLInputElement | null>(null)

  function triggerFileUpload() {
    fileInputRef.value?.click()
  }

  /**
   * 上传走 mobileUploadService（SDK 生成函数 + MD5 哈希 + 秒传检查 + 5MB 分片），
   * 与 PC 端上传管线同一套后端契约；禁止原生 fetch/FormData（见 AGENTS.md 三层一致性）。
   */
  async function onFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (files.length === 0) return

    const parentId = ctx.resolveParentId()
    if (!parentId) return

    // 多文件上传（阶段 5）：并发 2，逐文件独立成功/失败 toast，全部结束后统一重载一次
    showLoadingToast({ message: t('上传中...'), forbidClick: true, duration: 0 })
    try {
      await runUploadPool(
        files,
        async (file) => {
          const hash = await calculateFileHash(file)
          await uploadFile({ file, hash, nodeId: parentId })
        },
        (_file, ok) => {
          showToast(ok ? t('上传成功') : t('上传失败，请重试'))
        },
      )
    } finally {
      closeToast()
      await ctx.reloadAfterOp()
    }
  }

  return {
    // 状态 refs（模板绑定）
    menuTarget,
    showMenuSheet,
    showSharePopup,
    shareTarget,
    showVersionPopup,
    versionTarget,
    showFilterPopup,
    showRename,
    renameTarget,
    showFolderPicker,
    showCreateFolderDialog,
    folderNameInput,
    showFabSheet,
    fileInputRef,
    // 文件夹选择器（NodeFolderPicker 模板绑定）：目标根/策略预判/源项排除
    transferTargets,
    crossTransfer,
    folderPickerItems,
    // 事件 / 动作
    onItemMenu,
    onMenuAction,
    onSelectionAction,
    batchDelete,
    openExternalRefManage,
    openShare,
    openVersionHistory,
    onOpenHistoricalVersion,
    onFilterApply,
    onRenameConfirm,
    onClearPaste,
    onPaste,
    openFolderPicker,
    onPickerRootChange,
    onFolderPickerSelect,
    openCreateFolderDialog,
    onFabSheetSelect,
    onCreateFolderConfirm,
    triggerFileUpload,
    onFileInputChange,
  }
}
