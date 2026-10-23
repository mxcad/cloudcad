///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import nodemailer from 'nodemailer';
import { MailChannelTestAction } from './mail-channel-test-action';
import {
  CHANNEL_TEST_REQUEST_TIMEOUT_MS,
  type ChannelTestContext,
} from './runtime-config.types';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const createTransportMock = jest.mocked(nodemailer.createTransport);

describe('MailChannelTestAction（ADR-0082 #495）', () => {
  const action = new MailChannelTestAction();

  const verifyMock = jest.fn();
  const sendMailMock = jest.fn();
  const closeMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    closeMock.mockResolvedValue(undefined);
    createTransportMock.mockReturnValue({
      verify: verifyMock,
      sendMail: sendMailMock,
      close: closeMock,
    } as never);
  });

  const makeCtx = (
    overrides: Record<string, unknown> = {},
    recipient?: string
  ): ChannelTestContext => {
    const values: Record<string, unknown> = {
      smtpHost: 'smtp.test.com',
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: 'user@test',
      smtpPassword: 'smtp-pass',
      smtpFrom: 'CloudCAD <noreply@test.com>',
      ...overrides,
    };
    return {
      getValue: <T>(key: string) => Promise.resolve(values[key] as T),
      recipient,
    };
  };

  describe('验证（未指定收件人）', () => {
    it('只做连接与认证验证（verify），不发送任何邮件', async () => {
      verifyMock.mockResolvedValue(undefined);

      const result = await action.test(makeCtx());

      expect(result.ok).toBe(true);
      expect(result.message).toContain('未发送邮件');
      // 无副作用探测 → 结论强度为 probe，不足以作为「已端到端验证」的证据
      expect(result.verdict).toBe('probe');
      expect(createTransportMock).toHaveBeenCalledWith({
        host: 'smtp.test.com',
        port: 465,
        secure: true,
        auth: { user: 'user@test', pass: 'smtp-pass' },
        socketTimeout: CHANNEL_TEST_REQUEST_TIMEOUT_MS,
      });
      expect(verifyMock).toHaveBeenCalled();
      expect(sendMailMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalled();
    });

    it('空白收件人视同未指定（只验证不发送）', async () => {
      verifyMock.mockResolvedValue(undefined);

      const result = await action.test(makeCtx({}, '   '));

      expect(result.ok).toBe(true);
      expect(verifyMock).toHaveBeenCalled();
      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('不回落客服邮箱：supportEmail 空或缺失都不影响验证', async () => {
      verifyMock.mockResolvedValue(undefined);

      const result = await action.test(makeCtx({ supportEmail: '' }));

      expect(result.ok).toBe(true);
      expect(verifyMock).toHaveBeenCalled();
      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('认证失败（EAUTH）→ 失败并归因账号/口令配置键，transport 仍被关闭', async () => {
      const error = new Error('Invalid login') as Error & { code?: string };
      error.code = 'EAUTH';
      verifyMock.mockRejectedValue(error);

      const result = await action.test(makeCtx());

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Invalid login');
      expect(result.message).toContain('SMTP 验证失败');
      expect(result.problemKeys).toEqual(['smtpUser', 'smtpPassword']);
      expect(closeMock).toHaveBeenCalled();
    });

    it('主机不可达（ENOTFOUND）→ 失败并归因主机/端口配置键', async () => {
      const error = new Error(
        'getaddrinfo ENOTFOUND smtp.test.com'
      ) as Error & { code?: string };
      error.code = 'ENOTFOUND';
      verifyMock.mockRejectedValue(error);

      const result = await action.test(makeCtx());

      expect(result.ok).toBe(false);
      expect(result.problemKeys).toEqual(['smtpHost', 'smtpPort']);
    });
  });

  describe('发送（指定收件人）', () => {
    it('向指定收件人发测试信，一次性 transport 发送后关闭', async () => {
      sendMailMock.mockResolvedValue({ messageId: 'm-1' });

      const result = await action.test(makeCtx({}, 'admin@test.com'));

      expect(result.ok).toBe(true);
      expect(result.message).toContain('admin@test.com');
      // 真实发信成功 → 端到端结论强度
      expect(result.verdict).toBe('end-to-end');
      expect(verifyMock).not.toHaveBeenCalled();
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'CloudCAD <noreply@test.com>',
          to: 'admin@test.com',
        })
      );
      expect(closeMock).toHaveBeenCalled();
    });

    it('发送失败（无法归因）→ 失败且不带 problemKeys', async () => {
      sendMailMock.mockRejectedValue(new Error('socket hang up'));

      const result = await action.test(makeCtx({}, 'admin@test.com'));

      expect(result.ok).toBe(false);
      expect(result.message).toContain('测试邮件发送失败');
      expect(result.problemKeys).toEqual([]);
      expect(closeMock).toHaveBeenCalled();
    });
  });
});
