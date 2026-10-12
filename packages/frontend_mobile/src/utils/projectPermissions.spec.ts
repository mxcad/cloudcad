/**
 * 项目角色权限配置纯函数
 *
 * 覆盖：
 *  - completePermissionDependencies 的传递补全 + 幂等（回归锁：防止勾选
 *    「删除项目」不带出「编辑项目/打开文件」，导致角色配置出无效权限组合）
 *  - getDependentPermissions 的级联下游计算（排除自身、不含无关兄弟权限）
 *  - decidePermissionChange 的勾选/取消决策（补全前置、级联确认、回推同值 noop）
 *  - 分组表与 ProjectPermission 枚举的一致性（新增权限漏分组 / 重复 key）
 *  - getProjectRoleDisplayName 的自定义角色名透传
 */
import { describe, it, expect, vi } from 'vitest'

// t 带简单 {var} 插值，便于断言参数确实被传入
vi.mock('@/languages', () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    Object.entries(params ?? {}).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      key,
    ),
}))

import {
  PROJECT_PERMISSION_DEPENDENCIES,
  ProjectPermission,
  completePermissionDependencies,
  decidePermissionChange,
  getDependentPermissions,
  getProjectPermissionGroups,
  getProjectPermissionItems,
  getProjectRoleDisplayName,
  getFileNodeMenuActions,
  type PermissionChangeDecision,
} from './projectPermissions'

describe('completePermissionDependencies', () => {
  it('勾选带依赖的权限时补全前置权限（传递）', () => {
    const result = completePermissionDependencies(['PROJECT_DELETE'])
    expect(result).toContain('PROJECT_DELETE')
    expect(result).toContain('PROJECT_UPDATE')
    expect(result).toContain('FILE_OPEN')
    // 只补该权限的依赖链，不牵动其他权限
    expect(result).toHaveLength(3)
  })

  it('重复执行结果稳定（幂等）', () => {
    const once = completePermissionDependencies(['FILE_EDIT', 'VERSION_READ'])
    const twice = completePermissionDependencies(once)
    expect(twice.sort()).toEqual(once.sort())
  })

  it('无前置换依赖的权限原样保留', () => {
    expect(completePermissionDependencies(['FILE_OPEN'])).toEqual(['FILE_OPEN'])
  })

  it('保留传入的无关权限', () => {
    const result = completePermissionDependencies(['PROJECT_DELETE', 'CAD_SAVE'])
    expect(result).toContain('CAD_SAVE')
  })

  it('空选择返回空数组', () => {
    expect(completePermissionDependencies([])).toEqual([])
  })
})

describe('getDependentPermissions', () => {
  const selected = ['FILE_OPEN', 'PROJECT_UPDATE', 'PROJECT_DELETE', 'FILE_EDIT']

  it('算出传递依赖 perm 的全部下游权限', () => {
    const dependents = getDependentPermissions('FILE_OPEN', selected)
    expect(dependents).toContain('PROJECT_UPDATE')
    expect(dependents).toContain('PROJECT_DELETE')
    expect(dependents).toContain('FILE_EDIT')
  })

  it('不返回 perm 自身', () => {
    expect(getDependentPermissions('FILE_OPEN', selected)).not.toContain('FILE_OPEN')
  })

  it('不牵连不依赖 perm 的兄弟权限', () => {
    expect(getDependentPermissions('FILE_OPEN', selected)).not.toContain('PROJECT_MEMBER_MANAGE')
  })

  it('无已选下游权限时返回空数组', () => {
    expect(getDependentPermissions('FILE_OPEN', ['FILE_OPEN'])).toEqual([])
  })

  it('依赖图与分组表同源：每个带依赖的权限其前置都在分组内', () => {
    const groupKeys = new Set(getProjectPermissionItems().map((item) => item.key))
    for (const [perm, deps] of Object.entries(PROJECT_PERMISSION_DEPENDENCIES)) {
      expect(groupKeys.has(perm as never), `${perm} 应在分组内`).toBe(true)
      for (const dep of deps) {
        expect(groupKeys.has(dep as never), `${perm} 的前置 ${dep} 应在分组内`).toBe(true)
      }
    }
  })
})

