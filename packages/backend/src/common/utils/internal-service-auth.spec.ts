///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import {
  internalServiceSecretHeader,
  isInternalServiceSecretValid,
  INTERNAL_SERVICE_SECRET_HEADER,
} from './internal-service-auth';

describe('internalServiceSecretHeader', () => {
  it('secret 非空时返回带 X-Internal-Service-Secret 头的对象', () => {
    const headers = internalServiceSecretHeader('s3cret');
    expect(headers).toEqual({ [INTERNAL_SERVICE_SECRET_HEADER]: 's3cret' });
  });

  it('secret 为 undefined/null/空串/纯空白时返回空对象（不带头）', () => {
    expect(internalServiceSecretHeader(undefined)).toEqual({});
    expect(internalServiceSecretHeader(null)).toEqual({});
    expect(internalServiceSecretHeader('')).toEqual({});
    expect(internalServiceSecretHeader('   ')).toEqual({});
  });

  it('运行期防御：非 string 入参（如 mock 返回 {}）返回空对象而非抛错', () => {
    // ConfigService.get 在部分 mock 场景返回非 string（如 {}），helper 须稳健降级
    expect(internalServiceSecretHeader({} as never)).toEqual({});
    expect(internalServiceSecretHeader(123 as never)).toEqual({});
  });
});

describe('isInternalServiceSecretValid（#421 入站校验，fail-close）', () => {
  it('provided 与 secret 一致时返回 true', () => {
    expect(isInternalServiceSecretValid('s3cret', 's3cret')).toBe(true);
  });

  it('provided 与 secret 不一致时返回 false', () => {
    expect(isInternalServiceSecretValid('wrong', 's3cret')).toBe(false);
  });

  it('服务端 secret 未配置（undefined/null/空串/纯空白）时 fail-close 返回 false', () => {
    expect(isInternalServiceSecretValid('s3cret', undefined)).toBe(false);
    expect(isInternalServiceSecretValid('s3cret', null)).toBe(false);
    expect(isInternalServiceSecretValid('s3cret', '')).toBe(false);
    expect(isInternalServiceSecretValid('s3cret', '   ')).toBe(false);
  });

  it('服务端 secret 为非 string（如 mock 返回 {}）时 fail-close 返回 false 而非抛错', () => {
    expect(isInternalServiceSecretValid('s3cret', {} as never)).toBe(false);
    expect(isInternalServiceSecretValid('s3cret', 123 as never)).toBe(false);
  });

  it('provided 缺失/非 string/空串时返回 false', () => {
    expect(isInternalServiceSecretValid(undefined, 's3cret')).toBe(false);
    expect(isInternalServiceSecretValid(null, 's3cret')).toBe(false);
    expect(isInternalServiceSecretValid('', 's3cret')).toBe(false);
    expect(isInternalServiceSecretValid(123 as never, 's3cret')).toBe(false);
  });
});
