import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { EmailService } from './email.service';

describe('EmailService', () => {
  let service: EmailService;
  let mailerService: jest.Mocked<MailerService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockMailerService = {
      sendMail: jest.fn(),
    } as any;

    const mockConfigService = {
      get: jest.fn((key: string) => {
        const configs: Record<string, string> = {
          FRONTEND_URL: 'http://localhost:3000',
          MAIL_FROM: 'noreply@cloudcad.com',
        };
        return configs[key];
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: MailerService,
          useValue: mockMailerService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    })
    .setLogger({
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    })
    .compile();

    service = module.get<EmailService>(EmailService);
    mailerService = module.get(MailerService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendVerificationEmail', () => {
    it('should send verification email successfully', async () => {
      const email = 'test@example.com';
      const token = '123456';
      mailerService.sendMail.mockResolvedValue(undefined as any);

      await service.sendVerificationEmail(email, token);

      expect(mailerService.sendMail).toHaveBeenCalledWith({
        to: email,
        subject: 'CloudCAD - 验证码',
        template: 'email-verification',
        context: {
          token,
          baseUrl: 'http://localhost:3000',
          expiresIn: '15分钟',
          supportEmail: 'noreply@cloudcad.com',
          productName: 'CloudCAD',
        },
      });
    });

    it('should throw error when mailer service fails', async () => {
      const email = 'test@example.com';
      const token = '123456';
      const error = new Error('Mailer service error');
      mailerService.sendMail.mockRejectedValue(error);

      await expect(
        service.sendVerificationEmail(email, token)
      ).rejects.toThrow('Mailer service error');
    });

    it('should use correct configuration values', async () => {
      const email = 'test@example.com';
      const token = '123456';
      mailerService.sendMail.mockResolvedValue(undefined as any);

      await service.sendVerificationEmail(email, token);

      expect(configService.get).toHaveBeenCalledWith('FRONTEND_URL');
      expect(configService.get).toHaveBeenCalledWith('MAIL_FROM');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email successfully', async () => {
      const email = 'test@example.com';
      const token = 'reset-token-123';
      mailerService.sendMail.mockResolvedValue(undefined as any);

      await service.sendPasswordResetEmail(email, token);

      expect(mailerService.sendMail).toHaveBeenCalledWith({
        to: email,
        subject: 'CloudCAD - 密码重置',
        template: 'password-reset',
        context: {
          resetLink: `http://localhost:3000/reset-password?token=${token}`,
          expiresIn: '30分钟',
          supportEmail: 'noreply@cloudcad.com',
          productName: 'CloudCAD',
        },
      });
    });

    it('should construct correct reset link', async () => {
      const email = 'test@example.com';
      const token = 'reset-token-123';
      mailerService.sendMail.mockResolvedValue(undefined as any);

      await service.sendPasswordResetEmail(email, token);

      const callArgs = mailerService.sendMail.mock.calls[0][0];
      expect(callArgs.context.resetLink).toBe(
        'http://localhost:3000/reset-password?token=reset-token-123'
      );
    });

    it('should throw error when mailer service fails', async () => {
      const email = 'test@example.com';
      const token = 'reset-token-123';
      const error = new Error('Mailer service error');
      mailerService.sendMail.mockRejectedValue(error);

      await expect(
        service.sendPasswordResetEmail(email, token)
      ).rejects.toThrow('Mailer service error');
    });
  });
});
