<script setup lang="ts">
/**
 * 文件高级筛选（二期 d）—— 工具栏筛选按钮打开的底部弹窗。
 *
 * 对齐 PC SearchFilters 的筛选维度（扩展名/文件大小/修改时间/创建时间），
 * 移动端原生表达：格式多选 chips、大小预设单选、修改时间快捷预设+自定义区间。
 * 参数名与后端 QueryChildrenDto / SearchDto 一致，由 useUnifiedFileList 统一织入
 * getChildren 与 search 两路请求；本组件只负责编辑与 emit('apply')。
 */
import { ref, watch, computed } from 'vue'
import { t } from '@/languages'
import type { FileListFilters } from '@/composables/useUnifiedFileList'

const props = withDefaults(
  defineProps<{
    show: boolean
    /** 当前已生效的筛选（重新打开时回填） */
    modelValue?: FileListFilters
    /**
     * 显示的筛选维度（默认全部）。回收站接口只支持扩展名（search/extension/sort），
     * 大小/时间会被后端忽略 → 回收站传 ['extension'] 避免误导。
     */
    sections?: Array<'extension' | 'size' | 'modified' | 'created'>
  }>(),
  {
    sections: () => ['extension', 'size', 'modified', 'created'],
  }
)

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'apply', filters: FileListFilters): void
}>()

const visible = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val),
})

// ── 本地编辑态（确认前不生效）──
const selectedExts = ref<string[]>([])
const sizePreset = ref<number>(0) // 0=全部
const modifiedPreset = ref<number>(-1) // -1=无快捷预设
const modifiedFrom = ref('') // date-only 'YYYY-MM-DD'
const modifiedTo = ref('')
const createdFrom = ref('')
const createdTo = ref('')

// 日期选择器（点哪个区间编辑哪个）
const editingField = ref<'modifiedFrom' | 'modifiedTo' | 'createdFrom' | 'createdTo' | null>(null)
const pickerValue = ref<string[]>([])
// van-popup 的 show 要 boolean，用 computed 桥接「编辑哪个区间」
const showDatePicker = computed({
  get: () => editingField.value !== null,
  set: (val) => {
    if (!val) editingField.value = null
  },
})

// 扩展名固定选项（与 PC getExtOptions 一致）
const EXT_OPTIONS = ['.dwg', '.dxf', '.mxweb']

// 大小预设（与 PC 一致：全部/<1MB/1–10MB/10–100MB/>100MB）
const MB = 1024 * 1024
const SIZE_PRESETS: Array<{ label: string; params: Partial<FileListFilters> }> = [
  { label: t('全部'), params: {} },
  { label: t('<1MB'), params: { sizeMax: MB - 1 } },
  { label: t('1-10MB'), params: { sizeMin: MB, sizeMax: 10 * MB - 1 } },
  { label: t('10-100MB'), params: { sizeMin: 10 * MB, sizeMax: 100 * MB - 1 } },
  { label: t('>100MB'), params: { sizeMin: 100 * MB } },
]

// 修改时间快捷预设（今天/最近7天/30天/90天）：N 天 = 含今天共 N 天，起点=本地零点
const TIME_PRESETS = [
  { label: t('今天'), days: 1 },
  { label: t('最近7天'), days: 7 },
  { label: t('最近30天'), days: 30 },
  { label: t('最近90天'), days: 90 },
]

function localStartOfDayIso(daysAgo: number): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo).toISOString()
}

// 与 PC dateOnlyToIso 一致：本地零点 → ISO（UTC）字符串
function dateOnlyToIso(dateOnly: string): string | undefined {
  const m = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return undefined
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toISOString()
}

function isoToDateOnly(iso?: string): string {
  return iso ? iso.slice(0, 10) : ''
}