describe('decidePermissionChange', () => {
  // expect().toBe() 不做类型收窄，下面两个断言兼作类型守卫，让属性访问通过 tsc
  function accepted(decision: PermissionChangeDecision): { action: 'accept'; selected: string[] } {
    if (decision.action !== 'accept') throw new Error(`期望 accept，实际 ${decision.action}`)
    return decision
  }

  function cascade(
    decision: PermissionChangeDecision,
  ): Extract<PermissionChangeDecision, { action: 'confirm-cascade' }> {
    if (decision.action !== 'confirm-cascade') {
      throw new Error(`期望 confirm-cascade，实际 ${decision.action}`)
    }
    return decision
  }

  it('新增权限：补全前置依赖后 accept', () => {
    const decision = accepted(decidePermissionChange(['FILE_OPEN'], ['FILE_OPEN', 'FILE_DELETE']))
    expect(decision.selected).toContain('FILE_DELETE')
    expect(decision.selected).toContain('FILE_OPEN')
  })

  it('新增无前置依赖的权限：原样 accept', () => {
    expect(accepted(decidePermissionChange([], ['FILE_OPEN'])).selected).toEqual(['FILE_OPEN'])
  })

  it('取消无下游的权限：直接 accept', () => {
    const decision = accepted(decidePermissionChange(['FILE_OPEN', 'FILE_EDIT'], ['FILE_OPEN']))
    expect(decision.selected).toEqual(['FILE_OPEN'])
  })

  it('取消有下游的权限：要求级联确认，确认后去掉全部下游', () => {
    const decision = cascade(
      decidePermissionChange(
        ['FILE_OPEN', 'FILE_EDIT', 'FILE_DELETE', 'VERSION_READ'],
        ['FILE_EDIT', 'FILE_DELETE', 'VERSION_READ'],
      ),
    )
    expect(decision.removed).toEqual(['FILE_OPEN'])
    expect(decision.dependents.sort()).toEqual(['FILE_DELETE', 'FILE_EDIT', 'VERSION_READ'])
    expect(decision.confirmedSelected).toEqual([])
  })

  it('下游权限已随本次一并取消时不重复确认', () => {
    // FILE_EDIT / VERSION_READ 依赖 FILE_OPEN，但三者本次一起取消，无需再确认
    expect(
      accepted(decidePermissionChange(['FILE_OPEN', 'FILE_EDIT', 'VERSION_READ'], [])).selected,
    ).toEqual([])
  })

  it('多个取消项的下游合并去重', () => {
    // PROJECT_DELETE 同时依赖 FILE_OPEN（经 PROJECT_UPDATE）与 PROJECT_UPDATE，只应报一次
    expect(
      cascade(
        decidePermissionChange(
          ['FILE_OPEN', 'PROJECT_UPDATE', 'PROJECT_DELETE', 'PROJECT_MEMBER_MANAGE'],
          ['PROJECT_DELETE'],
        ),
      ).dependents,
    ).toEqual(['PROJECT_DELETE'])
  })

  it('回推相同集合（受控组件重渲染）：noop 不做变更', () => {
    const prev = ['FILE_OPEN', 'FILE_DELETE']
    expect(decidePermissionChange(prev, prev).action).toBe('noop')
    // 顺序不同但集合相同同样视为未变
    expect(decidePermissionChange(prev, [...prev].reverse()).action).toBe('noop')
  })

  it('空集合间变更视为 noop', () => {
    expect(decidePermissionChange([], []).action).toBe('noop')
  })
})

