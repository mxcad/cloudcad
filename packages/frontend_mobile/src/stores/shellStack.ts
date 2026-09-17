/**
 * 移动端 App 壳子页栈管理（T2 定稿 / M1 实施）
 *
 * 与 Vue Router 同步：router 是导航源，此 store 是栈状态的单一出口。
 * 子页 push/pop 通过 router.push/router.back，router watcher 同步到 store。
 *
 * 使用方：PersistentEditorShell 用 hasSubpage 决定是否渲染子页容器；
 * 子页组件自身无需感知栈，只调 router.back()。
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

type ShellPageName =
  | 'file'
  | 'file-project-detail'
  | 'share'
  | 'profile'

export const useShellStack = defineStore('shellStack', () => {
  const stack = ref<ShellPageName[]>([])

  const topPage = computed<ShellPageName | null>(() =>
    stack.value.length ? stack.value[stack.value.length - 1] : null,
  )
  const hasSubpage = computed(() => stack.value.length > 0)

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

  return { stack, topPage, hasSubpage, push, pop, syncFromRoute }
})
