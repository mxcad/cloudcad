import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { LoginDto, RegisterDto, AuthResponseDto, UserDto } from '../dto/auth.dto';
import { WechatLoginResponseDto } from '../dto/wechat.dto';
import { SmsVerificationService } from '../services/sms';
import { WechatService } from '../services/wechat.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { IUserService } from '../../common/interfaces/user-service.interface';
import { RegistrationService } from '../services/registration.service';
import { LoginService } from '../services/login.service';
import { AuthTokenService } from '../services/auth-token.service';
import { SessionRequest } from '../interfaces/jwt-payload.interface';
import { IAuthProvider } from '../interfaces/auth-provider.interface';
export declare class LocalAuthProvider implements IAuthProvider {
    private prisma;
    private jwtService;
    private configService;
    private smsVerificationService;
    private wechatService;
    private runtimeConfigService;
    private readonly userService;
    private registrationService;
    private loginService;
    private authTokenService;
    private readonly logger;
    constructor(prisma: DatabaseService, jwtService: JwtService, configService: ConfigService, smsVerificationService: SmsVerificationService, wechatService: WechatService, runtimeConfigService: RuntimeConfigService, userService: IUserService, registrationService: RegistrationService, loginService: LoginService, authTokenService: AuthTokenService);
    login(credentials: LoginDto, req?: SessionRequest): Promise<AuthResponseDto>;
    loginByPhone(phone: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
    loginByWechat(code: string, state: string): Promise<WechatLoginResponseDto>;
    register(data: RegisterDto, req?: SessionRequest): Promise<AuthResponseDto>;
    refreshToken(token: string): Promise<AuthResponseDto>;
    getUserInfo(userId: string): Promise<UserDto>;
}
//# sourceMappingURL=local-auth.provider.d.ts.map