describe('getProjectPermissionGroups', () => {
  it('4 个分组共 21 项，与 ProjectPermission 枚举一一对应', () => {
    const groups = getProjectPermissionGroups()
    const items = groups.flatMap((group) => group.items)

    expect(groups).toHaveLength(4)
    expect(items).toHaveLength(21)

    const keys = items.map((item) => item.key)
    expect(new Set(keys).size).toBe(keys.length)

    const enumValues = Object.values(ProjectPermission)
    expect(keys.sort()).toEqual([...enumValues].sort())
  })

  it('每个分组项都有非空 label', () => {
    for (const group of getProjectPermissionGroups()) {
      expect(group.label).toBeTruthy()
      for (const item of group.items) {
        expect(item.label).toBeTruthy()
      }
    }
  })
})

describe('getProjectRoleDisplayName', () => {
  it('默认角色名映射为中文显示名', () => {
    expect(getProjectRoleDisplayName('PROJECT_OWNER')).toBe('项目所有者')
    expect(getProjectRoleDisplayName('PROJECT_VIEWER')).toBe('项目查看者')
  })

  it('自定义角色名原样透传（项目内角色可改名）', () => {
    expect(getProjectRoleDisplayName('临时协作者')).toBe('临时协作者')
  })
})

describe('getFileNodeMenuActions 文件/文件夹操作菜单派生', () => {
  const allCan = {
    download: true,
    share: true,
    externalRef: true,
    versionHistory: true,
    rename: true,
    move: true,
    copy: true,
    delete: true,
  }
  const keys = (actions: ReturnType<typeof getFileNodeMenuActions>) => actions.map((a) => a.key)

  it('个人空间（全 true can）文件：全部操作项可见', () => {
    const actions = getFileNodeMenuActions({ isFolder: false, isCad: false, can: allCan })
    expect(keys(actions)).toEqual([
      'open',
      'download',
      'share',
      'versionHistory',
      'rename',
      'move',
      'copy',
      'copyClipboard',
      'cut',
      'delete',
    ])
  })

  it('CAD 文件追加外部参照管理', () => {
    const actions = getFileNodeMenuActions({ isFolder: false, isCad: true, can: allCan })
    expect(keys(actions)).toContain('externalRef')
  })

  it('文件夹：打包下载替代下载，且无分享/版本历史/外部参照', () => {
    const actions = getFileNodeMenuActions({ isFolder: true, isCad: false, can: allCan })
    expect(keys(actions)).toContain('folderDownload')
    expect(keys(actions)).not.toContain('download')
    expect(keys(actions)).not.toContain('share')
    expect(keys(actions)).not.toContain('versionHistory')
    expect(keys(actions)).not.toContain('externalRef')
  })

  it('项目页按权限门控：can 为 false 的操作项被隐藏', () => {
    const actions = getFileNodeMenuActions({
      isFolder: false,
      isCad: false,
      can: {
        download: false,
        share: true,
        externalRef: false,
        versionHistory: true,
        rename: false,
        move: false,
        copy: false,
        delete: true,
      },
    })
    expect(keys(actions)).not.toContain('download')
    expect(keys(actions)).toContain('share')
    expect(keys(actions)).toContain('delete')
    expect(keys(actions)).not.toContain('rename')
    expect(keys(actions)).not.toContain('move')
    expect(keys(actions)).not.toContain('copy')
  })

  it('删除项带红色标记，其余项无 color', () => {
    const actions = getFileNodeMenuActions({ isFolder: false, isCad: false, can: allCan })
    expect(actions.find((a) => a.key === 'delete')?.color).toBe('#ee0a24')
    expect(actions.find((a) => a.key === 'open')?.color).toBeUndefined()
  })

  it('can 全 false 时仅剩「打开」', () => {
    const actions = getFileNodeMenuActions({
      isFolder: false,
      isCad: false,
      can: {
        download: false,
        share: false,
        externalRef: false,
        versionHistory: false,
        rename: false,
        move: false,
        copy: false,
        delete: false,
      },
    })
    expect(keys(actions)).toEqual(['open'])
  })
})