// 打开时回填当前筛选
watch(
  () => props.show,
  (val) => {
    if (!val) return
    const f = props.modelValue ?? {}
    selectedExts.value = f.extension ? f.extension.split(',') : []
    sizePreset.value = matchSizePreset(f)
    modifiedPreset.value = -1
    modifiedFrom.value = isoToDateOnly(f.modifiedAtFrom)
    modifiedTo.value = isoToDateOnly(f.modifiedAtTo)
    createdFrom.value = isoToDateOnly(f.createdAtFrom)
    createdTo.value = isoToDateOnly(f.createdAtTo)
  },
  { immediate: true },
)

function matchSizePreset(f: FileListFilters): number {
  for (let i = 1; i < SIZE_PRESETS.length; i++) {
    const p = SIZE_PRESETS[i].params
    if (
      (p.sizeMin ?? undefined) === (f.sizeMin ?? undefined) &&
      (p.sizeMax ?? undefined) === (f.sizeMax ?? undefined)
    ) {
      return i
    }
  }
  return 0
}

function toggleExt(ext: string) {
  const i = selectedExts.value.indexOf(ext)
  if (i >= 0) selectedExts.value.splice(i, 1)
  else selectedExts.value.push(ext)
}

// 快捷预设与自定义区间互斥（对齐 PC：设自定义即清 timeRange）
function pickModifiedPreset(i: number) {
  modifiedPreset.value = modifiedPreset.value === i ? -1 : i
  if (modifiedPreset.value >= 0) {
    modifiedFrom.value = ''
    modifiedTo.value = ''
  }
}

function openPicker(field: 'modifiedFrom' | 'modifiedTo' | 'createdFrom' | 'createdTo') {
  editingField.value = field
  const current =
    field === 'modifiedFrom'
      ? modifiedFrom.value
      : field === 'modifiedTo'
        ? modifiedTo.value
        : field === 'createdFrom'
          ? createdFrom.value
          : createdTo.value
  pickerValue.value = current ? current.split('-') : []
  if (field === 'modifiedFrom' || field === 'modifiedTo') modifiedPreset.value = -1
}

function onPickerConfirm({ selectedValues }: { selectedValues: string[] }) {
  const value = selectedValues.join('-')
  if (editingField.value === 'modifiedFrom') modifiedFrom.value = value
  else if (editingField.value === 'modifiedTo') modifiedTo.value = value
  else if (editingField.value === 'createdFrom') createdFrom.value = value
  else if (editingField.value === 'createdTo') createdTo.value = value
  editingField.value = null
}

function buildFilters(): FileListFilters {
  const out: FileListFilters = {}
  const s = props.sections
  if (s.includes('extension') && selectedExts.value.length > 0) out.extension = selectedExts.value.join(',')
  if (s.includes('size') && sizePreset.value > 0) Object.assign(out, SIZE_PRESETS[sizePreset.value].params)
  if (s.includes('modified')) {
    if (modifiedPreset.value >= 0) {
      out.modifiedAtFrom = localStartOfDayIso(TIME_PRESETS[modifiedPreset.value].days - 1)
    }
    if (modifiedFrom.value) out.modifiedAtFrom = dateOnlyToIso(modifiedFrom.value)
    if (modifiedTo.value) out.modifiedAtTo = dateOnlyToIso(modifiedTo.value)
  }
  if (s.includes('created')) {
    if (createdFrom.value) out.createdAtFrom = dateOnlyToIso(createdFrom.value)
    if (createdTo.value) out.createdAtTo = dateOnlyToIso(createdTo.value)
  }
  return out
}

function onApply() {
  emit('apply', buildFilters())
  visible.value = false
}

function onReset() {
  selectedExts.value = []
  sizePreset.value = 0
  modifiedPreset.value = -1
  modifiedFrom.value = ''
  modifiedTo.value = ''
  createdFrom.value = ''
  createdTo.value = ''
}
</script>

