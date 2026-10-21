import { describe, it, expect } from 'vitest';
import { getErrorMessage, isAbortError, isServerError } from './errorHandler';

// getErrorMessage 是各调用方 toast 文案的唯一来源：漏掉字段级原因，用户就只能对着
// 「请求参数验证失败」猜改哪个字段（#469）。
describe('getErrorMessage（#469：不丢后端 errors[]）', () => {
  it('保留顶层文案，并把字段级明细拼进同一句', () => {
    expect(
      getErrorMessage({
        code: 'VALIDATION_ERROR',
        message: '请求参数验证失败',
        errors: [{ field: 'pattern', message: 'property pattern should not exist' }],
      })
    ).toBe('请求参数验证失败（pattern: property pattern should not exist）');
  });

  it('多条字段明细按序拼接', () => {
    expect(
      getErrorMessage({
        code: 'VALIDATION_ERROR',
        message: '请求参数验证失败',
        errors: [
          { field: 'level', message: 'level must be one of the following values: L1, L2, ALL' },
          { field: 'pattern', message: 'property pattern should not exist' },
        ],
      })
    ).toBe(
      '请求参数验证失败（level: level must be one of the following values: L1, L2, ALL；' +
        'pattern: property pattern should not exist）'
    );
  });

  it('无 errors[] 时只返回顶层文案', () => {
    expect(
      getErrorMessage({ code: 'BAD_REQUEST', message: '缓存不存在' })
    ).toBe('缓存不存在');
  });

  it('message 为数组时逐项拼接', () => {
    expect(getErrorMessage({ message: ['a', 'b'] })).toBe('a b');
  });

  it('后端透出未翻译的 i18n key 时原样返回（前端命名空间没有该 key，属后端问题）', () => {
    expect(
      getErrorMessage({ code: 'VALIDATION_ERROR', message: 'error.validation.failed' })
    ).toBe('error.validation.failed');
  });

  it('原有兜底不变：Error 实例 / 字符串 / 空对象 / null', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage('boom')).toBe('boom');
    expect(getErrorMessage({})).toBe('请求失败，请检查网络或联系管理员');
    expect(getErrorMessage(null)).toBe('未知错误');
  });
});

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
