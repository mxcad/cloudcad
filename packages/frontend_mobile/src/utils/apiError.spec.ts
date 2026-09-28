import { describe, it, expect } from 'vitest';
import {
  toError,
  unwrap,
  errMsg,
  errorCode,
  errorDetail,
} from './apiError';

describe('toError', () => {
  it('原样返回已有 Error 实例', () => {
    const e = new Error('bad');
    expect(toError(e)).toBe(e);
  });

  it('字符串型业务码：保留 code 与 tempToken/email/phone/cleanupDays', () => {
    const e = toError({
      code: 'EMAIL_NOT_VERIFIED',
      message: '请先验证邮箱后再登录',
      email: 'a@b.com',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(e.message).toBe('请先验证邮箱后再登录');
    expect(errorCode(e)).toBe('EMAIL_NOT_VERIFIED');
    expect(errorDetail(e, 'email')).toBe('a@b.com');
  });

  it('apiConfig.responseTransformer 抛出的 Error（code 挂在自己身上、body 在 data 里）能取到业务码', () => {
    const e = toError(
      Object.assign(new Error('邮箱格式错误'), {
        code: 400,
        data: { code: 'BAD_REQUEST', message: '邮箱格式错误' },
      })
    );
    expect(errorCode(e)).toBe('BAD_REQUEST');
  });

  it('Axios 形态 { response: { data } } 也能解包', () => {
    const e = toError({
      response: { data: { code: 'ACCOUNT_DEACTIVATED', message: '已注销', cleanupDays: 45 } },
    });
    expect(errorCode(e)).toBe('ACCOUNT_DEACTIVATED');
    expect(errorDetail(e, 'cleanupDays')).toBe(45);
  });

  it('无法解析时回退为 String(err)', () => {
    expect(toError(null).message).toBe('null');
    expect(toError({}).message).toBe('[object Object]');
  });
});

describe('unwrap', () => {
  it('res.error 非空即抛', () => {
    expect(() =>
      unwrap({ error: { code: 'X', message: 'boom' }, data: { accessToken: 'a' } })
    ).toThrow('boom');
  });

  it('成功响应直接返回 data', () => {
    const data = { accessToken: 'tok', refreshToken: 'r', user: { id: 1 } };
    expect(unwrap({ data })).toBe(data);
  });

  it('字符串型业务码落在 res.data 上时同样抛出', () => {
    // apiConfig.responseTransformer 只抛数值型 code，字符串型业务码原样留在 res.data。
    // ProfilePage 与 useMemberCenter 历史副本缺这一段，会把错误体当成功数据吞掉。
    expect(() =>
      unwrap({ data: { code: 'PHONE_REQUIRED', message: '请先绑定手机号', tempToken: 't' } })
    ).toThrow('请先绑定手机号');
  });

  it('抛出的是带业务码的 Error，调用方仍可分支', () => {
    try {
      unwrap({ data: { code: 'ACCOUNT_DEACTIVATED', message: '已注销', cleanupDays: 45 } });
      expect.unreachable('应抛错');
    } catch (e) {
      expect(errorCode(e)).toBe('ACCOUNT_DEACTIVATED');
      expect(errorDetail(e, 'cleanupDays')).toBe(45);
      expect(errMsg(e, '兜底')).toBe('已注销');
    }
  });

  it('code 为 SUCCESS 的成功包壳不误判为错误', () => {
    expect(unwrap({ data: { code: 'SUCCESS', data: { ok: 1 } } })).toEqual({ ok: 1 } as never);
  });

  it('无 data 返回空对象', () => {
    expect(unwrap({})).toEqual({});
  });

  it('业务载荷里合法的字符串 code 字段会被误判为业务码 —— 调用方不得依赖此行为', () => {
    // 已知取舍：判定只看 data.code 的顶层位置。核查过 users / billing / vip /
    // project 四组响应 DTO 均无顶层 code 字段（billing 只有 codeUrl），故安全。
    expect(() => unwrap({ data: { code: 'PAY_NATIVE' } })).toThrow('[object Object]');
  });
});

describe('errorCode', () => {
  it('只认字符串型 body.code，数值型 code 不算业务码', () => {
    expect(errorCode({ code: 'EMAIL_NOT_VERIFIED' })).toBe('EMAIL_NOT_VERIFIED');
    expect(errorCode({ code: 400 })).toBeNull();
    expect(errorCode({})).toBeNull();
    expect(errorCode(null)).toBeNull();
    expect(errorCode('text')).toBeNull();
  });

  it('顶层是数值型 code 时回退查 error.data.code（responseTransformer 形态）', () => {
    expect(
      errorCode(Object.assign(new Error('x'), { code: 400, data: { code: 'BAD_REQUEST' } }))
    ).toBe('BAD_REQUEST');
  });

  it('data.code 不是字符串时不回退', () => {
    expect(errorCode({ code: 400, data: { code: 500 } })).toBeNull();
    expect(errorCode({ code: 400, data: { code: '' } })).toBeNull();
  });
});

describe('errMsg', () => {
  it('Error.message 优先，其次 body.message，最后回退', () => {
    expect(errMsg(new Error('e1'), 'fb')).toBe('e1');
    expect(errMsg({ message: 'b1' }, 'fb')).toBe('b1');
    expect(errMsg({}, 'fb')).toBe('fb');
    expect(errMsg(null, 'fb')).toBe('fb');
  });
});
