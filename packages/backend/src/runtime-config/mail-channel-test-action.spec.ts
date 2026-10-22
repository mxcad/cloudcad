///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import nodemailer from 'nodemailer';
import { MailChannelTestAction } from './mail-channel-test-action';
import type { ChannelTestContext } from './runtime-config.types';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const createTransportMock = jest.mocked(nodemailer.createTransport);

describe('MailChannelTestAction（ADR-0082 #495）', () => {
  const action = new MailChannelTestAction();

  const sendMailMock = jest.fn();
  const closeMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    closeMock.mockResolvedValue(undefined);
    createTransportMock.mockReturnValue({
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
      supportEmail: 'support@test.com',
      ...overrides,
    };
    return {
      getValue: <T>(key: string) => Promise.resolve(values[key] as T),
      recipient,
    };
  };

  it('向指定收件人发测试信，一次性 transport 发送后关闭', async () => {
    sendMailMock.mockResolvedValue({ messageId: 'm-1' });

    const result = await action.test(makeCtx({}, 'admin@test.com'));

    expect(result.ok).toBe(true);
    expect(result.message).toContain('admin@test.com');
    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.test.com',
      port: 465,
      secure: true,
      auth: { user: 'user@test', pass: 'smtp-pass' },
    });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'CloudCAD <noreply@test.com>',
        to: 'admin@test.com',
      })
    );
    expect(closeMock).toHaveBeenCalled();
  });

  it('未指定收件人时回落客服邮箱（supportEmail）配置值', async () => {
    sendMailMock.mockResolvedValue({ messageId: 'm-2' });

    const result = await action.test(makeCtx());

    expect(result.ok).toBe(true);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'support@test.com' })
    );
  });

  it('未指定收件人且客服邮箱为空 → 失败，不建 transport、不发信', async () => {
    const result = await action.test(makeCtx({ supportEmail: '' }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('supportEmail');
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('SMTP 服务器拒绝（sendMail 抛错）→ 异常上抛由 ChannelTestService 归一为失败，transport 仍被关闭', async () => {
    sendMailMock.mockRejectedValue(new Error('Invalid login'));

    await expect(action.test(makeCtx())).rejects.toThrow('Invalid login');
    expect(closeMock).toHaveBeenCalled();
  });
});
