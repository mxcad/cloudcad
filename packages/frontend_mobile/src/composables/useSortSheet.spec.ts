import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useSortSheet } from './useSortSheet'

const OPTIONS = [
  { field: 'updatedAt' as const, label: '修改时间' },
  { field: 'createdAt' as const, label: '创建时间' },
  { field: 'name' as const, label: '名称' },
]

describe('useSortSheet', () => {
  it('打开/关闭：openSortSheet 置 showSortSheet=true', () => {
    const sort = useSortSheet({
      options: OPTIONS,
      currentField: () => 'updatedAt',
      currentOrder: () => 'desc',
      onSelect: () => {},
    })
    expect(sort.showSortSheet.value).toBe(false)
    sort.openSortSheet()
    expect(sort.showSortSheet.value).toBe(true)
  })

  it('当前字段显示方向指示（↑/↓），非当前字段留空', () => {
    const sort = useSortSheet({
      options: OPTIONS,
      currentField: () => 'name',
      currentOrder: () => 'asc',
      onSelect: () => {},
    })
    const actions = sort.sortSheetActions.value
    expect(actions.find((a) => a.name === '名称')?.subname).toBe('↑')
    expect(actions.find((a) => a.name === '修改时间')?.subname).toBe('')
  })

  it('切换字段用默认方向（name→asc，其余→desc）并回调', () => {
    const onSelect = vi.fn()
    const sort = useSortSheet({
      options: OPTIONS,
      currentField: () => 'updatedAt',
      currentOrder: () => 'desc',
      onSelect,
    })
    sort.onSortSheetSelect({ name: '名称' })
    expect(onSelect).toHaveBeenCalledWith('name', 'asc')
    expect(sort.showSortSheet.value).toBe(false)
  })

  it('同字段重复选择反转方向（getter 读可变状态）', () => {
    const sortBy = ref<'updatedAt' | 'name' | 'createdAt'>('updatedAt')
    const sortOrder = ref<'asc' | 'desc'>('desc')
    const onSelect = vi.fn(
      (field: 'updatedAt' | 'name' | 'createdAt', order: 'asc' | 'desc') => {
        sortBy.value = field
        sortOrder.value = order
      },
    )
    const sort = useSortSheet({
      options: OPTIONS,
      currentField: () => sortBy.value,
      currentOrder: () => sortOrder.value,
      onSelect,
    })
    sort.onSortSheetSelect({ name: '修改时间' })
    expect(onSelect).toHaveBeenLastCalledWith('updatedAt', 'asc')
    sort.onSortSheetSelect({ name: '修改时间' })
    expect(onSelect).toHaveBeenLastCalledWith('updatedAt', 'desc')
  })

  it('未知 label 不回调', () => {
    const onSelect = vi.fn()
    const sort = useSortSheet({
      options: OPTIONS,
      currentField: () => 'updatedAt',
      currentOrder: () => 'desc',
      onSelect,
    })
    sort.onSortSheetSelect({ name: '不存在的字段' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('非受控形态：onSelect 写回 ref 后，后续 currentField 读到新值', () => {
    const sortBy = ref<'updatedAt' | 'name' | 'createdAt'>('updatedAt')
    const sortOrder = ref<'asc' | 'desc'>('desc')
    const sort = useSortSheet({
      options: OPTIONS,
      currentField: () => sortBy.value,
      currentOrder: () => sortOrder.value,
      onSelect: (field, order) => {
        sortBy.value = field
        sortOrder.value = order
      },
    })
    sort.onSortSheetSelect({ name: '名称' })
    expect(sortBy.value).toBe('name')
    expect(sortOrder.value).toBe('asc')
  })
})
