/**
 * 反馈附件展示（移动端）动作分支测试。
 *
 * 点按分支：
 *  - 图片（有 viewUrl）→ Vant showImagePreview（可缩放/长按保存），不触发下载；
 *  - 文档/其余有 URL → triggerUrlDownload（锚点直下，带文件名）；
 *  - 图纸引用（REFERENCE）无 URL → 纯徽标不可点（无箭头、点击无动作）。
 *
 * 仓库未安装 @vue/test-utils，用 createApp 直接挂载（与 FeedbackQueryPage.spec 同模式）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import type { FeedbackAttachmentDto } from '@cloudcad/api-sdk/types.gen'
import FeedbackAttachmentDisplay from './FeedbackAttachmentDisplay.vue'

const showImagePreview = vi.hoisted(() => vi.fn())
vi.mock('vant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vant')>()
  return { ...actual, showImagePreview }
})

const triggerUrlDownload = vi.hoisted(() => vi.fn())
vi.mock('@/utils/download', () => ({
  triggerUrlDownload: (...args: unknown[]) => triggerUrlDownload(...args),
}))

function baseAtt(over: Partial<FeedbackAttachmentDto> = {}): FeedbackAttachmentDto {
  return {
    id: 'att-1',
    feedbackId: 'fb-1',
    type: 'IMAGE',
    kind: 'FILE',
    fileName: 'a.png',
    mimeType: 'image/png',
    size: 1024,
    nodeId: null,
    fileHash: null,
    contentHash: null,
    region: null,
    thumbnailUrl: null,
    viewUrl: null,
    downloadUrl: null,
    uploadedByName: null,
    createdAt: '2026-11-02T00:00:00Z',
    ...over,
  }
}

interface Mounted {
  app: App
  el: HTMLElement
}

async function mount(attachments: FeedbackAttachmentDto[]): Promise<Mounted> {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(FeedbackAttachmentDisplay, { attachments })
  app.mount(el)
  await nextTick()
  return { app, el }
}

async function clickItem(el: HTMLElement) {
  const item = el.querySelector('.fba-item') as HTMLElement
  expect(item).toBeTruthy()
  item.dispatchEvent(new Event('click'))
  await nextTick()
}

describe('FeedbackAttachmentDisplay 点按动作分支', () => {
  beforeEach(() => {
    showImagePreview.mockReset()
    triggerUrlDownload.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('图片有 viewUrl → showImagePreview（绝对 URL），不触发下载', async () => {
    const { app, el } = await mount([
      baseAtt({ viewUrl: '/api/v1/feedback/attachments/att-1/download?token=1.abc' }),
    ])
    await clickItem(el)
    expect(showImagePreview).toHaveBeenCalledTimes(1)
    const images = showImagePreview.mock.calls[0][0] as string[]
    expect(images[0]).toContain('/api/v1/feedback/attachments/att-1/download?token=1.abc')
    expect(triggerUrlDownload).not.toHaveBeenCalled()
    app.unmount()
  })

  it('文档有 viewUrl → triggerUrlDownload（带文件名）', async () => {
    const { app, el } = await mount([
      baseAtt({ type: 'DOCUMENT', fileName: 'b.docx', viewUrl: '/api/v1/x?token=1.abc' }),
    ])
    await clickItem(el)
    expect(triggerUrlDownload).toHaveBeenCalledTimes(1)
    const [url, name] = triggerUrlDownload.mock.calls[0] as [string, string]
    expect(url).toContain('/api/v1/x?token=1.abc')
    expect(name).toBe('b.docx')
    expect(showImagePreview).not.toHaveBeenCalled()
    app.unmount()
  })

  it('图片仅 downloadUrl（无 viewUrl）→ 回落下载', async () => {
    const { app, el } = await mount([baseAtt({ downloadUrl: '/api/v1/y' })])
    await clickItem(el)
    expect(triggerUrlDownload).toHaveBeenCalledTimes(1)
    expect(showImagePreview).not.toHaveBeenCalled()
    app.unmount()
  })

  it('图纸引用无 URL → 无箭头、点击无动作', async () => {
    const { app, el } = await mount([
      baseAtt({ type: 'DRAWING', kind: 'REFERENCE', fileName: 'c.dwg' }),
    ])
    expect(el.querySelector('.fba-arrow')).toBeNull()
    await clickItem(el)
    expect(showImagePreview).not.toHaveBeenCalled()
    expect(triggerUrlDownload).not.toHaveBeenCalled()
    app.unmount()
  })

  it('空列表 → 无附件占位', async () => {
    const { app, el } = await mount([])
    expect(el.querySelector('.fba-empty')).toBeTruthy()
    app.unmount()
  })
})
