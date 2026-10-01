import { describe, it, expect } from 'vitest'
import { isAbortError, isPermissionError, isServerError } from './errorHandler'

// 谓词口径已收敛到 @cloudcad/platform（与 PC 共用，并集更宽），本 spec 锁跨端契约。
describe('errorHandler 谓词（platform 并集口径）', () => {
  describe('isAbortError', () => {
    it('isAborted 标志 / axios code / name / message 子串 任一命中即为真', () => {
      expect(isAbortError({ isAborted: true })).toBe(true)
      expect(isAbortError({ code: 'ERR_CANCELED' })).toBe(true)
      expect(isAbortError({ code: 'ERR_FR_TXN_CANCELLED' })).toBe(true)
      expect(isAbortError({ name: 'AbortError' })).toBe(true)
      expect(isAbortError({ name: 'CanceledError' })).toBe(true)
      expect(isAbortError({ message: 'Request aborted' })).toBe(true)
      expect(isAbortError({ message: 'canceled' })).toBe(true)
      expect(isAbortError({ message: 'ERR_CANCELED' })).toBe(true)
    })
    it('普通错误 / 非对象 为假', () => {
      expect(isAbortError(new Error('boom'))).toBe(false)
      expect(isAbortError({ message: 'server error' })).toBe(false)
      expect(isAbortError('canceled')).toBe(false)
      expect(isAbortError(null)).toBe(false)
    })
  })

  describe('isPermissionError', () => {
    it('status/statusCode/response.status===403 或 isPermissionError 标志 为真', () => {
      expect(isPermissionError({ status: 403 })).toBe(true)
      expect(isPermissionError({ statusCode: 403 })).toBe(true)
      expect(isPermissionError({ response: { status: 403 } })).toBe(true)
      expect(isPermissionError({ isPermissionError: true })).toBe(true)
    })
    it('401 / 404 / 500 为假（401 走 unauthorized 非 permission）', () => {
      expect(isPermissionError({ status: 401 })).toBe(false)
      expect(isPermissionError({ status: 404 })).toBe(false)
      expect(isPermissionError({ status: 500 })).toBe(false)
    })
  })

  describe('isServerError', () => {
    it('status/statusCode/response.status 500-599 为真', () => {
      expect(isServerError({ status: 500 })).toBe(true)
      expect(isServerError({ statusCode: 503 })).toBe(true)
      expect(isServerError({ response: { status: 502 } })).toBe(true)
    })
    it('4xx / 600+ / 非数字 status / 非对象 为假', () => {
      expect(isServerError({ status: 404 })).toBe(false)
      expect(isServerError({ status: 600 })).toBe(false)
      expect(isServerError({ status: '500' })).toBe(false)
      expect(isServerError('500')).toBe(false)
    })
  })
})
