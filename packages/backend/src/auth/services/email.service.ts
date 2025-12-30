import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class EmailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService
  ) {}

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const baseUrl = this.configService.get('FRONTEND_URL');
    await this.mailerService.sendMail({
      to: email,
      subject: 'CloudCAD - 验证码',
      template: 'email-verification',
      context: {
        token, // 6位数字验证码
        baseUrl, // 前端验证页面地址
        expiresIn: '15分钟',
        supportEmail: this.configService.get('MAIL_FROM'),
        productName: 'CloudCAD',
      },
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetLink = `${this.configService.get('FRONTEND_URL')}/reset-password?token=${token}`;

    await this.mailerService.sendMail({
      to: email,
      subject: 'CloudCAD - 密码重置',
      template: 'password-reset',
      context: {
        resetLink,
        expiresIn: '30分钟',
        supportEmail: this.configService.get('MAIL_FROM'),
        productName: 'CloudCAD',
      },
    });
  }
}
