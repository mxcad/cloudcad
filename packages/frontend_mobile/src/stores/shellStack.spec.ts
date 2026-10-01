/**
 * 回归测试：returnTarget 的归属校验
 *
 * 线上反馈：移动端文件页点「个人空间」，界面还是「我的项目」里某个项目子文件夹的界面，
 * 只有再切回「我的项目」再切一次「个人空间」才正常。
 *
 * 机制：returnTarget 是跨子页共享的全局栈。项目详情页打开图纸时写入的目标不带 tab
 * （返回路径就是项目详情页本身）；用户不点壳顶栏「返回」而改走 ＋ → 文件 进文件页时，
 * 该目标没人消费、留在栈里。文件页个人空间 tab 原先只认 folderId/面包屑，于是把项目
 * 子文件夹的位置当成自己的初始位置还原；而这一消费动作同时清掉了栈，所以第二次切
 * 「个人空间」时栈已空、走了正常分支——「再切一次才好」正是这个指纹。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useShellStack } from './shellStack'
import type { ShellReturnTarget } from './shellStack'

/** 项目详情页写入的返回目标：带文件夹位置，但不带 tab */
const projectTarget: ShellReturnTarget = {
  path: '/shell/file/project/prj-1',
  folderId: 'folder-1',
  breadcrumbs: [{ id: 'folder-1', name: '项目子文件夹' }],
}

/** 文件页个人空间 tab 写入的返回目标：tab === 1 */
const personalTarget: ShellReturnTarget = {
  path: '/shell/file',
  tab: 1,
  folderId: 'personal-folder-1',
  breadcrumbs: [{ id: 'personal-folder-1', name: '个人空间文件夹' }],
}

describe('takeReturnTargetForTab', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('旧判据（只看 folderId/面包屑）会把项目目标误判成个人空间位置', () => {
    const stack = useShellStack()
    stack.setReturnTarget(projectTarget)

    // 修复前 loadPersonalSpace 就走到这里为止：folderId 与面包屑都在、判据为真，
    // 于是项目子文件夹被当成个人空间的初始位置还原。
    const target = stack.returnTarget
    expect(!!target?.folderId && !!target.breadcrumbs?.length).toBe(true)
    expect(target?.path).toBe('/shell/file/project/prj-1')
  })

  it('匹配 tab 时取出并清除', () => {
    const stack = useShellStack()
    stack.setReturnTarget(personalTarget)

    expect(stack.takeReturnTargetForTab(1)).toStrictEqual(personalTarget)
    expect(stack.returnTarget).toBeNull()
  })

  it('项目详情页目标（不带 tab）不会被个人空间 tab 消费', () => {
    const stack = useShellStack()
    stack.setReturnTarget(projectTarget)

    expect(stack.takeReturnTargetForTab(1)).toBeNull()
  })

  it('不匹配时不动栈：壳顶栏「返回」箭头仍能指向来源页', () => {
    const stack = useShellStack()
    stack.setReturnTarget(projectTarget)

    stack.takeReturnTargetForTab(1)
    expect(stack.returnTarget).toStrictEqual(projectTarget)
  })

  it('不匹配后再来一个匹配的目标仍可正常消费', () => {
    const stack = useShellStack()
    stack.setReturnTarget(projectTarget)

    expect(stack.takeReturnTargetForTab(1)).toBeNull()

    stack.setReturnTarget(personalTarget)
    expect(stack.takeReturnTargetForTab(1)).toStrictEqual(personalTarget)
    expect(stack.returnTarget).toBeNull()
  })

  it('项目列表 tab（tab 0）不会误吃个人空间目标', () => {
    const stack = useShellStack()
    stack.setReturnTarget(personalTarget)

    expect(stack.takeReturnTargetForTab(0)).toBeNull()
    expect(stack.returnTarget).toStrictEqual(personalTarget)
  })

  it('栈为空时返回 null', () => {
    const stack = useShellStack()
    expect(stack.takeReturnTargetForTab(1)).toBeNull()
  })
})
