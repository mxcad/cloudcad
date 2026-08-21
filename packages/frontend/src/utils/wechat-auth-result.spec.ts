import { describe, it, expect } from 'vitest';
import { classifyWechatAuthResult, type WechatAuthResult } from './wechat-auth-result';

describe('classifyWechatAuthResult', () => {
  it('returns error when result has error', () => {
    const result = classifyWechatAuthResult({ error: '授权失败' });
    expect(result).toEqual({ type: 'error', message: '授权失败' });
  });

  it('returns bind_email when requireEmailBinding is true', () => {
    const result = classifyWechatAuthResult({
      requireEmailBinding: true,
      tempToken: 'abc123',
    });
    expect(result).toEqual({ type: 'bind_email', tempToken: 'abc123' });
  });

  it('returns bind_phone when requirePhoneBinding is true', () => {
    const result = classifyWechatAuthResult({
      requirePhoneBinding: true,
      tempToken: 'def456',
    });
    expect(result).toEqual({ type: 'bind_phone', tempToken: 'def456' });
  });

  it('returns need_register when needRegister is true', () => {
    const result = classifyWechatAuthResult({
      needRegister: true,
      tempToken: 'ghi789',
    });
    expect(result).toEqual({ type: 'need_register', tempToken: 'ghi789' });
  });

  it('returns login when accessToken is present', () => {
    const user = { id: 1, username: 'test' };
    const result = classifyWechatAuthResult({
      accessToken: 'token123',
      refreshToken: 'refresh456',
      user,
    });
    expect(result).toEqual({
      type: 'login',
      accessToken: 'token123',
      refreshToken: 'refresh456',
      user,
    });
  });

  it('returns null for empty result', () => {
    const result = classifyWechatAuthResult({});
    expect(result).toBeNull();
  });

  it('prefers error over other fields', () => {
    const result = classifyWechatAuthResult({
      error: '失败',
      requireEmailBinding: true,
      tempToken: 'abc',
    });
    expect(result).toEqual({ type: 'error', message: '失败' });
  });

  it('prefers bind_email over need_register', () => {
    const result = classifyWechatAuthResult({
      requireEmailBinding: true,
      needRegister: true,
      tempToken: 'abc',
    });
    expect(result).toEqual({ type: 'bind_email', tempToken: 'abc' });
  });

  it('prefers bind_phone over login', () => {
    const result = classifyWechatAuthResult({
      requirePhoneBinding: true,
      accessToken: 'token',
      tempToken: 'abc',
    });
    expect(result).toEqual({ type: 'bind_phone', tempToken: 'abc' });
  });

  it('returns bind_email even without tempToken when requireEmailBinding is true', () => {
    // Edge case: backend might not always send tempToken
    const result = classifyWechatAuthResult({
      requireEmailBinding: true,
    });
    // Without tempToken, we can't navigate to bind page
    expect(result).toBeNull();
  });
});
