///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException } from '@nestjs/common';
import { WechatVerificationStrategy } from './wechat-verification.strategy';
import {
  WECHAT_VERIFICATION_SERVICE,
  IWechatService,
} from '../../common/interfaces/verification.interface';
import type { UserVerificationData } from '../interfaces/account-verification-strategy.interface';

describe('WechatVerificationStrategy', () => {
  const mockWechatService: IWechatService = {
    getAccessToken: jest.fn(),
  };

  const strategy = new WechatVerificationStrategy(mockWechatService);

  const user: UserVerificationData = {
    wechatId: 'openid-of-bound-wechat',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('type 为 wechatCode，仅处理携带微信授权 code 的请求', () => {
    expect(strategy.type).toBe('wechatCode');
    expect(strategy.canHandle({ wechatCode: 'wx-code' })).toBe(true);
    // 旧版 wechatConfirm 布尔确认已从 VerificationParams 移除，不再被接受
    expect(strategy.canHandle({} as { wechatCode?: string })).toBe(false);
    expect(strategy.canHandle({})).toBe(false);
  });

  it('validateUser：仅账户绑定微信时通过', () => {
    expect(strategy.validateUser(user)).toBe(true);
    expect(strategy.validateUser({ wechatId: null })).toBe(false);
  });

  it('授权 openid 与账户绑定一致时验证通过', async () => {
    mockWechatService.getAccessToken = jest
      .fn()
      .mockResolvedValue({ openid: 'openid-of-bound-wechat' });

    const result = await strategy.verify(user, { wechatCode: 'wx-code' });
    expect(result).toEqual({ valid: true });
    expect(mockWechatService.getAccessToken).toHaveBeenCalledWith('wx-code');
  });

  it('授权 openid 与账户绑定不一致时验证失败', async () => {
    mockWechatService.getAccessToken = jest
      .fn()
      .mockResolvedValue({ openid: 'openid-of-other-wechat' });

    const result = await strategy.verify(user, { wechatCode: 'wx-code' });
    expect(result.valid).toBe(false);
  });

  it('授权响应缺少 openid（微信 errcode）时验证失败', async () => {
    mockWechatService.getAccessToken = jest
      .fn()
      .mockResolvedValue({ errcode: 40029, errmsg: 'invalid code' });

    const result = await strategy.verify(user, { wechatCode: 'bad-code' });
    expect(result.valid).toBe(false);
  });

  it('微信服务异常时抛出 400（业务校验失败，避免 401 触发前端凭证失效登出）', async () => {
    mockWechatService.getAccessToken = jest
      .fn()
      .mockRejectedValue(new Error('wechat api down'));

    await expect(
      strategy.verify(user, { wechatCode: 'wx-code' })
    ).rejects.toThrow(BadRequestException);
  });

  it('不再接受 wechatConfirm 布尔确认（防止旧前端绕过验证）', () => {
    mockWechatService.getAccessToken = jest.fn();
    // canHandle 只认 wechatCode，旧版 wechatConfirm 布尔确认字段已移除
    expect(strategy.canHandle({})).toBe(false);
    expect(strategy.canHandle({ wechatCode: '' })).toBe(false);
    expect(mockWechatService.getAccessToken).not.toHaveBeenCalled();
  });
});
