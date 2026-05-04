///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Controller, Get, HttpCode, HttpStatus, Post, } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, } from '@nestjs/swagger';
import { Public } from './decorators/public.decorator';
import { AuthApiResponseDto, } from './dto/auth.dto';
import { SendVerificationApiResponseDto, } from './dto/email-verification.dto';
import { ForgotPasswordApiResponseDto, ResetPasswordApiResponseDto, BindEmailApiResponseDto, } from './dto/password-reset.dto';
import { UserProfileResponseDto } from '../users/dto/user-response.dto';
let AuthController = (() => {
    let _classDecorators = [ApiTags('认证'), Controller('auth')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _register_decorators;
    let _login_decorators;
    let _refreshToken_decorators;
    let _logout_decorators;
    let _getProfile_decorators;
    let _sendVerification_decorators;
    let _verifyEmail_decorators;
    let _verifyEmailAndRegisterPhone_decorators;
    let _resendVerification_decorators;
    let _bindEmailAndLogin_decorators;
    let _bindPhoneAndLogin_decorators;
    let _verifyPhone_decorators;
    let _forgotPassword_decorators;
    let _resetPassword_decorators;
    let _sendBindEmailCode_decorators;
    let _verifyBindEmail_decorators;
    let _sendUnbindEmailCode_decorators;
    let _verifyUnbindEmailCode_decorators;
    let _rebindEmail_decorators;
    let _sendSmsCode_decorators;
    let _verifySmsCode_decorators;
    let _registerByPhone_decorators;
    let _loginByPhone_decorators;
    let _bindPhone_decorators;
    let _sendUnbindPhoneCode_decorators;
    let _verifyUnbindPhoneCode_decorators;
    let _rebindPhone_decorators;
    let _checkFieldUniqueness_decorators;
    let _getWechatAuthUrl_decorators;
    let _wechatCallback_decorators;
    let _bindWechat_decorators;
    let _unbindWechat_decorators;
    var AuthController = _classThis = class {
        constructor(authService, wechatService, emailVerificationService, smsVerificationService, configService) {
            this.authService = (__runInitializers(this, _instanceExtraInitializers), authService);
            this.wechatService = wechatService;
            this.emailVerificationService = emailVerificationService;
            this.smsVerificationService = smsVerificationService;
            this.configService = configService;
        }
        async register(registerDto, req, response) {
            const result = await this.authService.register(registerDto, req);
            this.setAuthCookie(response, result.accessToken);
            return result;
        }
        async login(loginDto, req, response) {
            const result = await this.authService.login(loginDto, req);
            this.setAuthCookie(response, result.accessToken);
            return result;
        }
        async refreshToken(refreshTokenDto, response) {
            const result = await this.authService.refreshToken(refreshTokenDto.refreshToken);
            this.setAuthCookie(response, result.accessToken);
            return result;
        }
        async logout(req, request, response) {
            // 从请求头中获取 access token
            const accessToken = request.headers.authorization?.replace('Bearer ', '');
            await this.authService.logout(req.user.id, accessToken, request);
            // 清除 Cookie
            const sessionName = this.configService.get('session.name');
            response.clearCookie(sessionName);
            response.clearCookie('auth_token', { path: '/' });
            return { message: '登出成功' };
        }
        async getProfile(req) {
            return req.user;
        }
        async sendVerification(dto) {
            await this.emailVerificationService.sendVerificationEmail(dto.email);
            return { message: '验证邮件已发送' };
        }
        async verifyEmail(dto, req, response) {
            const result = await this.authService.verifyEmailAndActivate(dto.email, dto.code, req);
            if (result.accessToken) {
                this.setAuthCookie(response, result.accessToken);
            }
            return result;
        }
        async verifyEmailAndRegisterPhone(dto, req, response) {
            const result = await this.authService.verifyEmailAndRegisterPhone(dto.email, dto.code, {
                phone: dto.phone,
                code: dto.phoneCode,
                username: dto.username,
                password: dto.password,
                nickname: dto.nickname,
            }, req);
            if (result.accessToken) {
                this.setAuthCookie(response, result.accessToken);
            }
            return result;
        }
        async resendVerification(dto) {
            await this.emailVerificationService.resendVerificationEmail(dto.email);
            return { message: '验证邮件已重新发送' };
        }
        async bindEmailAndLogin(dto, req, response) {
            const result = await this.authService.bindEmailAndLogin(dto.tempToken, dto.email, dto.code, req);
            this.setAuthCookie(response, result.accessToken);
            return result;
        }
        async bindPhoneAndLogin(dto, req, response) {
            const result = await this.authService.bindPhoneAndLogin(dto.tempToken, dto.phone, dto.code, req);
            this.setAuthCookie(response, result.accessToken);
            return result;
        }
        async verifyPhone(dto, req, response) {
            const result = await this.authService.verifyPhoneAndLogin(dto.phone, dto.code, req);
            this.setAuthCookie(response, result.accessToken);
            return result;
        }
        async forgotPassword(dto) {
            return this.authService.forgotPassword(dto.email, dto.phone);
        }
        async resetPassword(dto) {
            return this.authService.resetPassword(dto.email, dto.phone, dto.code, dto.newPassword);
        }
        async sendBindEmailCode(req, dto) {
            return this.authService.sendBindEmailCode(req.user.id, dto.email, dto.isRebind);
        }
        async verifyBindEmail(req, dto) {
            return this.authService.verifyBindEmail(req.user.id, dto.email, dto.code);
        }
        async sendUnbindEmailCode(req) {
            return this.authService.sendUnbindEmailCode(req.user.id);
        }
        async verifyUnbindEmailCode(req, dto) {
            return this.authService.verifyUnbindEmailCode(req.user.id, dto.code);
        }
        async rebindEmail(req, dto) {
            return this.authService.rebindEmail(req.user.id, dto.email, dto.code, dto.token);
        }
        // ==================== 短信验证码相关接口 ====================
        async sendSmsCode(dto, req) {
            // 提取客户端 IP（支持代理场景）
            const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                req.headers['x-real-ip'] ||
                req.socket
                    ?.remoteAddress ||
                'unknown';
            return this.smsVerificationService.sendVerificationCode(dto.phone, clientIp);
        }
        async verifySmsCode(dto) {
            return this.smsVerificationService.verifyCode(dto.phone, dto.code);
        }
        async registerByPhone(registerDto, req, response) {
            const result = await this.authService.registerByPhone(registerDto, req);
            if (result.accessToken) {
                this.setAuthCookie(response, result.accessToken);
            }
            return result;
        }
        async loginByPhone(dto, req, response) {
            const result = await this.authService.loginByPhone(dto.phone, dto.code, req);
            this.setAuthCookie(response, result.accessToken);
            return result;
        }
        async bindPhone(req, dto) {
            return this.authService.bindPhone(req.user.id, dto.phone, dto.code);
        }
        async sendUnbindPhoneCode(req) {
            return this.authService.sendUnbindPhoneCode(req.user.id);
        }
        async verifyUnbindPhoneCode(req, dto) {
            return this.authService.verifyUnbindPhoneCode(req.user.id, dto.code);
        }
        async rebindPhone(req, dto) {
            return this.authService.rebindPhone(req.user.id, dto.phone, dto.code, dto.token);
        }
        async checkFieldUniqueness(dto) {
            return this.authService.checkFieldUniqueness(dto);
        }
        // ==================== 微信登录相关 ====================
        async getWechatAuthUrl(origin, isPopup, purpose) {
            // 将 origin, isPopup, purpose 编码到 state 中
            const stateData = {
                csrf: this.wechatService.generateState(),
                origin: origin || 'http://localhost:3000',
                isPopup: isPopup === 'true',
                purpose: purpose || 'login', // login | bind
            };
            const state = Buffer.from(JSON.stringify(stateData)).toString('base64');
            const authUrl = this.wechatService.getAuthUrl(state);
            return { authUrl, state };
        }
        async wechatCallback(req, res) {
            const { code, state } = req.query;
            // 解析 state 获取前端信息
            let origin = 'http://localhost:3000';
            let isPopup = false;
            let purpose = 'login';
            try {
                const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
                origin = stateData.origin || origin;
                isPopup = stateData.isPopup || false;
                purpose = stateData.purpose || 'login';
                console.log('[wechat callback] 解析 state 成功: origin=%s, isPopup=%s, purpose=%s', origin, isPopup, purpose);
            }
            catch (e) {
                console.log('[wechat callback] 解析 state 失败: %s', e);
            }
            // 统一的重定向函数
            const redirectToFrontend = (path, hashData) => {
                let url = `${origin}${path}`;
                if (hashData) {
                    const hash = encodeURIComponent(JSON.stringify({ ...hashData, isPopup, purpose }));
                    url += `#wechat_result=${hash}`;
                }
                console.log('[wechat callback] 重定向到:', url);
                res.redirect(url);
            };
            // 绑定流程 - 重定向到 Profile 页面
            if (purpose === 'bind') {
                console.log('[wechat callback] bind 流程, code:', !!code);
                if (!code) {
                    redirectToFrontend('/profile', { error: '授权失败', purpose: 'bind' });
                    return;
                }
                redirectToFrontend('/profile', { code, state, purpose: 'bind' });
                return;
            }
            // 注销确认流程 - 重定向到 Profile 页面
            if (purpose === 'deactivate') {
                console.log('[wechat callback] deactivate 流程, code:', !!code);
                if (!code) {
                    redirectToFrontend('/profile', {
                        error: '授权失败',
                        purpose: 'deactivate',
                    });
                    return;
                }
                redirectToFrontend('/profile', { code, state, purpose: 'deactivate' });
                return;
            }
            // 登录流程
            if (!code) {
                redirectToFrontend('/login', { error: '授权失败：缺少 code' });
                return;
            }
            try {
                const result = await this.authService.loginWithWechat(code, state);
                this.setAuthCookie(res, result.accessToken);
                redirectToFrontend('/login', { ...result });
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : '未知错误';
                redirectToFrontend('/login', { error: errorMsg });
            }
        }
        async bindWechat(req, dto) {
            return this.authService.bindWechat(req.user.id, dto.code, dto.state);
        }
        async unbindWechat(req) {
            return this.authService.unbindWechat(req.user.id);
        }
        /**
         * 设置 JWT Cookie，用于 <img> 标签等无法携带 Authorization 头的请求
         */
        setAuthCookie(response, accessToken) {
            const cookieSecure = this.configService.get('session.cookieSecure');
            const maxAge = 60 * 60 * 1000; // 1 小时，与 JWT token 过期时间一致
            response.cookie('auth_token', accessToken, {
                httpOnly: true,
                secure: cookieSecure ?? false,
                sameSite: 'lax',
                maxAge,
                path: '/',
            });
        }
    };
    __setFunctionName(_classThis, "AuthController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _register_decorators = [Post('register'), Public(), ApiOperation({ summary: '用户注册' }), ApiResponse({
                status: 201,
                description: '注册成功',
                type: AuthApiResponseDto,
            }), ApiResponse({ status: 409, description: '邮箱或用户名已存在' }), ApiResponse({ status: 400, description: '请求参数错误' })];
        _login_decorators = [Post('login'), Public(), HttpCode(HttpStatus.OK), ApiOperation({ summary: '用户登录' }), ApiResponse({
                status: 200,
                description: '登录成功',
                type: AuthApiResponseDto,
            }), ApiResponse({ status: 401, description: '账号或密码错误' })];
        _refreshToken_decorators = [Post('refresh'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '刷新Token' }), ApiResponse({
                status: 200,
                description: 'Token刷新成功',
                type: AuthApiResponseDto,
            }), ApiResponse({ status: 401, description: '无效的刷新Token' }), Public()];
        _logout_decorators = [Post('logout'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '用户登出' }), ApiResponse({ status: 200, description: '登出成功' }), ApiBearerAuth()];
        _getProfile_decorators = [Get('profile'), ApiOperation({ summary: '获取用户信息' }), ApiResponse({
                status: 200,
                description: '获取用户信息成功',
                type: UserProfileResponseDto,
            }), ApiResponse({ status: 401, description: '未授权' }), ApiBearerAuth()];
        _sendVerification_decorators = [Post('send-verification'), Public(), HttpCode(HttpStatus.OK), ApiOperation({ summary: '发送邮箱验证码' }), ApiResponse({
                status: 200,
                description: '验证邮件已发送',
                type: SendVerificationApiResponseDto,
            }), ApiResponse({ status: 400, description: '请求参数错误或发送过于频繁' })];
        _verifyEmail_decorators = [Post('verify-email'), Public(), HttpCode(HttpStatus.OK), ApiOperation({ summary: '验证邮箱' }), ApiResponse({
                status: 200,
                description: '邮箱验证成功',
                type: AuthApiResponseDto,
            }), ApiResponse({ status: 400, description: '验证码无效或已过期' })];
        _verifyEmailAndRegisterPhone_decorators = [Post('verify-email-and-register-phone'), Public(), HttpCode(HttpStatus.CREATED), ApiOperation({ summary: '验证邮箱并完成手机号注册' }), ApiResponse({
                status: 201,
                description: '注册成功',
                type: AuthApiResponseDto,
            }), ApiResponse({ status: 400, description: '验证码无效或已过期' }), ApiResponse({ status: 409, description: '手机号、邮箱或用户名已存在' })];
        _resendVerification_decorators = [Post('resend-verification'), Public(), HttpCode(HttpStatus.OK), ApiOperation({ summary: '重发验证码' }), ApiResponse({
                status: 200,
                description: '验证邮件已重新发送',
                type: SendVerificationApiResponseDto,
            }), ApiResponse({ status: 400, description: '请求参数错误或发送过于频繁' })];
        _bindEmailAndLogin_decorators = [Post('bind-email-and-login'), Public(), HttpCode(HttpStatus.OK), ApiOperation({ summary: '绑定邮箱并登录（用于已注册但没有邮箱的用户）' }), ApiResponse({
                status: 200,
                description: '绑定成功',
                type: AuthApiResponseDto,
            }), ApiResponse({ status: 400, description: '验证码无效或令牌过期' })];
        _bindPhoneAndLogin_decorators = [Post('bind-phone-and-login'), Public(), HttpCode(HttpStatus.OK), ApiOperation({ summary: '绑定手机号并登录（用于已注册但没有手机号的用户）' }), ApiResponse({
                status: 200,
                description: '绑定成功',
                type: AuthApiResponseDto,
            }), ApiResponse({ status: 400, description: '验证码无效或令牌过期' })];
        _verifyPhone_decorators = [Post('verify-phone'), Public(), HttpCode(HttpStatus.OK), ApiOperation({ summary: '验证手机号（用于已注册但手机号未验证的用户）' }), ApiResponse({
                status: 200,
                description: '手机号验证成功',
                type: AuthApiResponseDto,
            }), ApiResponse({ status: 400, description: '验证码无效或已过期' })];
        _forgotPassword_decorators = [Post('forgot-password'), Public(), HttpCode(HttpStatus.OK), ApiOperation({ summary: '忘记密码' }), ApiResponse({
                status: 200,
                description: '密码重置验证码已发送',
                type: ForgotPasswordApiResponseDto,
            }), ApiResponse({ status: 400, description: '请求参数错误' }), ApiResponse({ status: 401, description: '该邮箱未注册或账号已禁用' })];
        _resetPassword_decorators = [Post('reset-password'), Public(), HttpCode(HttpStatus.OK), ApiOperation({ summary: '重置密码' }), ApiResponse({
                status: 200,
                description: '密码重置成功',
                type: ResetPasswordApiResponseDto,
            }), ApiResponse({ status: 400, description: '请求参数错误' }), ApiResponse({ status: 401, description: '验证码无效或已过期' })];
        _sendBindEmailCode_decorators = [Post('bind-email'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '发送绑定邮箱验证码' }), ApiResponse({
                status: 200,
                description: '验证码已发送',
                type: BindEmailApiResponseDto,
            }), ApiResponse({ status: 400, description: '邮件服务未启用或已绑定邮箱' }), ApiResponse({ status: 409, description: '邮箱已被其他用户绑定' }), ApiBearerAuth()];
        _verifyBindEmail_decorators = [Post('verify-bind-email'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '验证并绑定邮箱' }), ApiResponse({
                status: 200,
                description: '邮箱绑定成功',
                type: BindEmailApiResponseDto,
            }), ApiResponse({ status: 400, description: '邮件服务未启用或已绑定邮箱' }), ApiResponse({ status: 401, description: '验证码无效或已过期' }), ApiResponse({ status: 409, description: '邮箱已被其他用户绑定' }), ApiBearerAuth()];
        _sendUnbindEmailCode_decorators = [Post('send-unbind-email-code'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '发送解绑邮箱验证码（验证原邮箱）' }), ApiResponse({
                status: 200,
                description: '验证码已发送',
                schema: {
                    example: { success: true, message: '验证码已发送到原邮箱' },
                },
            }), ApiResponse({ status: 400, description: '未绑定邮箱或发送过于频繁' }), ApiBearerAuth()];
        _verifyUnbindEmailCode_decorators = [Post('verify-unbind-email-code'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '验证解绑邮箱验证码' }), ApiResponse({
                status: 200,
                description: '验证通过，可以换绑新邮箱',
                schema: {
                    example: { success: true, message: '验证通过', token: 'xxx' },
                },
            }), ApiResponse({ status: 400, description: '验证码错误或已过期' }), ApiResponse({ status: 401, description: '未绑定邮箱' }), ApiBearerAuth()];
        _rebindEmail_decorators = [Post('rebind-email'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '换绑邮箱（需要先验证原邮箱）' }), ApiResponse({
                status: 200,
                description: '换绑成功',
                schema: {
                    example: { success: true, message: '邮箱换绑成功' },
                },
            }), ApiResponse({ status: 400, description: '验证码错误或未验证原邮箱' }), ApiResponse({ status: 409, description: '新邮箱已被其他用户绑定' }), ApiBearerAuth()];
        _sendSmsCode_decorators = [Post('send-sms-code'), Public(), HttpCode(HttpStatus.OK), ApiOperation({ summary: '发送短信验证码' }), ApiResponse({
                status: 200,
                description: '验证码已发送',
                schema: {
                    example: { success: true, message: '验证码已发送' },
                },
            }), ApiResponse({ status: 400, description: '手机号格式不正确或发送过于频繁' })];
        _verifySmsCode_decorators = [Post('verify-sms-code'), Public(), HttpCode(HttpStatus.OK), ApiOperation({ summary: '验证短信验证码' }), ApiResponse({
                status: 200,
                description: '验证结果',
                schema: {
                    example: { valid: true, message: '验证成功' },
                },
            }), ApiResponse({ status: 400, description: '手机号格式不正确' })];
        _registerByPhone_decorators = [Post('register-phone'), Public(), HttpCode(HttpStatus.CREATED), ApiOperation({ summary: '手机号注册' }), ApiResponse({
                status: 201,
                description: '注册成功',
                type: AuthApiResponseDto,
            }), ApiResponse({ status: 400, description: '验证码错误或参数无效' }), ApiResponse({ status: 409, description: '手机号或用户名已存在' })];
        _loginByPhone_decorators = [Post('login-phone'), Public(), HttpCode(HttpStatus.OK), ApiOperation({ summary: '手机号验证码登录' }), ApiResponse({
                status: 200,
                description: '登录成功',
                type: AuthApiResponseDto,
            }), ApiResponse({ status: 400, description: '验证码错误' }), ApiResponse({ status: 412, description: '手机号未注册，需要跳转注册页' })];
        _bindPhone_decorators = [Post('bind-phone'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '绑定手机号' }), ApiResponse({
                status: 200,
                description: '绑定成功',
                schema: {
                    example: { success: true, message: '手机号绑定成功' },
                },
            }), ApiResponse({ status: 400, description: '验证码错误或已绑定手机号' }), ApiResponse({ status: 409, description: '手机号已被其他用户绑定' }), ApiBearerAuth()];
        _sendUnbindPhoneCode_decorators = [Post('send-unbind-phone-code'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '发送解绑手机号验证码（验证原手机号）' }), ApiResponse({
                status: 200,
                description: '验证码已发送',
                schema: {
                    example: { success: true, message: '验证码已发送到原手机号' },
                },
            }), ApiResponse({ status: 400, description: '未绑定手机号或发送过于频繁' }), ApiBearerAuth()];
        _verifyUnbindPhoneCode_decorators = [Post('verify-unbind-phone-code'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '验证解绑手机号验证码' }), ApiResponse({
                status: 200,
                description: '验证通过，可以换绑新手机号',
                schema: {
                    example: { success: true, message: '验证通过', token: 'xxx' },
                },
            }), ApiResponse({ status: 400, description: '验证码错误或已过期' }), ApiResponse({ status: 401, description: '未绑定手机号' }), ApiBearerAuth()];
        _rebindPhone_decorators = [Post('rebind-phone'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '换绑手机号（需要先验证原手机号）' }), ApiResponse({
                status: 200,
                description: '换绑成功',
                schema: {
                    example: { success: true, message: '手机号换绑成功' },
                },
            }), ApiResponse({ status: 400, description: '验证码错误或未验证原手机号' }), ApiResponse({ status: 409, description: '新手机号已被其他用户绑定' }), ApiBearerAuth()];
        _checkFieldUniqueness_decorators = [Post('check-field'), Public(), HttpCode(HttpStatus.OK), ApiOperation({ summary: '检查字段唯一性（用户名、邮箱、手机号）' }), ApiResponse({
                status: 200,
                description: '返回各字段是否存在',
                schema: {
                    example: {
                        usernameExists: false,
                        emailExists: false,
                        phoneExists: false,
                    },
                },
            })];
        _getWechatAuthUrl_decorators = [Get('wechat/login'), Public(), ApiOperation({ summary: '获取微信授权 URL' }), ApiResponse({
                status: 200,
                description: '返回微信授权 URL',
                schema: {
                    example: {
                        authUrl: 'https://open.weixin.qq.com/connect/qrconnect?...',
                        state: 'random_state_string',
                    },
                },
            })];
        _wechatCallback_decorators = [Get('wechat/callback'), Public(), ApiOperation({ summary: '微信授权回调' }), ApiResponse({
                status: 200,
                description: '微信登录成功，重定向回前端页面',
            }), ApiResponse({ status: 400, description: '授权失败或参数错误' })];
        _bindWechat_decorators = [Post('wechat/bind'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '绑定微信到当前账号' }), ApiResponse({
                status: 200,
                description: '绑定成功',
                schema: {
                    example: { success: true, message: '微信绑定成功' },
                },
            }), ApiResponse({ status: 400, description: '绑定失败' }), ApiResponse({ status: 409, description: '该微信已绑定其他账号' }), ApiBearerAuth()];
        _unbindWechat_decorators = [Post('wechat/unbind'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '解绑微信' }), ApiResponse({
                status: 200,
                description: '解绑成功',
                schema: {
                    example: { success: true, message: '微信解绑成功' },
                },
            }), ApiResponse({ status: 400, description: '解绑失败' }), ApiBearerAuth()];
        __esDecorate(_classThis, null, _register_decorators, { kind: "method", name: "register", static: false, private: false, access: { has: obj => "register" in obj, get: obj => obj.register }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _login_decorators, { kind: "method", name: "login", static: false, private: false, access: { has: obj => "login" in obj, get: obj => obj.login }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _refreshToken_decorators, { kind: "method", name: "refreshToken", static: false, private: false, access: { has: obj => "refreshToken" in obj, get: obj => obj.refreshToken }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _logout_decorators, { kind: "method", name: "logout", static: false, private: false, access: { has: obj => "logout" in obj, get: obj => obj.logout }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getProfile_decorators, { kind: "method", name: "getProfile", static: false, private: false, access: { has: obj => "getProfile" in obj, get: obj => obj.getProfile }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _sendVerification_decorators, { kind: "method", name: "sendVerification", static: false, private: false, access: { has: obj => "sendVerification" in obj, get: obj => obj.sendVerification }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _verifyEmail_decorators, { kind: "method", name: "verifyEmail", static: false, private: false, access: { has: obj => "verifyEmail" in obj, get: obj => obj.verifyEmail }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _verifyEmailAndRegisterPhone_decorators, { kind: "method", name: "verifyEmailAndRegisterPhone", static: false, private: false, access: { has: obj => "verifyEmailAndRegisterPhone" in obj, get: obj => obj.verifyEmailAndRegisterPhone }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _resendVerification_decorators, { kind: "method", name: "resendVerification", static: false, private: false, access: { has: obj => "resendVerification" in obj, get: obj => obj.resendVerification }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _bindEmailAndLogin_decorators, { kind: "method", name: "bindEmailAndLogin", static: false, private: false, access: { has: obj => "bindEmailAndLogin" in obj, get: obj => obj.bindEmailAndLogin }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _bindPhoneAndLogin_decorators, { kind: "method", name: "bindPhoneAndLogin", static: false, private: false, access: { has: obj => "bindPhoneAndLogin" in obj, get: obj => obj.bindPhoneAndLogin }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _verifyPhone_decorators, { kind: "method", name: "verifyPhone", static: false, private: false, access: { has: obj => "verifyPhone" in obj, get: obj => obj.verifyPhone }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _forgotPassword_decorators, { kind: "method", name: "forgotPassword", static: false, private: false, access: { has: obj => "forgotPassword" in obj, get: obj => obj.forgotPassword }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _resetPassword_decorators, { kind: "method", name: "resetPassword", static: false, private: false, access: { has: obj => "resetPassword" in obj, get: obj => obj.resetPassword }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _sendBindEmailCode_decorators, { kind: "method", name: "sendBindEmailCode", static: false, private: false, access: { has: obj => "sendBindEmailCode" in obj, get: obj => obj.sendBindEmailCode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _verifyBindEmail_decorators, { kind: "method", name: "verifyBindEmail", static: false, private: false, access: { has: obj => "verifyBindEmail" in obj, get: obj => obj.verifyBindEmail }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _sendUnbindEmailCode_decorators, { kind: "method", name: "sendUnbindEmailCode", static: false, private: false, access: { has: obj => "sendUnbindEmailCode" in obj, get: obj => obj.sendUnbindEmailCode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _verifyUnbindEmailCode_decorators, { kind: "method", name: "verifyUnbindEmailCode", static: false, private: false, access: { has: obj => "verifyUnbindEmailCode" in obj, get: obj => obj.verifyUnbindEmailCode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _rebindEmail_decorators, { kind: "method", name: "rebindEmail", static: false, private: false, access: { has: obj => "rebindEmail" in obj, get: obj => obj.rebindEmail }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _sendSmsCode_decorators, { kind: "method", name: "sendSmsCode", static: false, private: false, access: { has: obj => "sendSmsCode" in obj, get: obj => obj.sendSmsCode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _verifySmsCode_decorators, { kind: "method", name: "verifySmsCode", static: false, private: false, access: { has: obj => "verifySmsCode" in obj, get: obj => obj.verifySmsCode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _registerByPhone_decorators, { kind: "method", name: "registerByPhone", static: false, private: false, access: { has: obj => "registerByPhone" in obj, get: obj => obj.registerByPhone }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _loginByPhone_decorators, { kind: "method", name: "loginByPhone", static: false, private: false, access: { has: obj => "loginByPhone" in obj, get: obj => obj.loginByPhone }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _bindPhone_decorators, { kind: "method", name: "bindPhone", static: false, private: false, access: { has: obj => "bindPhone" in obj, get: obj => obj.bindPhone }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _sendUnbindPhoneCode_decorators, { kind: "method", name: "sendUnbindPhoneCode", static: false, private: false, access: { has: obj => "sendUnbindPhoneCode" in obj, get: obj => obj.sendUnbindPhoneCode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _verifyUnbindPhoneCode_decorators, { kind: "method", name: "verifyUnbindPhoneCode", static: false, private: false, access: { has: obj => "verifyUnbindPhoneCode" in obj, get: obj => obj.verifyUnbindPhoneCode }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _rebindPhone_decorators, { kind: "method", name: "rebindPhone", static: false, private: false, access: { has: obj => "rebindPhone" in obj, get: obj => obj.rebindPhone }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _checkFieldUniqueness_decorators, { kind: "method", name: "checkFieldUniqueness", static: false, private: false, access: { has: obj => "checkFieldUniqueness" in obj, get: obj => obj.checkFieldUniqueness }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getWechatAuthUrl_decorators, { kind: "method", name: "getWechatAuthUrl", static: false, private: false, access: { has: obj => "getWechatAuthUrl" in obj, get: obj => obj.getWechatAuthUrl }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _wechatCallback_decorators, { kind: "method", name: "wechatCallback", static: false, private: false, access: { has: obj => "wechatCallback" in obj, get: obj => obj.wechatCallback }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _bindWechat_decorators, { kind: "method", name: "bindWechat", static: false, private: false, access: { has: obj => "bindWechat" in obj, get: obj => obj.bindWechat }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _unbindWechat_decorators, { kind: "method", name: "unbindWechat", static: false, private: false, access: { has: obj => "unbindWechat" in obj, get: obj => obj.unbindWechat }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AuthController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AuthController = _classThis;
})();
export { AuthController };
//# sourceMappingURL=auth.controller.js.map