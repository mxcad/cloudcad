import { describe, it, expect } from 'vitest';
import { isWechatBindConflict } from './useWechatBind';

describe('isWechatBindConflict', () => {
  it('后端 409 包装（code=CONFLICT）识别为绑定冲突', () => {
    expect(
      isWechatBindConflict({
        code: 'CONFLICT',
        message: '该微信已绑定其他账号',
      })
    ).toBe(true);
  });

  it('其他错误码不是绑定冲突', () => {
    expect(isWechatBindConflict({ code: 'BAD_REQUEST' })).toBe(false);
    expect(isWechatBindConflict({ code: 'INTERNAL_SERVER_ERROR' })).toBe(
      false
    );
    expect(isWechatBindConflict({ message: '该微信已绑定其他账号' })).toBe(
      false
    );
  });

  it('非对象入参返回 false', () => {
    expect(isWechatBindConflict('CONFLICT')).toBe(false);
    expect(isWechatBindConflict(null)).toBe(false);
    expect(isWechatBindConflict(undefined)).toBe(false);
    expect(isWechatBindConflict(409)).toBe(false);
  });
});
