/**
 * 另存为面板（移动端）回归测试。
 *
 * 覆盖外部参照复制修复：SaveAsSheet 提交时把源图纸哈希（currentFileHash）
 * 作为 sourceFileHash 透传给 executeSaveAs——后端据此从 uploads 复制外部参照。
 * hash 打开的公开图纸其 fileId 是 hash 串（非真实节点 id），后端按 nodeId
 * 查不到节点目录，必须靠 sourceFileHash 兜底（对齐 PC）。
 *
 * 仓库未安装 @vue/test-utils，用 createApp 直接挂载 + happy-dom 查询。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import Vant from 'vant'
import SaveAsSheet from './SaveAsSheet.vue'

// useSaveAs：断言 executeSaveAs 收到的参数（sourceNodeId / sourceFileHash）
// 纯对象即可（组件只读 .value，不依赖响应式）
const mockSaveAs = vi.hoisted(() => {
  const ref = (v: unknown) => ({ value: v })
  return {
    executeSaveAs: vi.fn(),
    fileName: ref('plan'),
    targetType: ref('personal'),
    selectedProjectId: ref(''),
    selectedParentId: ref(''),
    format: ref('dwg'),
    libraryType: ref('drawing'),
    saving: ref(false),
    projects: ref([]),
    personalSpaceId: ref('ps-root'),
    libraryRootId: ref(null),
    loadPersonalSpace: vi.fn(),
    loadProjects: vi.fn(),
    loadLibraryRoot: vi.fn(),
    init: vi.fn(),
    setCanSaveToLibrary: vi.fn(),
  }
})
vi.mock('../../../composables/useSaveAs', () => ({
  useSaveAs: () => mockSaveAs,
}))

// useUser：已登录 + 无资源库权限（收敛到 personal 落点）
const mockAuth = vi.hoisted(() => ({
  isAuthenticated: { value: true },
  hasPermission: vi.fn(() => false),
}))
vi.mock('../../../composables/useUser', () => ({
  useUser: () => ({
    user: { value: { id: 'u1' } },
    isAuthenticated: mockAuth.isAuthenticated,
    hasPermission: mockAuth.hasPermission,
    refresh: vi.fn(),
    logout: vi.fn(),
  }),
}))

// useFolderTree：不真实浏览，仅满足 setup 解构
vi.mock('../../../composables/useFolderTree', () => ({
  useFolderTree: () => ({
    folderPath: { value: [] },
    folderNodes: { value: [] },
    folderLoading: { value: false },
    lastFolderPath: { value: [] },
    openFolderPicker: vi.fn(),
    loadFolderChildren: vi.fn(),
    enterFolder: vi.fn(),
    goToRoot: vi.fn(),
    navigateToBreadcrumb: vi.fn(),
    goUp: vi.fn(),
    selectFolder: vi.fn(),
    clearFolderPath: vi.fn(),
  }),
}))

// saveService：getMxwebBlob 返回假 blob（不依赖引擎）
vi.mock('../../../services/saveService', () => ({
  getMxwebBlob: vi.fn(async () => new Blob(['x'])),
}))

interface Mounted {
  app: App
  el: HTMLElement
}

/** FloatingPopup 有开启动画/teleport，nextTick 不够，需真实宏任务等待 */
const tick = () => new Promise((r) => setTimeout(r, 150))

async function mountSheet(props: Record<string, unknown>): Promise<Mounted> {
  // props 用 any 绕开 h() 对组件 props 的精确推断（测试只关心透传字段）
  const app = createApp({ render: () => h(SaveAsSheet, props as never) })
  app.use(Vant)
  const el = document.createElement('div')
  document.body.appendChild(el)
  app.mount(el)
  await tick()
  return { app, el }
}

/** 保存按钮（FloatingPopup teleport 到 body，从 document 取） */
function saveBtn(): HTMLButtonElement {
  const btn = document.querySelector('.footer-btn--primary') as HTMLButtonElement
  expect(btn).toBeTruthy()
  return btn
}

describe('SaveAsSheet 外部参照哈希透传', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    mockSaveAs.executeSaveAs.mockResolvedValue({ success: true, nodeId: 'n1' })
  })

  it('hash 打开场景：currentFileHash 作为 sourceFileHash 透传（fileId 是 hash 串）', async () => {
    const { app } = await mountSheet({
      show: true,
      currentFileName: 'plan.dwg',
      currentNodeId: 'abc123hash',
      currentFileHash: 'abc123hash',
    })
    saveBtn().click()
    await tick()

    expect(mockSaveAs.executeSaveAs).toHaveBeenCalledTimes(1)
    const arg = mockSaveAs.executeSaveAs.mock.calls[0][0]
    expect(arg.sourceNodeId).toBe('abc123hash')
    expect(arg.sourceFileHash).toBe('abc123hash')
    app.unmount()
  })

  it('nodeId 打开场景：currentFileHash 取节点 fileHash，与 sourceNodeId 各自独立', async () => {
    const { app } = await mountSheet({
      show: true,
      currentFileName: 'plan.dwg',
      currentNodeId: 'node-uuid-1',
      currentFileHash: 'deadbeefdeadbeefdeadbeefdeadbeef',
    })
    saveBtn().click()
    await tick()

    const arg = mockSaveAs.executeSaveAs.mock.calls[0][0]
    expect(arg.sourceNodeId).toBe('node-uuid-1')
    expect(arg.sourceFileHash).toBe('deadbeefdeadbeefdeadbeefdeadbeef')
    app.unmount()
  })

  it('未传 currentFileHash 时 sourceFileHash 为 undefined（不误传）', async () => {
    const { app } = await mountSheet({
      show: true,
      currentFileName: 'plan.dwg',
      currentNodeId: 'node-uuid-2',
    })
    saveBtn().click()
    await tick()

    const arg = mockSaveAs.executeSaveAs.mock.calls[0][0]
    expect(arg.sourceNodeId).toBe('node-uuid-2')
    expect(arg.sourceFileHash).toBeUndefined()
    app.unmount()
  })
})
