/**
 * 回归测试：成员列表角色下拉的递归更新死循环
 *
 * 线上报错：`Maximum recursive updates exceeded in component <van-dropdown-menu>`
 * （`/shell/file/project/:id` → ProjectDetailPage.vue 成员 Tab）
 *
 * 机制：van-dropdown-menu 的渲染 effect 会通过 `item.renderTitle()` 读到
 * DropdownItem 的 `options` / `modelValue`，所以这两个 prop 本身就是
 * DropdownMenu 的渲染依赖。成员行原先的写法：
 *   1. `:options="roles.filter(...).map(...)"` —— 模板内联，每次渲染都产出新数组，
 *      引用不稳定 → DropdownMenu 的渲染 effect 被自己刚产出的数组重新排队；
 *   2. `v-model="m.projectRoleId"` —— `m` 是 `memberRows` computed 映射出的
 *      临时对象，写回发生在 DropdownMenu 渲染树内部，正是 Vue 报错里点名的
 *      "reactive effect that is mutating its own dependencies"。
 *
 * 两者叠加 → 同一次 flush 里 DropdownMenu 的渲染 job 被反复重排，冲过 100 次
 * 即抛死循环错误。这里的判据不用渲染次数（正常多轮渲染也会累积到几十次），
 * 而用 `options` 的引用身份：内联写法每次都是新数组，稳定 computed 恒为同一个。
 *
 * 仓库未安装 @vue/test-utils，这里用 createApp 直接挂载对照变体。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createApp, defineComponent, computed, h, nextTick, ref } from 'vue'
import { Tabs, Tab, DropdownMenu, DropdownItem } from 'vant'

/**
 * 渲染被自我放大到这个程度即可定性为递归。正常一轮「选择角色 + 刷新成员」
 * 只有 4 次 options 交接；这里在 20 次时主动中断，避免撞上 Vue 的 100 次上限
 * 抛真实死循环错误、把 unhandled rejection 刷进测试报告。
 */
const RECURSION_AMPLIFICATION_AT = 20
class RecursionSentinelError extends Error {}

const ROLES = [
  { id: 'r1', name: 'PROJECT_OWNER', isOwnerRole: true },
  { id: 'r2', name: 'PROJECT_MEMBER', isOwnerRole: false },
  { id: 'r3', name: 'PROJECT_VIEWER', isOwnerRole: false },
]

const getDisplayName = (name: string) => name.replace('PROJECT_', '')

const selectableRoles = (roles: readonly any[]) =>
  roles
    .filter((r) => !r.isOwnerRole)
    .map((r) => ({ text: getDisplayName(r.name), value: r.id }))

/** 修复写法对应的稳定选项来源：与页面 memberRoleOptions 同形 */
const memberRoleOptions = computed(() => selectableRoles(ROLES))

/** 挂载后跑一轮「选择角色 + 刷新成员」，等 flush 与微任务全部落定 */
async function driveInteraction(fixture: any) {
  await nextTick().catch(() => undefined)
  fixture.selectRole('r3')
  await nextTick().catch(() => undefined)
  fixture.refreshMembers()
  await nextTick().catch(() => undefined)
  await new Promise((resolve) => setTimeout(resolve, 0)).catch(() => undefined)
}

/**
 * 与页面成员 Tab 等价的渲染结构：Tabs → 成员 Tab → 每行一个角色下拉。
 * 挂载期收集传给 DropdownItem 的 options 引用，用于判定引用是否稳定。
 */
