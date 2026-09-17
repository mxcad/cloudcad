import { describe, it, expect } from 'vitest';
import {
  isPhone,
  isEmail,
  isCode,
  isContactType,
  getPasswordStrength,
} from './authValidation';

describe('isPhone', () => {
  it('应接受 11 位大陆手机号', () => {
    expect(isPhone('13800138000')).toBe(true);
    expect(isPhone('19900000000')).toBe(true);
  });

  it('应拒绝非法号段、位数与格式', () => {
    expect(isPhone('12345678901')).toBe(false);
    expect(isPhone('1380013800')).toBe(false);
    expect(isPhone('138001380001')).toBe(false);
    expect(isPhone('abcdefghijk')).toBe(false);
    expect(isPhone('')).toBe(false);
  });

  it('应容忍前后空白', () => {
    expect(isPhone('  13800138000  ')).toBe(true);
  });
});

describe('isEmail', () => {
  it('应接受常规邮箱', () => {
    expect(isEmail('a@b.com')).toBe(true);
    expect(isEmail('user.name+tag@sub.example.co')).toBe(true);
  });

  it('应拒绝缺少 @ / 域名 / 多 @ 的输入', () => {
    expect(isEmail('user@')).toBe(false);
    expect(isEmail('@b.com')).toBe(false);
    expect(isEmail('user@b')).toBe(false);
    expect(isEmail('a b@c.com')).toBe(false);
    expect(isEmail('')).toBe(false);
  });
});

describe('isCode', () => {
  it('应只接受 6 位数字', () => {
    expect(isCode('123456')).toBe(true);
    expect(isCode('  123456  ')).toBe(true);
  });

  it('应拒绝非 6 位或含字符', () => {
    expect(isCode('12345')).toBe(false);
    expect(isCode('1234567')).toBe(false);
    expect(isCode('12a456')).toBe(false);
  });
});

describe('isContactType', () => {
  it('应只放行 email / phone', () => {
    expect(isContactType('email')).toBe(true);
    expect(isContactType('phone')).toBe(true);
    expect(isContactType('wechat')).toBe(false);
    expect(isContactType('')).toBe(false);
    expect(isContactType(null)).toBe(false);
    expect(isContactType(undefined)).toBe(false);
  });
});

describe('getPasswordStrength', () => {
  it('空密码返回 0 分与空标签', () => {
    expect(getPasswordStrength('')).toEqual({ score: 0, label: '', color: '' });
  });

  it('长度不足 8 且无数字/特殊字符为 0 分（太弱）', () => {
    const r = getPasswordStrength('ab');
    expect(r.score).toBe(0);
    expect(r.label).toBe('太弱');
  });

  it('长度≥8 且大小写齐全计 2 分', () => {
    const r = getPasswordStrength('Abcdefgh');
    expect(r.score).toBe(2);
    expect(r.label).toBe('一般');
  });

  it('含数字与特殊字符时计满 4 分（很强）', () => {
    const r = getPasswordStrength('Abcdef1!');
    expect(r.score).toBe(4);
    expect(r.label).toBe('很强');
  });

  it('颜色必须走 token 而非硬编码色值', () => {
    expect(getPasswordStrength('1').color).toBe('var(--warning)');
    expect(getPasswordStrength('Abcdefgh').color).toBe('var(--strength-medium)');
    expect(getPasswordStrength('Abcdef1!').color).toBe('var(--strength-strong)');
  });
});