<template>
  <van-popup v-model:show="visible" position="bottom" round :style="{ height: '75%' }">
    <div class="filter-popup">
      <div class="fp-header">
        <span class="fp-title">{{ t('高级筛选') }}</span>
        <van-icon name="cross" size="18" @click="visible = false" />
      </div>

      <div class="fp-body">
        <!-- 文件格式 -->
        <div v-if="props.sections.includes('extension')" class="fp-section">
          <div class="fp-section-title">{{ t('文件格式') }}</div>
          <div class="fp-chips">
            <button
              v-for="ext in EXT_OPTIONS"
              :key="ext"
              :class="['fp-chip', { active: selectedExts.includes(ext) }]"
              @click="toggleExt(ext)"
            >
              {{ ext }}
            </button>
          </div>
        </div>

        <!-- 文件大小 -->
        <div v-if="props.sections.includes('size')" class="fp-section">
          <div class="fp-section-title">{{ t('文件大小') }}</div>
          <div class="fp-chips">
            <button
              v-for="(preset, i) in SIZE_PRESETS"
              :key="i"
              :class="['fp-chip', { active: sizePreset === i }]"
              @click="sizePreset = i"
            >
              {{ preset.label }}
            </button>
          </div>
        </div>

        <!-- 修改时间 -->
        <div v-if="props.sections.includes('modified')" class="fp-section">
          <div class="fp-section-title">{{ t('修改时间') }}</div>
          <div class="fp-chips">
            <button
              v-for="(preset, i) in TIME_PRESETS"
              :key="i"
              :class="['fp-chip', { active: modifiedPreset === i }]"
              @click="pickModifiedPreset(i)"
            >
              {{ preset.label }}
            </button>
          </div>
          <div class="fp-range">
            <button class="fp-date" @click="openPicker('modifiedFrom')">
              {{ modifiedFrom || t('开始日期') }}
            </button>
            <span class="fp-date-sep">~</span>
            <button class="fp-date" @click="openPicker('modifiedTo')">
              {{ modifiedTo || t('结束日期') }}
            </button>
          </div>
        </div>

        <!-- 创建时间 -->
        <div v-if="props.sections.includes('created')" class="fp-section">
          <div class="fp-section-title">{{ t('创建时间') }}</div>
          <div class="fp-range">
            <button class="fp-date" @click="openPicker('createdFrom')">
              {{ createdFrom || t('开始日期') }}
            </button>
            <span class="fp-date-sep">~</span>
            <button class="fp-date" @click="openPicker('createdTo')">
              {{ createdTo || t('结束日期') }}
            </button>
          </div>
        </div>
      </div>

      <div class="fp-footer">
        <button class="fp-reset" @click="onReset">{{ t('重置') }}</button>
        <button class="fp-apply" @click="onApply">{{ t('确定') }}</button>
      </div>
    </div>
  </van-popup>

  <!-- 日期选择器（编辑哪个区间由 editingField 决定） -->
  <van-popup v-model:show="showDatePicker" position="bottom" round>
    <van-date-picker
      v-model="pickerValue"
      :title="t('选择日期')"
      @confirm="onPickerConfirm"
      @cancel="editingField = null"
    />
  </van-popup>
</template>

<style scoped lang="scss">
.filter-popup {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.fp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border-color);
}

.fp-title {
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--text-primary);
}

.fp-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md) var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.fp-section-title {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.fp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.fp-chip {
  padding: 6px 14px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;

  &.active {
    color: var(--primary);
    border-color: var(--primary);
    font-weight: 600;
  }
}

.fp-range {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.fp-date {
  flex: 1;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-primary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: center;
}

.fp-date-sep {
  color: var(--text-tertiary);
  font-size: 12px;
}

.fp-footer {
  display: flex;
  gap: 12px;
  padding: var(--space-md) var(--space-lg);
  border-top: 1px solid var(--border-color);
}

.fp-reset {
  flex: 1;
  padding: 12px;
  font-size: var(--font-size-body);
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.fp-apply {
  flex: 2;
  padding: 12px;
  font-size: var(--font-size-body);
  font-weight: 600;
  color: #fff;
  background: var(--accent, #00a99e);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
}
</style>
