import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { useRegisterFieldCheck } from './useRegisterFieldCheck'

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  authControllerCheckFieldUniqueness: vi.fn(),
}))

import { authControllerCheckFieldUniqueness } from '@cloudcad/api-sdk/sdk.gen'

// vi.mock 后 SDK 函数丢失 mock 类型，统一用 vi.mocked 恢复（同 useAccountCredentials.spec 写法）
function resolveWith<T extends (...args: never[]) => unknown>(fn: T, response: unknown) {
  vi.mocked(fn).mockResolvedValue(response as never)
}

function setup() {
  const username = ref('alice')
  const email = ref('alice@example.com')
  const phone = ref('13800138000')
  const check = useRegisterFieldCheck({ username, email, phone })
  return { check, username, email, phone }
}

describe('useRegisterFieldCheck 注册字段唯一性预检', () => {
  let errorSpy: { mockRestore: () => void }

  beforeEach(() => {
    vi.clearAllMocks()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('用户名与邮箱都为空 → 不发请求，直接放行', async () => {
    const { check, username, email } = setup()
    username.value = ''
    email.value = ''
    await expect(check.checkBeforeSubmit()).resolves.toBe(true)
    expect(authControllerCheckFieldUniqueness).not.toHaveBeenCalled()
  })

  it('用户名被占用 → 阻断提交并置 usernameTaken', async () => {
    const { check } = setup()
    resolveWith(authControllerCheckFieldUniqueness, {
      data: { usernameExists: true, emailExists: false },
    })
    await expect(check.checkBeforeSubmit()).resolves.toBe(false)
    expect(check.usernameTaken.value).toBe(true)
    expect(check.emailTaken.value).toBe(false)
    expect(vi.mocked(authControllerCheckFieldUniqueness)).toHaveBeenCalledWith({
      body: { username: 'alice', email: 'alice@example.com' },
    })
  })

  it('邮箱被占用 → 阻断提交并置 emailTaken', async () => {
    const { check } = setup()
    resolveWith(authControllerCheckFieldUniqueness, {
      data: { usernameExists: false, emailExists: true },
    })
    await expect(check.checkBeforeSubmit()).resolves.toBe(false)
    expect(check.emailTaken.value).toBe(true)
  })

  it('均未占用 → 放行', async () => {
    const { check } = setup()
    resolveWith(authControllerCheckFieldUniqueness, {
      data: { usernameExists: false, emailExists: false },
    })
    await expect(check.checkBeforeSubmit()).resolves.toBe(true)
    expect(check.usernameTaken.value).toBe(false)
    expect(check.emailTaken.value).toBe(false)
  })

  it('预检 API 失败（result.error）→ 不阻断提交（兜底后端 409，同 PC）', async () => {
    const { check } = setup()
    resolveWith(authControllerCheckFieldUniqueness, { error: { code: 'INTERNAL' } })
    await expect(check.checkBeforeSubmit()).resolves.toBe(true)
    expect(check.usernameTaken.value).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('预检请求异常 → 不阻断提交', async () => {
    const { check } = setup()
    vi.mocked(authControllerCheckFieldUniqueness).mockRejectedValue(new Error('network'))
    await expect(check.checkBeforeSubmit()).resolves.toBe(true)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('手机号被占用 → 返回 taken 并置 phoneTaken（不发码）', async () => {
    const { check } = setup()
    resolveWith(authControllerCheckFieldUniqueness, { data: { phoneExists: true } })
    await expect(check.checkPhoneBeforeSendCode()).resolves.toBe('taken')
    expect(check.phoneTaken.value).toBe(true)
    expect(vi.mocked(authControllerCheckFieldUniqueness)).toHaveBeenCalledWith({
      body: { phone: '13800138000' },
    })
  })

  it('手机号未占用 → 返回 ok（可发码）', async () => {
    const { check } = setup()
    resolveWith(authControllerCheckFieldUniqueness, { data: { phoneExists: false } })
    await expect(check.checkPhoneBeforeSendCode()).resolves.toBe('ok')
    expect(check.phoneTaken.value).toBe(false)
  })

  it('手机号为空 → 直接 ok 不发请求', async () => {
    const { check, phone } = setup()
    phone.value = '   '
    await expect(check.checkPhoneBeforeSendCode()).resolves.toBe('ok')
    expect(authControllerCheckFieldUniqueness).not.toHaveBeenCalled()
  })

  it('手机号预检 API 失败 → 返回 error（按发码失败处理，同 PC）', async () => {
    const { check } = setup()
    vi.mocked(authControllerCheckFieldUniqueness).mockRejectedValue(new Error('network'))
    await expect(check.checkPhoneBeforeSendCode()).resolves.toBe('error')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('字段值变化清除对应 taken 标记（避免过期错误持续阻断）', async () => {
    const { check, username, email, phone } = setup()
    resolveWith(authControllerCheckFieldUniqueness, {
      data: { usernameExists: true, emailExists: true, phoneExists: true },
    })
    await check.checkBeforeSubmit()
    await check.checkPhoneBeforeSendCode()
    expect(check.usernameTaken.value).toBe(true)
    expect(check.emailTaken.value).toBe(true)
    expect(check.phoneTaken.value).toBe(true)

    username.value = 'bob'
    email.value = 'bob@example.com'
    phone.value = '13900139000'
    await nextTick()
    expect(check.usernameTaken.value).toBe(false)
    expect(check.emailTaken.value).toBe(false)
    expect(check.phoneTaken.value).toBe(false)
  })
})
