import { computed, ref } from 'vue'

/**
 * 排序 ActionSheet（对齐 PC SORTABLE_COLUMNS 的服务端排序）。
 *
 * UnifiedFileList 与 ShareManagePage 曾各写一份几乎相同的排序弹层（字段列表 +
 * 当前字段方向指示 ↑/↓ + 同字段再点反转），收敛到这里。方向语义两端一致：
 * 名称类字段默认升序，其余默认降序；重复选择同字段则反转。
 *
 * 受控/非受控两种形态由 `onSelect` 决定：
 * - 受控：父组件持状态（如 UnifiedFileList 的 props.sortBy），`onSelect` 里 emit
 *   `sortChange` 出去；
 * - 非受控：本地 ref（如 ShareManagePage 的 sortBy/sortOrder），`onSelect` 里写回。
 * 本 composable 只算「最终字段 + 最终方向」，不感知状态属于谁。
 *
 * @param options 排序字段与当前生效值（getter 形态，父持状态时可传 `() => props.x`）
 */
export function useSortSheet<F extends string>(options: {
  /** 排序字段清单（字段 + 展示文案） */
  options: ReadonlyArray<{ field: F; label: string }>
  /** 当前生效字段（getter） */
  currentField: () => F
  /** 当前生效方向（getter） */
  currentOrder: () => 'asc' | 'desc'
  /** 切换字段时的默认方向；缺省 name→asc、其余→desc（与既有两端行为一致） */
  defaultOrderOf?: (field: F) => 'asc' | 'desc'
  /** 选中字段/方向后回调（含同字段反转后的最终方向） */
  onSelect: (field: F, order: 'asc' | 'desc') => void
}) {
  const showSortSheet = ref(false)

  const defaultOrderOf =
    options.defaultOrderOf ?? ((field: F) => (field === ('name' as F) ? 'asc' : 'desc'))

  /** ActionSheet 动作：当前字段附方向指示（↑/↓），其余留空 */
  const sortSheetActions = computed(() =>
    options.options.map((o) => ({
      name: o.label,
      subname:
        options.currentField() === o.field
          ? options.currentOrder() === 'asc'
            ? '↑'
            : '↓'
          : '',
    })),
  )

  function openSortSheet() {
    showSortSheet.value = true
  }

  /** ActionSheet 选中：找字段 → 同字段反转 / 异字段用默认方向 → 回调最终 (field, order) */
  function onSortSheetSelect(action: { name: string }) {
    const opt = options.options.find((o) => o.label === action.name)
    if (!opt) return
    showSortSheet.value = false
    const order: 'asc' | 'desc' =
      options.currentField() === opt.field
        ? options.currentOrder() === 'asc'
          ? 'desc'
          : 'asc'
        : defaultOrderOf(opt.field)
    options.onSelect(opt.field, order)
  }

  return {
    showSortSheet,
    sortSheetActions,
    openSortSheet,
    onSortSheetSelect,
    /** 排序字段清单（透传，供调用方展示当前字段标签） */
    sortSheetOptions: options.options,
  }
}
