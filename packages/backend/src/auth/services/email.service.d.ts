import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { AppConfig } from '../../config/app.config';
export declare class EmailService {
    private readonly mailerService;
    private readonly configService;
    constructor(mailerService: MailerService, configService: ConfigService<AppConfig>);
    sendVerificationEmail(email: string, token: string): Promise<void>;
    sendPasswordResetEmail(email: string, token: string): Promise<void>;
}
//# sourceMappingURL=email.service.d.ts.map