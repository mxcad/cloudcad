import { describe, it, expect } from 'vitest';
import { scorePasswordStrength } from '@cloudcad/platform';
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

describe('getPasswordStrength（阈值取生效策略）', () => {
  const SECURE = { minLength: 10, minCategories: 3 };
  const NORMAL = { minLength: 6, minCategories: 0 };

  it('空密码返回 0 分与空标签', () => {
    expect(getPasswordStrength('', SECURE)).toEqual({
      score: 0,
      label: '',
      color: '',
    });
  });

  it('未达标显示太弱', () => {
    const r = getPasswordStrength('ab', SECURE);
    expect(r.score).toBe(0);
    expect(r.label).toBe('太弱');
  });

  it('恰好合规显示「一般」，不会被标成太弱/较弱', () => {
    const r = getPasswordStrength('Abcdef1234', SECURE);
    expect(r.score).toBe(2);
    expect(r.label).toBe('一般');
  });

  it('达标且长度有余量、四类全含时计满 4 分（很强）', () => {
    const r = getPasswordStrength('Abcdefgh12!x', SECURE);
    expect(r.score).toBe(4);
    expect(r.label).toBe('很强');
  });

  it('强弱随策略相对变化：6 位纯小写在 normal 合规、在 secure 太弱', () => {
    expect(getPasswordStrength('aaaaaa', SECURE).score).toBeLessThanOrEqual(1);
    expect(getPasswordStrength('aaaaaa', NORMAL)).toEqual({
      score: 2,
      label: '一般',
      color: 'var(--strength-medium)',
    });
  });

  it('颜色必须走 token 而非硬编码色值', () => {
    expect(getPasswordStrength('ab', SECURE).color).toBe('var(--danger)');
    expect(getPasswordStrength('Abcdef1234', SECURE).color).toBe(
      'var(--strength-medium)',
    );
    expect(getPasswordStrength('Abcdefgh12!x', SECURE).color).toBe(
      'var(--strength-strong)',
    );
  });
});

// 评分纯函数（@cloudcad/platform，PC/移动端共用）——锁 0-4 打分契约
describe('scorePasswordStrength (platform)', () => {
  it('空密码 0 分', () => {
    expect(scorePasswordStrength('')).toBe(0);
  });

  it('缺省回落 secure 基线（10/3）：四项各 1 分', () => {
    expect(scorePasswordStrength('Abcdefgh12!x')).toBe(4); // 达标 + 余量 + 四类全含
    expect(scorePasswordStrength('Abcdef1234')).toBe(2); // 恰好合规
    expect(scorePasswordStrength('Abcdefgh1')).toBe(1); // 三类齐但仅 9 位
    expect(scorePasswordStrength('ab')).toBe(0);
  });

  it('阈值随生效策略变化，不写死 8 位', () => {
    expect(scorePasswordStrength('aaaaaa', { minLength: 6, minCategories: 0 })).toBe(2);
    expect(scorePasswordStrength('aaaaaa', { minLength: 10, minCategories: 3 })).toBe(0);
  });
});
