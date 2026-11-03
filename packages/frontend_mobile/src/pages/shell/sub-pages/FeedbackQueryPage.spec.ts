/**
 * 反馈进度查询页（移动端）回归测试。
 *
 * 覆盖：
 *  1. 查询码输入框曾有 maxlength="12"（查询码 18+ 位输不全）——已无此限制；
 *  2. route.query.code 预填查询码（本地记录点击跳转）；
 *  3. 打开即展示「我的反馈记录」列表（本地 + 已登录云端），查询码非必填；
 *  4. 点击本地记录凭码+联系方式查询；点击云端记录直接渲染详情（无需再查询）。
 *
 * 仓库未安装 @vue/test-utils，用 createApp + memory router 直接挂载。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createRouter, createMemoryHistory, RouterView, type Router } from 'vue-router'
import Vant from 'vant'
import FeedbackQueryPage from './FeedbackQueryPage.vue'
import {
  feedbackControllerQueryByCode,
  feedbackControllerListMine,
} from '@cloudcad/api-sdk/sdk.gen'

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  feedbackControllerQueryByCode: vi.fn(),
  feedbackControllerListMine: vi.fn(),
}))

// useUser 的 isAuthenticated 可切换（组件只读 .value）
const mockAuth = vi.hoisted(() => ({ isAuthenticated: { value: false } }))
vi.mock('@/composables/useUser', () => ({
  useUser: () => ({
    user: { value: null },
    isAuthenticated: mockAuth.isAuthenticated,
    refresh: vi.fn(),
    logout: vi.fn(),
    hasPermission: () => false,
  }),
}))

const queryApi = vi.mocked(feedbackControllerQueryByCode)
const listMineApi = vi.mocked(feedbackControllerListMine)

interface Mounted {
  app: App
  el: HTMLElement
  router: Router
}

async function mountPage(path: string): Promise<Mounted> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/shell/feedback/query', component: FeedbackQueryPage }],
  })
  await router.push(path)
  await router.isReady()
  const app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.use(Vant)
  const el = document.createElement('div')
  document.body.appendChild(el)
  app.mount(el)
  return { app, el, router }
}

/** 查询码输入框（第一个 .fb-input） */
function codeInput(el: HTMLElement): HTMLInputElement {
  const input = el.querySelector('.fb-input') as HTMLInputElement
  expect(input).toBeTruthy()
  return input
}

/** 以用户输入方式写入查询码（v-model 走 input 事件） */
function typeCode(el: HTMLElement, value: string) {
  const input = codeInput(el)
  input.value = value
  input.dispatchEvent(new Event('input'))
  return input
}

function seedLocalRecords(records: Array<Record<string, unknown>>) {
  localStorage.setItem('feedback_local_records', JSON.stringify(records))
}

function baseLocalRecord(over: Record<string, unknown> = {}) {
  return {
    code: 'FB-20261102-ABCDEF12',
    title: '本地反馈',
    type: 'BUG',
    contentHtml: '<p>本地内容</p>',
    contact: '',
    createdAt: '2026-11-02T10:00:00.000Z',
    source: 'MOBILE',
    anonymous: true,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.isAuthenticated.value = false
  localStorage.clear()
})

afterEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('FeedbackQueryPage（移动端查询页）', () => {
  it('route.query.code 预填查询码（本地记录点击跳转）', async () => {
    const { app, el } = await mountPage('/shell/feedback/query?code=fb-20261102-abcdef12')
    await nextTick()
    expect(codeInput(el).value).toBe('FB-20261102-ABCDEF12')
    app.unmount()
  })

  it('无 query.code 时输入框为空', async () => {
    const { app, el } = await mountPage('/shell/feedback/query')
    await nextTick()
    expect(codeInput(el).value).toBe('')
    app.unmount()
  })

  it('超过 12 位的查询码可完整输入并提交（回归：maxlength=12 截断）', async () => {
    queryApi.mockResolvedValue({
      data: {
        code: 'FB-20261102-ABCDEF12GH',
        status: 'PENDING',
        type: 'BUG',
        title: 't',
        content: '<p>c</p>',
        rewardStatus: 'NONE',
        createdAt: '2026-11-02T10:00:00.000Z',
        attachments: [],
      },
    } as never)
    const { app, el } = await mountPage('/shell/feedback/query')
    await nextTick()

    // 真实查询码形如 FB-YYYYMMDD-XXXXXXXX（20 位），远超旧的 maxlength=12
    const code = 'FB-20261102-ABCDEF12GH'
    expect(code.length).toBeGreaterThan(12)
    const input = typeCode(el, code)
    await nextTick()
    // 输入框未被 maxlength 截断
    expect(input.value).toBe(code)

    const btn = el.querySelector('.fb-query-btn') as HTMLButtonElement
    expect(btn).toBeTruthy()
    btn.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(queryApi).toHaveBeenCalledTimes(1)
    const call = queryApi.mock.calls[0][0] as {
      path: { code: string }
      query: { contact?: string }
    }
    expect(call.path.code).toBe(code)
    expect(call.query.contact).toBeUndefined()
    app.unmount()
  })

  it('空查询码提交时提示且不请求后端', async () => {
    const { app, el } = await mountPage('/shell/feedback/query')
    await nextTick()
    const btn = el.querySelector('.fb-query-btn') as HTMLButtonElement
    btn.click()
    await nextTick()
    expect(queryApi).not.toHaveBeenCalled()
    expect(el.querySelector('.fb-query-error')?.textContent).toContain('请输入查询码')
    app.unmount()
  })

  it('查询成功后弹出详情抽屉（状态/标题/奖励）', async () => {
    queryApi.mockResolvedValue({
      data: {
        code: 'FB-20261102-ABCDEF12',
        status: 'ADOPTED',
        type: 'SUGGESTION',
        title: '希望支持批量导出',
        content: '<p>详情</p>',
        rewardStatus: 'ISSUED',
        createdAt: '2026-11-02T10:00:00.000Z',
        attachments: [],
      },
    } as never)
    const { app, el } = await mountPage('/shell/feedback/query?code=FB-20261102-ABCDEF12')
    await nextTick()
    const btn = el.querySelector('.fb-query-btn') as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 20))

    // 详情抽屉（van-popup teleport 到 body）
    const detail = document.body.querySelector('.fb-detail')
    expect(detail).toBeTruthy()
    expect(detail?.textContent).toContain('希望支持批量导出')
    expect(detail?.textContent).toContain('已采纳')
    app.unmount()
  })

  it('有本地记录时打开即展示列表（查询码非必填）', async () => {
    seedLocalRecords([baseLocalRecord()])
    const { app, el } = await mountPage('/shell/feedback/query')
    await nextTick()
    const item = el.querySelector('.fb-record-item')
    expect(item).toBeTruthy()
    expect(item?.textContent).toContain('本地反馈')
    expect(item?.textContent).toContain('本地')
    // 未登录不请求云端列表
    expect(listMineApi).not.toHaveBeenCalled()
    app.unmount()
  })

  it('点击本地记录 → 弹出详情抽屉展示本地内容（不再后台查询云端）', async () => {
    seedLocalRecords([baseLocalRecord({ contact: '13800000000' })])
    const { app, el } = await mountPage('/shell/feedback/query')
    await nextTick()
    const item = el.querySelector('.fb-record-item') as HTMLElement
    item.click()
    await new Promise((r) => setTimeout(r, 20))

    // 本地内容直接从抽屉展示，无需再 queryByCode
    expect(queryApi).not.toHaveBeenCalled()
    const detail = document.body.querySelector('.fb-detail')
    expect(detail).toBeTruthy()
    expect(detail?.textContent).toContain('本地反馈')
    expect(detail?.textContent).toContain('本地')
    app.unmount()
  })

  it('点击本地记录（云端查不到）→ 抽屉显示本地内容 + 仅本设备提示', async () => {
    seedLocalRecords([baseLocalRecord()])
    const { app, el } = await mountPage('/shell/feedback/query')
    await nextTick()
    const item = el.querySelector('.fb-record-item') as HTMLElement
    item.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(queryApi).not.toHaveBeenCalled()
    const detail = document.body.querySelector('.fb-detail')
    expect(detail).toBeTruthy()
    expect(detail?.textContent).toContain('本地反馈')
    expect(detail?.textContent).toContain('本地记录仅保存在本设备')
    app.unmount()
  })

  it('已登录且云端有记录 → 列表展示云端记录，点击直接渲染详情（无需再查询）', async () => {
    mockAuth.isAuthenticated.value = true
    listMineApi.mockResolvedValue({
      data: {
        items: [
          {
            id: 'fb-1',
            feedbackCode: 'FB-20261102-CLOUD01',
            status: 'ADOPTED',
            type: 'SUGGESTION',
            title: '云端反馈',
            content: '<p>云端内容</p>',
            rewardStatus: 'ISSUED',
            claimRequired: false,
            createdAt: '2026-11-02T09:00:00.000Z',
            attachments: [],
          },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
      },
    } as never)
    const { app, el } = await mountPage('/shell/feedback/query')
    await new Promise((r) => setTimeout(r, 20))

    const item = el.querySelector('.fb-record-item') as HTMLElement
    expect(item).toBeTruthy()
    expect(item?.textContent).toContain('云端反馈')
    expect(item?.textContent).toContain('已采纳')

    item.click()
    await nextTick()
    // 云端记录直接弹抽屉展示详情，不再走 queryByCode
    expect(queryApi).not.toHaveBeenCalled()
    const detail = document.body.querySelector('.fb-detail')
    expect(detail).toBeTruthy()
    expect(detail?.textContent).toContain('云端反馈')
    app.unmount()
  })
})
