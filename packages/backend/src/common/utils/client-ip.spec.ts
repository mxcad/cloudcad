/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
/////////////////////////////////////////////////////////////////////////////

import {
  getAdminClientIp,
  getClientIp,
  sanitizeTrustedProxies,
} from './client-ip';

type IpReq = {
  headers?: Record<string, unknown>;
  connection?: { remoteAddress?: string };
  socket?: { remoteAddress?: string };
};

function makeReq(socketIp: string, headers?: Record<string, unknown>): IpReq {
  return { socket: { remoteAddress: socketIp }, headers };
}

describe('getClientIp（黑名单/限流场景，fail-open，信任 XFF 最左）', () => {
  it('优先取 X-Forwarded-For 首个地址（代理形态）', () => {
    const req = makeReq('10.0.0.1', {
      'x-forwarded-for': '203.0.113.5, 10.0.0.1',
    });
    expect(getClientIp(req)).toBe('203.0.113.5');
  });

  it('无头部时回退 socket 真实地址', () => {
    expect(getClientIp(makeReq('203.0.113.9'))).toBe('203.0.113.9');
  });
});

describe('getAdminClientIp（管理员白名单安全判定，防 XFF 伪造）', () => {
  const trusted = ['127.0.0.1', '::1', '10.0.0.0/8'];

  it('直连客户端：伪造 XFF 不影响判定，返回真实 socket IP', () => {
    // 客户端直接连服务器，socket 是真实公网 IP；即使伪造 XFF 头，白名单判定用真实 IP
    const req = makeReq('203.0.113.7', {
      'x-forwarded-for': '127.0.0.1',
    });
    expect(getAdminClientIp(req, trusted)).toBe('203.0.113.7');
  });

  it('直连客户端且伪造可信代理 IP，仍不信任 XFF（socket 非可信段）', () => {
    // 攻击者 socket=203.0.113.7（非可信代理段），伪造 XFF=1.2.3.4 尝试冒充白名单 IP
    const req = makeReq('203.0.113.7', {
      'x-forwarded-for': '1.2.3.4',
    });
    // 返回真实 socket（203.0.113.7），伪造的 1.2.3.4 被忽略
    expect(getAdminClientIp(req, trusted)).toBe('203.0.113.7');
  });

  it('经可信代理（本机反代）：信任 XFF 最右侧（代理追加的真实客户端 IP）', () => {
    // socket=127.0.0.1 命中可信段 → 取 XFF 最右项 198.51.100.8（代理写入，可信）
    const req = makeReq('127.0.0.1', {
      'x-forwarded-for': '203.0.113.7, 198.51.100.8',
    });
    expect(getAdminClientIp(req, trusted)).toBe('198.51.100.8');
  });

  it('经可信代理但无 XFF：回退真实对端（本机反代 IP）', () => {
    const req = makeReq('127.0.0.1', {});
    expect(getAdminClientIp(req, trusted)).toBe('127.0.0.1');
  });

  it('经可信 CIDR 代理段命中：信任 XFF 最右项', () => {
    // socket=10.0.0.5 命中 10.0.0.0/8
    const req = makeReq('10.0.0.5', {
      'x-forwarded-for': '203.0.113.7, 198.51.100.9',
    });
    expect(getAdminClientIp(req, trusted)).toBe('198.51.100.9');
  });

  it('IPv6 可信代理（::1）：信任 XFF 最右项', () => {
    const req = makeReq('::1', {
      'x-forwarded-for': '203.0.113.7, 198.51.100.10',
    });
    expect(getAdminClientIp(req, trusted)).toBe('198.51.100.10');
  });

  it('socket 缺失时返回 unknown', () => {
    expect(getAdminClientIp({ headers: {} }, trusted)).toBe('unknown');
  });
});

describe('sanitizeTrustedProxies', () => {
  it('过滤非法项并去重', () => {
    expect(
      sanitizeTrustedProxies(['127.0.0.1', '10.0.0.0/8', 'not-an-ip', '127.0.0.1'])
    ).toEqual(['127.0.0.1', '10.0.0.0/8']);
  });
});