function buildRender(optionsFactory: () => any[], writeBack: boolean) {
  const members = ref<any[]>([{ id: 'u1', projectRoleId: 'r2' }])
  const roles = ref<any[]>(ROLES)
  // 与页面一致：行对象来自 computed 的映射产物
  const memberRows = computed(() =>
    members.value.map((m) => ({ id: m.id, projectRoleId: m.projectRoleId }))
  )
  const optionsSeen: any[] = []

  const component = defineComponent({
    setup() {
      return () =>
        h(
          Tabs,
          { active: 1 },
          {
            default: () => [
              h(Tab, { title: '文件' }, { default: () => [h('span', 'file')] }),
              h(Tab, { title: '成员' }, {
                default: () =>
                  memberRows.value.map((m: any) =>
                    h('div', { key: m.id }, [
                      h(DropdownMenu, {}, {
                        default: () => {
                          const options = optionsFactory()
                          optionsSeen.push(options)
                          return [
                            h(DropdownItem, {
                              options,
                              modelValue: m.projectRoleId,
                              // `v-model="m.projectRoleId"` 的编译产物
                              'onUpdate:modelValue': writeBack
                                ? (val: string) => {
                                    m.projectRoleId = val
                                  }
                                : undefined,
                              onChange: () => {},
                            }),
                          ]
                        },
                      })
                    ])
                  ),
              }),
            ],
          }
        )
    },
  })

  return {
    component,
    /** 传给 DropdownItem 的 options 总数（即渲染轮次） */
    get optionsHandoffs() {
      return optionsSeen.length
    },
    /** 其中不重复的数组个数：1 = 引用稳定，与轮次同值 = 每次新建 */
    get distinctOptionArrays() {
      return new Set(optionsSeen).size
    },
    /** 模拟用户在下拉里选了一个新角色（DropdownItem onClick → emit update:modelValue） */
    selectRole(roleId: string) {
      const row = memberRows.value[0]
      if (writeBack) row.projectRoleId = roleId
    },
    /** 模拟 onUpdateMemberRole 成功后 loadMembers 回写 */
    refreshMembers() {
      members.value = members.value.map((m) => ({ ...m }))
    },
  }
}

describe('ProjectDetailPage 成员角色下拉', () => {
  let root: HTMLElement
  type RestorableMock = { mockRestore: () => void }
  let spies: RestorableMock[]

  beforeEach(() => {
    root = document.createElement('div')
    document.body.appendChild(root)
    spies = [
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ]
  })

  afterEach(() => {
    spies.forEach((s) => s.mockRestore())
    root.remove()
  })

  function mount(component: any) {
    const app = createApp(component)
    // sentinel 是主动中断递归的标记，不属于被测缺陷，静默吸收
    app.config.errorHandler = (err) => {
      if (!(err instanceof RecursionSentinelError)) throw err
    }
    app.mount(root)
    return app
  }

  it('修复写法：options 走稳定 computed，多轮渲染下始终是同一个引用', async () => {
    const fixture = buildRender(() => memberRoleOptions.value, false)
    const app = mount(fixture.component)
    await driveInteraction(fixture)

    // 多轮渲染下交给 DropdownItem 的始终是同一个数组引用
    expect(fixture.optionsHandoffs).toBeGreaterThan(1)
    expect(fixture.distinctOptionArrays).toBe(1)
    app.unmount()
  })

  it('线上写法（内联 options + v-model 写回）每次渲染都新建 options 数组', async () => {
    // 先测一遍同样的渲染结构用稳定引用时的正常轮次，作为递归放大的对照基线
    const baseline = buildRender(() => memberRoleOptions.value, true)
    const baselineApp = mount(baseline.component)
    await driveInteraction(baseline)
    const normalRounds = baseline.optionsHandoffs
    baselineApp.unmount()

    let calls = 0
    const fixture = buildRender(
      () => {
        calls++
        if (calls > RECURSION_AMPLIFICATION_AT) throw new RecursionSentinelError()
        return selectableRoles(ROLES)
      },
      true
    )
    const app = mount(fixture.component)
    await driveInteraction(fixture)

    // 渲染轮次远超正常轮次 = DropdownMenu 的渲染 effect 在自我触发；
    // 且每一轮都换新数组（线上正是这样冲过 100 次后抛死循环错误）
    expect(normalRounds).toBeLessThan(RECURSION_AMPLIFICATION_AT)
    expect(fixture.optionsHandoffs).toBeGreaterThanOrEqual(RECURSION_AMPLIFICATION_AT)
    expect(fixture.distinctOptionArrays).toBe(fixture.optionsHandoffs)
    app.unmount()
  })
})
