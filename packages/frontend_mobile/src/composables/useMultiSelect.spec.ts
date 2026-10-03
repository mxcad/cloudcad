/**
 * useMultiSelect：长按多选状态机。
 *
 * 回归点（「已选 N 项却点不动」卡死类）：
 * - 长按进入多选并选中被按项；
 * - 点按切换选中；清空自动退出多选；
 * - 导航（面包屑变化）清除选中——跨文件夹后 selected 是旧 id，操作项全部失效且计数残留；
 * - 面包屑不变（下拉刷新）保留选中；
 * - 面包屑空→就绪（初次加载）也清除（挂载初期不可能有选中，行为无害但锁死语义）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { effectScope, ref } from 'vue'
import { useMultiSelect } from './useMultiSelect'

function create(initial: Array<{ id: string; name: string }> = [{ id: 'root', name: '根' }]) {
  const scope = effectScope()
  let ms!: ReturnType<typeof useMultiSelect>
  // 响应式源（对齐 SFC 的 props.breadcrumb；普通数组 splice 不触发 watch）
  const list = ref(initial)
  scope.run(() => {
    ms = useMultiSelect(() => list.value)
  })
  return {
    ms,
    setBreadcrumbs: (b: Array<{ id: string; name: string }>) => (list.value = b),
    stop: () => scope.stop(),
  }
}

describe('useMultiSelect', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('长按进入多选并选中被按项', () => {
    const { ms, stop } = create()
    expect(ms.isSelectionMode.value).toBe(false)
    ms.enterWith({ id: 'a' })
    expect(ms.isSelectionMode.value).toBe(true)
    expect([...ms.selected.value]).toStrictEqual(['a'])
    stop()
  })

  it('点按切换选中；清空自动退出多选', () => {
    const { ms, stop } = create()
    ms.enterWith({ id: 'a' })
    ms.toggleSelect({ id: 'b' })
    expect([...ms.selected.value].sort()).toStrictEqual(['a', 'b'])
    ms.toggleSelect({ id: 'a' })
    expect(ms.isSelectionMode.value).toBe(true)
    ms.toggleSelect({ id: 'b' })
    expect(ms.isSelectionMode.value).toBe(false)
    expect(ms.selected.value.size).toBe(0)
    stop()
  })

  it('导航（面包屑变化）清除选中', async () => {
    const { ms, setBreadcrumbs, stop } = create([
      { id: 'root', name: '根' },
      { id: 'f1', name: 'F1' },
    ])
    ms.enterWith({ id: 'a' })
    ms.toggleSelect({ id: 'b' })
    expect(ms.selected.value.size).toBe(2)

    setBreadcrumbs([{ id: 'root', name: '根' }, { id: 'f2', name: 'F2' }])
    await vi.waitFor(() => {
      expect(ms.isSelectionMode.value).toBe(false)
      expect(ms.selected.value.size).toBe(0)
    })
    stop()
  })

  it('面包屑不变（下拉刷新）保留选中', async () => {
    const { ms, setBreadcrumbs, stop } = create([{ id: 'root', name: '根' }])
    ms.enterWith({ id: 'a' })
    setBreadcrumbs([{ id: 'root', name: '根' }])
    // 让 watch 调度器冲刷一拍：若误触发会清选中，断言即验证「未触发」
    await vi.waitFor(() => expect(ms.isSelectionMode.value).toBe(true))
    expect([...ms.selected.value]).toStrictEqual(['a'])
    stop()
  })

  it('面包屑空→就绪（初次加载）清除选中', async () => {
    const { ms, setBreadcrumbs, stop } = create([])
    // 模拟挂载初期误入多选（正常不可能，锁死语义：就绪即清）
    ms.enterWith({ id: 'a' })
    setBreadcrumbs([{ id: 'root', name: '根' }])
    await vi.waitFor(() => {
      expect(ms.isSelectionMode.value).toBe(false)
      expect(ms.selected.value.size).toBe(0)
    })
    stop()
  })

  it('全选/清空：selectAll 选中全部，clearSelection 清空并退出', () => {
    const { ms, stop } = create()
    ms.enterWith({ id: 'a' })
    ms.selectAll(['a', 'b', 'c'])
    expect([...ms.selected.value].sort()).toStrictEqual(['a', 'b', 'c'])
    expect(ms.isSelectionMode.value).toBe(true)
    ms.clearSelection()
    expect(ms.selected.value.size).toBe(0)
    expect(ms.isSelectionMode.value).toBe(false)
    stop()
  })
})
