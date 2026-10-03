import { describe, expect, it } from 'vitest';
import { resolveSupportContact } from './supportContact';

describe('resolveSupportContact', () => {
  it('未传参数与空配置都不产出联系方式，configured 为 false', () => {
    expect(resolveSupportContact()).toEqual({ email: '', phone: '', configured: false });
    expect(resolveSupportContact({ supportEmail: '', supportPhone: '' })).toEqual({
      email: '',
      phone: '',
      configured: false,
    });
  });

  it('只配一项时另一项为空串，configured 仍为 true', () => {
    expect(resolveSupportContact({ supportEmail: 'cs@mx.com' })).toEqual({
      email: 'cs@mx.com',
      phone: '',
      configured: true,
    });
    expect(resolveSupportContact({ supportPhone: '400-000-0000' })).toEqual({
      email: '',
      phone: '400-000-0000',
      configured: true,
    });
  });

  it('首尾空白被裁掉；纯空白视为未配置', () => {
    expect(resolveSupportContact({ supportEmail: '  cs@mx.com  ', supportPhone: '   ' })).toEqual({
      email: 'cs@mx.com',
      phone: '',
      configured: true,
    });
    expect(resolveSupportContact({ supportEmail: '   ', supportPhone: '\t' }).configured).toBe(
      false,
    );
  });

  it('非字符串（脏数据）按空处理，不抛错', () => {
    expect(
      resolveSupportContact({ supportEmail: 123 as never, supportPhone: null as never }),
    ).toEqual({ email: '', phone: '', configured: false });
  });
});
