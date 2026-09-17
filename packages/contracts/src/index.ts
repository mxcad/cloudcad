// Infrastructure tokens
export {
  DB, EMAIL, CONFIG, SMS, TOKEN_BLACKLIST,
} from './tokens';

// Business service tokens
export {
  MEMBERSHIP_SERVICE,
  AUTH_TOKEN_SERVICE, USER_SERVICE,
} from './tokens';

// Auth service tokens
export {
  REGISTRATION_SERVICE, PASSWORD_SERVICE,
  ACCOUNT_BINDING_SERVICE, WECHAT_CALLBACK_SERVICE,
  IAUTH_FACADE,
} from './tokens';

// Auth provider tokens
export {
  AUTH_PROVIDER, AUTHENTICATION_HANDLER, OAUTH_HANDLER,
  SMS_AUTH_HANDLER, PASSWORD_RESET_HANDLER,
  ACCOUNT_BINDING_HANDLER, TOKEN_HANDLER,
} from './tokens';

// Auth extension-point tokens
export { USER_SYNC_HOOK } from './tokens';

// Repository tokens
export {
  USER_REPOSITORY, REFRESH_TOKEN_REPOSITORY, ROLE_REPOSITORY,
} from './tokens';

// Infrastructure interfaces
export type { IDatabaseService, ITransactionClient } from './database.interface';
export type { IEmailVerificationService } from './email.interface';
export type { IRuntimeConfigService } from './config.interface';
export type { ISmsVerificationService } from './sms.interface';
export type { ITokenBlacklistService } from './token-blacklist.interface';
export type { IMembershipService, VipTierActivateInput } from './membership.interface';

// Auth interfaces
export type { IAuthTokenService } from './auth/service.interface';
export type { IRegistrationService } from './auth/service.interface';
export type { IPasswordService } from './auth/service.interface';
export type { IAccountBindingService } from './auth/service.interface';
export type { IWechatCallbackService } from './auth/service.interface';
export type { IUserService, IUserRole, ICreatedUser, IUserDetail, IUserActionResponse } from './auth/user-service.interface';
export type { IAuthFacade } from './auth/auth-facade.interface';
export type { IAuthProvider, IAuthenticationHandler, IOAuthHandler, ISmsAuthHandler, IPasswordResetHandler, IAccountBindingHandler, ITokenHandler } from './auth/auth-provider.interface';
export type { IUserSyncHook } from './auth/user-sync.interface';

// Auth types
export type {
  SessionRequest, UserForToken,
  RegisterDto, LoginDto, UserDto, AuthResponseDto,
  WechatLoginUserDto, WechatLoginResponseDto,
  WechatBindResponseDto, WechatUnbindResponseDto,
  WechatAuthUrlResponseDto, WechatPollTransactionResponseDto,
} from './auth/types';

// Domain types
export type { UserRecord, UserRoleRef, RefreshTokenRecord, RoleRecord } from './domain/user.types';

// Domain contracts (values)
export {
  ProjectRole,
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
} from './domain/project-role.types';

// System role contracts (values)
export {
  SystemRole,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLE_LEVELS,
} from './domain/system-role.types';

// Repository interfaces
export type { IUserRepository } from './repositories/user-repository.interface';
export type { IRefreshTokenRepository } from './repositories/refresh-token-repository.interface';
export type { IRoleRepository } from './repositories/role-repository.interface';
