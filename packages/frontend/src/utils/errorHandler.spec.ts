import { describe, it, expect } from 'vitest';
import { isAbortError, isServerError } from './errorHandler';

// 谓词已收敛到 @cloudcad/platform（并集更宽），本 spec 锁 PC 薄适配 + 跨端契约。
describe('errorHandler 谓词（PC 薄适配 → platform）', () => {
  it('isAbortError 命中 isAborted 标志 / name / message 子串', () => {
    expect(isAbortError({ isAborted: true })).toBe(true);
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
    expect(isAbortError({ name: 'CanceledError' })).toBe(true);
    expect(isAbortError({ message: 'canceled' })).toBe(true);
    expect(isAbortError(new Error('boom'))).toBe(false);
  });

  it('isServerError 命中 status/statusCode/response.status 500-599', () => {
    expect(isServerError({ response: { status: 500 } })).toBe(true);
    expect(isServerError({ status: 503 })).toBe(true);
    expect(isServerError({ response: { status: 404 } })).toBe(false);
  });
});
