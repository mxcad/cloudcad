import { Provider } from '@nestjs/common';
import { RegistrationService } from './services/registration.service';
import { LoginService } from './services/login.service';
import { PasswordService } from './services/password.service';
import { AccountBindingService } from './services/account-binding.service';
import { AuthTokenService } from './services/auth-token.service';
import { WechatService } from './services/wechat.service';
import { WechatTransactionService } from './services/wechat-transaction.service';
import { WechatCallbackService } from './services/wechat-callback.service';
import { OssAuthProvider } from './providers/local-auth.provider';

import { UserRepository } from './repositories/user-repository';
import { RefreshTokenRepository } from './repositories/refresh-token-repository';
import { RoleRepository } from './repositories/role-repository';
import {
  USER_REPOSITORY, REFRESH_TOKEN_REPOSITORY, ROLE_REPOSITORY,
  REGISTRATION_SERVICE, PASSWORD_SERVICE,
  ACCOUNT_BINDING_SERVICE, AUTH_TOKEN_SERVICE,
  WECHAT_CALLBACK_SERVICE,
  AUTH_PROVIDER, AUTHENTICATION_HANDLER, OAUTH_HANDLER,
  SMS_AUTH_HANDLER, PASSWORD_RESET_HANDLER,
  ACCOUNT_BINDING_HANDLER, TOKEN_HANDLER,
} from '@cloudcad/contracts';

export function createDefaultAuthProviders(): Provider[] {
  return [
    RegistrationService,
    LoginService,
    PasswordService,
    AccountBindingService,
    AuthTokenService,
    WechatService,
    WechatTransactionService,
    WechatCallbackService,
    OssAuthProvider,
    UserRepository,
    RefreshTokenRepository,
    RoleRepository,

    { provide: REGISTRATION_SERVICE, useExisting: RegistrationService },
    { provide: PASSWORD_SERVICE, useExisting: PasswordService },
    { provide: ACCOUNT_BINDING_SERVICE, useExisting: AccountBindingService },
    { provide: AUTH_TOKEN_SERVICE, useExisting: AuthTokenService },
    { provide: WECHAT_CALLBACK_SERVICE, useExisting: WechatCallbackService },
    { provide: AUTH_PROVIDER, useExisting: OssAuthProvider },
    { provide: AUTHENTICATION_HANDLER, useExisting: OssAuthProvider },
    { provide: OAUTH_HANDLER, useExisting: OssAuthProvider },
    { provide: SMS_AUTH_HANDLER, useExisting: OssAuthProvider },
    { provide: ACCOUNT_BINDING_HANDLER, useExisting: OssAuthProvider },
    { provide: TOKEN_HANDLER, useExisting: OssAuthProvider },
    { provide: PASSWORD_RESET_HANDLER, useExisting: OssAuthProvider },
    { provide: USER_REPOSITORY, useExisting: UserRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useExisting: RefreshTokenRepository },
    { provide: ROLE_REPOSITORY, useExisting: RoleRepository },
  ];
}
