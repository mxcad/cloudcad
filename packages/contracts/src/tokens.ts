// Infrastructure tokens
export const DB = 'DB';
export const EMAIL = 'EMAIL';
export const CONFIG = 'CONFIG';
export const SMS = 'SMS';
export const TOKEN_BLACKLIST = 'TOKEN_BLACKLIST';

// Business service tokens
export const MEMBERSHIP_SERVICE = 'MEMBERSHIP_SERVICE';
export const AUTH_TOKEN_SERVICE = 'AUTH_TOKEN_SERVICE';
export const USER_SERVICE = 'USER_SERVICE';

// Auth service tokens
export const REGISTRATION_SERVICE = 'REGISTRATION_SERVICE';
export const PASSWORD_SERVICE = 'PASSWORD_SERVICE';
export const ACCOUNT_BINDING_SERVICE = 'ACCOUNT_BINDING_SERVICE';
export const WECHAT_CALLBACK_SERVICE = 'WECHAT_CALLBACK_SERVICE';
export const IAUTH_FACADE = 'IAuthFacade';

// Auth provider tokens
export const AUTH_PROVIDER = 'IAuthProvider';
export const AUTHENTICATION_HANDLER = 'IAuthenticationHandler';
export const OAUTH_HANDLER = 'IOAuthHandler';
export const SMS_AUTH_HANDLER = 'ISmsAuthHandler';
export const PASSWORD_RESET_HANDLER = 'IPasswordResetHandler';
export const ACCOUNT_BINDING_HANDLER = 'IAccountBindingHandler';
export const TOKEN_HANDLER = 'ITokenHandler';

// Auth extension-point tokens (optional hooks)
export const USER_SYNC_HOOK = 'IUserSyncHook';

// Repository tokens
export const USER_REPOSITORY = 'USER_REPOSITORY';
export const REFRESH_TOKEN_REPOSITORY = 'REFRESH_TOKEN_REPOSITORY';
export const ROLE_REPOSITORY = 'ROLE_REPOSITORY';
