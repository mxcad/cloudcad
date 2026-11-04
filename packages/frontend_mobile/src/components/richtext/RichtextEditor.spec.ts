/**
 * 富文本编辑器光标恢复回归测试（移动端）。
 *
 * 场景：点「引用图纸」等按钮打开选择弹层 → 焦点被弹层夺走、编辑器选区丢失 →
 * 确认后 insertHTML 必须恢复到点击前的原光标位置（而非编辑器开头/末尾）。
 * 与 PC 端 richtext.spec.tsx 同语义（两端编辑器同源同实现）。
 *
 * 仓库未安装 @vue/test-utils，用 createApp 直接挂载（与 FeedbackAttachmentDisplay.spec 同模式）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import RichtextEditor from './RichtextEditor.vue'

/** happy-dom 未实现 execCommand：stub 掉，仅验证 execCommand 作用在哪个选区上 */
function mockExecCommand() {
  const spy = vi.fn().mockReturnValue(true)
  Object.defineProperty(document, 'execCommand', {
    value: spy,
    writable: true,
    configurable: true,
  })
  return spy
}

/** 设置文档选区并手动触发 selectionchange（happy-dom 不会自动派发） */
function setSelection(range: Range) {
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
}

interface Mounted {
  app: App
  el: HTMLElement
  body: HTMLElement
  vm: { insertHTML(html: string): void; clear(): void }
}

async function mount(): Promise<Mounted> {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(RichtextEditor, { showToolbar: false })
  const vm = app.mount(el) as unknown as Mounted['vm']
  await nextTick()
  const body = el.querySelector('.rt-editor-body') as HTMLElement
  return { app, el, body, vm }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('RichtextEditor.insertHTML（弹层夺焦后恢复原光标位置）', () => {
  it('焦点被弹层夺走后，插入恢复到点击前的原光标位置（而非开头/末尾）', async () => {
    const { app, body, vm } = await mount()
    body.innerHTML = '<p>hello</p><p>world</p>'
    const worldText = (body.querySelectorAll('p')[1] as HTMLElement).firstChild as Text

    // 光标停在 "world" 开头（点击「引用图纸」按钮前的位置）
    const caret = document.createRange()
    caret.setStart(worldText, 0)
    caret.collapse(true)
    setSelection(caret)

    // 弹层打开夺走焦点：选区移出编辑器
    const outside = document.createRange()
    outside.selectNodeContents(document.body)
    outside.collapse(true)
    setSelection(outside)

    const execSpy = mockExecCommand()
    vm.insertHTML('<b>x</b>')

    // execCommand 作用在恢复后的原光标选区（world 开头），而非内容末尾
    const used = window.getSelection()!.getRangeAt(0)
    expect(used.startContainer).toBe(worldText)
    expect(used.startOffset).toBe(0)
    expect(execSpy).toHaveBeenCalledWith('insertHTML', false, '<b>x</b>')
    app.unmount()
  })

  it('保存选区节点已被移除（clear 后）时退到内容末尾', async () => {
    const { app, body, vm } = await mount()
    body.innerHTML = '<p>hello</p><p>world</p>'
    const worldText = (body.querySelectorAll('p')[1] as HTMLElement).firstChild as Text
    const caret = document.createRange()
    caret.setStart(worldText, 0)
    caret.collapse(true)
    setSelection(caret)

    // 清空编辑器：保存选区的节点脱离 DOM
    vm.clear()
    body.innerHTML = '<p>fresh</p>'

    const outside = document.createRange()
    outside.selectNodeContents(document.body)
    outside.collapse(true)
    setSelection(outside)

    mockExecCommand()
    vm.insertHTML('<b>x</b>')

    const used = window.getSelection()!.getRangeAt(0)
    const freshText = (body.querySelector('p') as HTMLElement).firstChild as Text
    // 「内容末尾」的 Range 表示：(编辑器元素, 子节点数) 或 (末文本节点, 文本长度)
    expect(used.collapsed).toBe(true)
    expect(used.startContainer === body || used.startContainer === freshText).toBe(true)
    expect(used.startOffset).toBe(
      used.startContainer === body ? body.childNodes.length : freshText.length,
    )
    app.unmount()
  })

  it('当前选区仍在编辑器内时直接使用，不触发恢复逻辑', async () => {
    const { app, body, vm } = await mount()
    body.innerHTML = '<p>hello</p>'
    const helloText = (body.querySelector('p') as HTMLElement).firstChild as Text
    const caret = document.createRange()
    caret.setStart(helloText, 2)
    caret.collapse(true)
    setSelection(caret)

    mockExecCommand()
    vm.insertHTML('<b>x</b>')

    const used = window.getSelection()!.getRangeAt(0)
    expect(used.startContainer).toBe(helloText)
    expect(used.startOffset).toBe(2)
    app.unmount()
  })
})
