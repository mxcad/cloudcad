import { describe, it, expect, beforeEach } from 'vitest';
import {
  decodeJwtPayload,
  isAccessTokenExpired,
  setAccessToken,
  removeAccessToken,
} from './tokenUtils';

/**
 * JWT payload 解码回归测试。
 *
 * JWT 标准用 base64url（-/_）编码 payload，而 atob 只认 base64（+/）。
 * 后端 access token 的 payload 含中文用户名时，base64url 段约 1/4 概率含 - 或 _，
 * 原 `atob(segment)` 直接抛 Invalid character → isAccessTokenExpired 恒返回 true
 * （有效 token 被当过期）+ getTokenRemainingMs 返回 null（主动刷新静默失效）。
 * 下列向量的 payload 段均含 -/_（旧实现必失败），钉住 base64url 解码路径。
 */
// 中文用户名 token（payload 段含 base64url 字符 -），exp=2100-01-01（未过期）
const VALID_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.' +
  'eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJlbWFpbCI6InUxMkB4LmNvbSIsInVzZXJuYW1lIjoi5rWL6K-V55So5oi3MTIiLCJyb2xlIjoiVVNFUiIsInR5cGUiOiJhY2Nlc3MiLCJqdGkiOiIzMmY3ZjUxMy1jNGI5LTQwNzctODBhYi0xYjUxOThkMDVmYTgiLCJleHAiOjQxMDI0NDQ4MDB9.' +
  'sig';
// 同 payload 但 exp=2001-09-09（已过期）
const EXPIRED_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.' +
  'eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJlbWFpbCI6InUxMkB4LmNvbSIsInVzZXJuYW1lIjoi5rWL6K-V55So5oi3MTIiLCJyb2xlIjoiVVNFUiIsInR5cGUiOiJhY2Nlc3MiLCJqdGkiOiIzMmY3ZjUxMy1jNGI5LTQwNzctODBhYi0xYjUxOThkMDVmYTgiLCJleHAiOjEwMDAwMDAwMDB9.' +
  'sig';

describe('decodeJwtPayload', () => {
  it('payload 段含 base64url 字符（-）时正确解码中文用户名', () => {
    const segment = VALID_TOKEN.split('.')[1];
    expect(segment).toMatch(/[-_]/); // 保证测试向量有牙齿：旧 atob 必失败
    const payload = decodeJwtPayload(VALID_TOKEN);
    expect(payload).not.toBeNull();
    expect(payload?.username).toBe('测试用户12');
    expect(payload?.exp).toBe(4102444800);
  });

  it('纯 base64（无 -/_）token 仍可解码', () => {
    // 标准 base64 段（无 base64url 字符）
    const payload = decodeJwtPayload('x.' + btoa('{"exp":4102444800}') + '.y');
    expect(payload?.exp).toBe(4102444800);
  });

  it('非法 token 返回 null（不抛异常）', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.!!!invalid!!!.b')).toBeNull();
    expect(decodeJwtPayload('')).toBeNull();
  });
});

describe('isAccessTokenExpired', () => {
  beforeEach(() => {
    removeAccessToken();
  });

  it('含 base64url 字符的有效 token：返回 false（旧实现误判为 true）', () => {
    setAccessToken(VALID_TOKEN);
    expect(isAccessTokenExpired()).toBe(false);
  });

  it('含 base64url 字符的已过期 token：返回 true', () => {
    setAccessToken(EXPIRED_TOKEN);
    expect(isAccessTokenExpired()).toBe(true);
  });

  it('无 token：返回 true', () => {
    expect(isAccessTokenExpired()).toBe(true);
  });
});
