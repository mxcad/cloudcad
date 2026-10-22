///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { AppConfig } from '../config/app.config';
import { EmailService } from './email.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';

describe('EmailService SMTP 热生效（ADR-0082 #495）', () => {
  let sendMailMock: jest.Mock;
  let addTransporterMock: jest.Mock;
  let removeTransporterMock: jest.Mock;
  let getValueMock: jest.Mock;
  let service: EmailService;

  const makeSmtpValues = () => ({
    smtpHost: 'smtp.test.com',
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: 'user@test',
    smtpPassword: 'smtp-pass',
    smtpFrom: 'CloudCAD <noreply@test.com>',
  });
  // let + 每例重置：「热生效」用例会改配置，避免污染后续用例
  let smtpValues: Record<string, unknown>;

  beforeEach(() => {
    smtpValues = makeSmtpValues();
    sendMailMock = jest.fn().mockResolvedValue({ messageId: 'm-1' });
    addTransporterMock = jest.fn();
    removeTransporterMock = jest.fn().mockReturnValue(true);
    getValueMock = jest.fn((key: string) =>
      Promise.resolve(smtpValues[key])
    );

    service = new EmailService(
      {
        sendMail: sendMailMock,
        addTransporter: addTransporterMock,
        removeTransporter: removeTransporterMock,
      } as unknown as MailerService,
      {
        get: jest.fn().mockReturnValue('http://localhost:8000'),
      } as unknown as ConfigService<AppConfig>,
      { getValue: getValueMock } as unknown as RuntimeConfigService
    );
  });

  const alertInput = {
    kind: 'raised' as const,
    level: 'P0',
    source: 'test',
    messageKey: 'test.key',
    message: '测试消息',
    time: new Date('2026-10-22T08:00:00Z'),
  };

  it('首次发送：三层解析 SMTP 参数建命名 transporter，发送走该命名 transporter 并带显式 from', async () => {
    await service.sendAlertEmail(['a@test.com'], alertInput);

    expect(addTransporterMock).toHaveBeenCalledWith('mail', {
      host: 'smtp.test.com',
      port: 465,
      secure: true,
      auth: { user: 'user@test', pass: 'smtp-pass' },
    });
    const call = sendMailMock.mock.calls[0][0];
    expect(call.transporterName).toBe('mail');
    expect(call.from).toBe('CloudCAD <noreply@test.com>');
    expect(call.to).toBe('a@test.com');
  });

  it('配置指纹不变时不重建 transporter（每次发送重新解析以感知变更，但只在指纹变化时重建）', async () => {
    await service.sendAlertEmail(['a@test.com'], alertInput);
    await service.sendAlertEmail(['a@test.com'], alertInput);

    expect(addTransporterMock).toHaveBeenCalledTimes(1);
    // removeTransporter 对不存在的命名 transport 是幂等 no-op（首次构建也会调）
    expect(removeTransporterMock).toHaveBeenCalledTimes(1);
    // 每次发送都重新三层解析（检测配置变更的代价），6 键 × 2 次
    expect(getValueMock).toHaveBeenCalledTimes(12);
  });

  it('SMTP 配置变化 → 下一次发送重建 transporter 并立即用新配置（热生效，无需重启）', async () => {
    await service.sendAlertEmail(['a@test.com'], alertInput);

    smtpValues.smtpHost = 'smtp.new.com';
    smtpValues.smtpFrom = 'New <new@test.com>';

    await service.sendAlertEmail(['a@test.com'], alertInput);

    expect(removeTransporterMock).toHaveBeenCalledWith('mail');
    expect(addTransporterMock).toHaveBeenLastCalledWith('mail', {
      host: 'smtp.new.com',
      port: 465,
      secure: true,
      auth: { user: 'user@test', pass: 'smtp-pass' },
    });
    const call = sendMailMock.mock.calls[1][0];
    expect(call.from).toBe('New <new@test.com>');
  });

  it('验证码邮件模板 context 的 supportEmail 用当前生效发件人', async () => {
    await service.sendVerificationEmail('u@test.com', 'token-1');

    const call = sendMailMock.mock.calls[0][0];
    expect(call.template).toBe('email-verification');
    expect(call.context.supportEmail).toBe('CloudCAD <noreply@test.com>');
    expect(call.context.token).toBe('token-1');
  });
});
