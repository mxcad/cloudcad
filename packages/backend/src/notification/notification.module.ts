import { Module, InternalServerErrorException } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { join } from 'path';
import { AppConfig } from '../config/app.config';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { EmailService } from './email.service';
import { EmailVerificationService } from './email-verification.service';
import { EMAIL_VERIFICATION_SERVICE } from '../common/interfaces/verification.interface';

@Module({
  imports: [
    ConfigModule,
    // SMTP 参数热生效（ADR-0082 #495）：EmailService 发送时经运行时配置
    // 三层解析取参。方向单向（本模块 → RuntimeConfigModule），不成环。
    RuntimeConfigModule,
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService<AppConfig>) => {
        const mailConfig = configService.get('mail', { infer: true });
        if (!mailConfig) {
          throw new InternalServerErrorException('Mail configuration is missing');
        }
        return {
          transport: {
            host: mailConfig.host,
            port: mailConfig.port,
            secure: mailConfig.secure,
            auth: {
              user: mailConfig.user,
              pass: mailConfig.pass,
            },
          },
          defaults: {
            from: mailConfig.from,
          },
          template: {
            dir: join(__dirname, '..', 'assets', 'templates'),
            adapter: new HandlebarsAdapter(),
            options: {
              strict: false,
            },
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [
    EmailService,
    EmailVerificationService,
    {
      provide: EMAIL_VERIFICATION_SERVICE,
      useExisting: EmailVerificationService,
    },
  ],
  exports: [
    EmailService,
    EmailVerificationService,
    EMAIL_VERIFICATION_SERVICE,
  ],
})
export class NotificationModule {}
