/**
 * 移动端 App 壳子页栈管理（T2 定稿 / M1 实施）
 *
 * 与 Vue Router 同步：router 是导航源，此 store 是栈状态的单一出口。
 * 子页 push/pop 通过 router.push/router.back，router watcher 同步到 store。
 *
 * 使用方：PersistentEditorShell 用 hasSubpage 决定是否渲染子页容器；
 * 子页组件自身无需感知栈，只调 router.back()。
 *
 * returnTarget 是唯一非 router 派生的状态：从子页打开图纸前由调用方写入，
 * 壳顶栏「返回」箭头据此回到原位置，目标子页 onMounted 消费后自行清除。
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

type ShellPageName =
  | 'file'
  | 'file-project-detail'
  | 'share'
  | 'profile'
  | 'member'

/** 打开图纸前记录的来源页，用于壳顶栏「返回」回到原位置 */
export interface ShellReturnTarget {
  /** 返回的壳子页路由（/shell/file 或 /shell/file/project/:id） */
  path: string
  /** 文件页 Tab：0=项目列表，1=个人空间 */
  tab?: number
  /** 打开时所在的文件夹 ID */
  folderId?: string | null
  /** 打开时的面包屑链，按原样还原 */
  breadcrumbs?: Array<{ id: string; name: string }>
}

export const useShellStack = defineStore('shellStack', () => {
  const stack = ref<ShellPageName[]>([])

  /** 打开图纸前写入的来源页；null 表示没有可返回的位置 */
  const returnTarget = ref<ShellReturnTarget | null>(null)

  const topPage = computed<ShellPageName | null>(() =>
    stack.value.length ? stack.value[stack.value.length - 1] : null,
  )
  const hasSubpage = computed(() => stack.value.length > 0)

  function setReturnTarget(target: ShellReturnTarget) {
    returnTarget.value = target
  }

  function clearReturnTarget() {
    returnTarget.value = null
  }

  function push(page: ShellPageName) {
    // 避免重复 push 同一页到栈顶（幂等）
    if (topPage.value !== page) {
      stack.value.push(page)
    }
  }

  function pop() {
    stack.value.pop()
  }

  // 从 router.currentRoute 同步栈状态（router watcher 调用）
  function syncFromRoute(routePath: string) {
    const pageMap: Record<string, ShellPageName> = {
      '/shell/file': 'file',
      '/shell/share': 'share',
      '/shell/profile': 'profile',
      '/shell/member': 'member',
    }

    // 检测项目详情路径
    if (routePath.startsWith('/shell/file/project/')) {
      stack.value = ['file', 'file-project-detail']
      return
    }

    const page = pageMap[routePath]
    if (page) {
      stack.value = [page]
    } else {
      stack.value = []
    }
  }

  return {
    stack,
    topPage,
    hasSubpage,
    returnTarget,
    setReturnTarget,
    clearReturnTarget,
    push,
    pop,
    syncFromRoute,
  }
})
