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

import {
  Logger,
  UnauthorizedException,
  VersioningType,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import { ConfigModule } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import express from 'express';
import session from 'express-session';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';
import { AppModule } from './app.module';
import configuration from './config/configuration';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { I18nContext } from 'nestjs-i18n';
import * as crypto from 'crypto';
import { RuntimeConfigService } from './runtime-config/runtime-config.service';
import { CooperateAuthService } from './cooperate/cooperate-auth.service';
import { TokenBlacklistService } from './auth/services/token-blacklist.service';
import { DatabaseService } from './database/database.service';
import { AccessLogMiddleware } from './common/middlewares/access-log.middleware';
import { withSessionRedisFallback } from './common/session/degrade-session-middleware';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const bootstrapStartTime = Date.now();
  logger.log('🚀 开始启动后端服务...');

  // 全局未捕获异常兜底处理（防止进程静默崩溃）
  process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logger.error(`未处理的 Promise 拒绝: ${message}`, stack);
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
    }
    process.exit(1);
  });

  process.on('uncaughtException', (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error(`未捕获的异常: ${message}`, stack);
    if (error instanceof Error && process.env.SENTRY_DSN) {
      Sentry.captureException(error);
    }
    process.exit(1);
  });

  // 设置控制台编码为 UTF-8，解决 Windows 中文乱码问题
  if (process.platform === 'win32' && process.stdout?.setEncoding) {
    process.stdout.setEncoding('utf8');
    process.stderr.setEncoding('utf8');
  }

  // 等待 ConfigModule 加载环境变量（官方推荐方式）
  // AppModule 的 ConfigModule.forRoot() 会自动加载 .env 和 .env.local
  await ConfigModule.envVariablesLoaded;
  logger.log(`✅ 环境变量加载完成，耗时 ${Date.now() - bootstrapStartTime}ms`);

  // 环境变量已加载，直接调用 configuration() 获取配置
  const config = configuration();

  // Sentry 初始化（仅在配置 SENTRY_DSN 时启用）
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: config.nodeEnv,
      tracesSampleRate: 1.0,
    });
    logger.log('Sentry 错误监控已初始化');
  }

  // Webhook 告警推送（仅在配置 ALERT_WEBHOOK_URL 时启用，未配置零影响）
  if (process.env.ALERT_WEBHOOK_URL) {
    logger.log('Webhook 告警推送已启用');
  }

  // 创建基础 Express 实例
  const server = express();

  // 安全中间件：Helmet - 必须最先注册（在其他中间件之前）
  server.use(
    helmet({
      contentSecurityPolicy: false, // 我们手动设置 CSP
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      dnsPrefetchControl: { allow: false },
      frameguard: { action: 'sameorigin' },
      hidePoweredBy: true,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
    })
  );

  // 对于 multipart/form-data 请求，必须跳过 JSON/URL-encoded 解析，
  // 否则 body stream 会被消费，导致 Multer 报 "Malformed part header"。
  server.use((req, res, next) => {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) {
      return next();
    }
    express.json({
      limit: '50mb',
      verify: (req: any, _res, buf) => {
        if (buf && buf.length) {
          req.rawBody = buf.toString('utf8');
        }
      },
    })(req, res, next);
  });
  // XML body parser（微信支付回调使用 XML，需要捕获 rawBody 用于签名验证）
  server.use((req, res, next) => {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('xml')) return next();
    express.text({
      type: ['text/xml', 'application/xml'],
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        if (buf && buf.length) {
          req.rawBody = buf.toString('utf8');
        }
      },
    })(req, res, next);
  });
  server.use((req, res, next) => {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) {
      return next();
    }
    express.urlencoded({ extended: true, limit: '50mb' })(req, res, next);
  });
  server.disable('x-powered-by');

  // 创建 Redis 客户端
  const redisClient = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
      connectTimeout: config.redis.connectTimeout,
      // 优化：添加重连策略
      reconnectStrategy: (retries) => {
        // 指数退避：最多等待 5 秒
        return Math.min(retries * 100, 5000);
      },
    },
    password: config.redis.password,
    database: config.redis.db,
  });

  redisClient.on('error', (err) => {
    logger.error('Redis 客户端错误:', err.message);
  });

  // 优化：异步连接 Redis，设置超时
  try {
    // 使用 Promise.race 实现连接超时
    const connectPromise = redisClient.connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis 连接超时')), 5000)
    );

    await Promise.race([connectPromise, timeoutPromise]);
    logger.log('Redis Session 存储连接成功');
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('Redis 连接失败:', errorMessage);
    logger.warn('将继续启动（Redis 非必需）');
  }

  // 配置 Redis Session 存储
  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'mxcad:sess:',
  });

  // 配置 Session 中间件
  const sessionMiddleware = session({
    store: redisStore,
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      // cookieSecure 显式设置时用显式值；为 null（未设置）时用 express-session 的 "auto"，
      // 自动按请求协议决定：http 不带 Secure、https 带 Secure（需 trust proxy 正确）。
      // 修复离线 http 部署下 Secure cookie 被浏览器丢弃导致协同 401 的问题。
      secure: config.session.cookieSecure ?? 'auto',
      maxAge: config.session.maxAge,
      httpOnly: true,
      sameSite: config.session.cookieSameSite,
      domain: config.session.cookieDomain,
    },
    name: config.session.name,
  });
  // Redis 故障（NOAUTH / 宕机 / 连接失败）降级：skip session 不 500，
  // 与「Redis 非必需」声明对齐（上文连接失败时仍继续启动）。
  server.use(withSessionRedisFallback(sessionMiddleware, logger));
  logger.log(
    `Session cookie secure: ${
      config.session.cookieSecure ?? 'auto（按请求协议自适应）'
    } (NODE_ENV=${config.nodeEnv})`
  );
  if (config.session.cookieDomain) {
    logger.log(`Session cookie domain: ${config.session.cookieDomain}`);
  }
  logger.log(`Session cookie sameSite: ${config.session.cookieSameSite}`);

  // Cookie 解析中间件（用于读取 refresh_token cookie）
  server.use(cookieParser());

  // CSRF double-submit cookie bootstrap（ADR：cookie-only 会话的 CSRF 回退路径补全）：
  // 前端请求拦截器读该 cookie 并发送 x-csrf-token header（double-submit 模式）。
  // 仅在 cookie 缺失时设置（稳定 per-session，不覆盖已有 token），确保首个 CSRF 保护
  // 请求前 cookie 已存在，打破「cookie 只在请求成功后才设置」的鸡生蛋。
  // 注意：CsrfGuard 在成功请求后仍会轮换 token（见 csrf.guard.ts），本中间件只负责
  // 首次 bootstrap，不干扰轮换。
  server.use((req, res, next) => {
    const existing = req.cookies?.['csrf_token'];
    if (!existing) {
      const token = crypto.randomBytes(32).toString('hex');
      res.cookie('csrf_token', token, {
        httpOnly: false,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 1000,
      });
    }
    next();
  });

  // 创建 NestJS 应用
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server)
  );

  // 访问日志 + 响应头中间件（ADR-0055 §1/§8）：
  // 必须在 CLS 中间件之后挂载（CLS 在 NestFactory.create 阶段已通过 MiddlewareConsumer 绑定），
  // 以便读取 requestId/traceId；由 LOG_ACCESS_ENABLED 控制是否落盘。
  // 直接 new 实例（无强制 DI 依赖，accessLogger 缺省时用模块级 pino-roll 单例）。
  const accessLogMiddleware = new AccessLogMiddleware();
  app.use(accessLogMiddleware.use.bind(accessLogMiddleware));

  // 全局前缀
  app.setGlobalPrefix('api');

  // URI 版本化管理 (v1/v2...)
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // 信任代理
  app.set('trust proxy', true);

  // CORS 配置：生产环境使用明确域名白名单，开发环境使用配置的前端地址
  // 通过 FRONTEND_URL 环境变量配置，支持逗号分隔多个域名
  const corsOrigins =
    config.nodeEnv === 'production'
      ? process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
        : config.frontendUrl
          ? [config.frontendUrl]
          : ['http://localhost:3000']
      : [
          config.frontendUrl || 'http://localhost:3000',
          'http://localhost:5173',
          'http://localhost:3000',
        ];

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cookie',
      'X-CSRF-Token',
      'Accept-Language',
    ],
    exposedHeaders: ['X-Node-Id', 'X-Request-Id', 'X-Trace-Id'],
  });

  // 全局设置 CORP 响应头，支持 MxCAD-App 的 SharedArrayBuffer 跨域访问
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.protocol === 'https' || req.get('X-Forwarded-Proto') === 'https') {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains'
      );
    }
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws: wss:"
    );
    next();
  });

  // 配置 Swagger 文档
  AppModule.configureSwagger(app);

  // 开发环境：启动时生成 swagger_json.json 并触发前端 SDK 更新（非阻塞）
  if (process.env.NODE_ENV === 'development') {
    try {
      const { syncSwaggerAndSdk } = require('../scripts/swagger-sync');
      syncSwaggerAndSdk(app);
    } catch (err) {
      logger.warn(`Swagger/SDK 同步失败（不影响启动）: ${err.message}`);
    }
  }

  // 协同服务代理 — 需要在 NestJS app 创建后获取 RuntimeConfigService
  const runtimeConfigService = app.get(RuntimeConfigService);

  // 协同认证服务 — 复用全局注册的 TokenBlacklistService / DatabaseService，
  // 校验逻辑与 JwtStrategy.validate 对齐（type / 黑名单 / 用户状态）
  const cooperateAuthService = new CooperateAuthService(
    app.get(TokenBlacklistService),
    app.get(DatabaseService),
    config.jwt.secret
  );

  // 协同服务认证 + 运行时配置检查中间件
  server.use('/api/cooperate', async (req, res, next) => {
    // 1. 运行时配置检查：collaboration_enabled 为 false 时拒绝
    try {
      const enabled = await runtimeConfigService.getValue<boolean>(
        'collaborationEnabled',
        false
      );
      if (!enabled) {
        return res.status(403).json({
          message:
            I18nContext.current()?.t('error.auth.collaboration_disabled') ??
            '实时协同只支持私有化部署',
        });
      }
    } catch {
      return res.status(503).json({
        message: '协同服务配置不可用',
      });
    }

    // 2. 用户认证检查
    let userId: string | null = null;

    try {
      // Session 方式（浏览器同源请求自动携带 Cookie）
      if (req.session?.userId) {
        await cooperateAuthService.authenticateSession(
          String(req.session.userId)
        );
        userId = String(req.session.userId);
      } else {
        // JWT 方式（auth_token cookie 或 Authorization header）
        const token = req.headers.authorization?.startsWith('Bearer ')
          ? req.headers.authorization.slice(7)
          : parseCookie(req.headers.cookie, 'auth_token');
        if (token) {
          userId = await cooperateAuthService.authenticateJwt(token);
        }
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        return res.status(401).json({ message: error.message });
      }
      // 非认证类异常（DB 断连等基础设施错误）：记录并保留 5xx 语义，不伪装成登录过期
      logger.error('协同认证检查异常', error.stack);
      return res.status(500).json({ message: '认证服务暂不可用' });
    }

    if (!userId) {
      return res.status(401).json({
        message:
          I18nContext.current()?.t(
            'error.auth.collaboration_login_required'
          ) ?? '需要登录才能使用协同功能',
      });
    }

    req.headers['x-user-id'] = userId;
    next();
  });

  /**
   * 从 Cookie 头中解析指定名称的值
   */
  function parseCookie(
    cookieHeader: string | undefined,
    name: string
  ): string | null {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const key = part.slice(0, eqIdx).trim();
      const value = part.slice(eqIdx + 1).trim();
      if (key === name) return value;
    }
    return null;
  }

  // 协同服务反向代理
  // 注意：express.json()（上方 :129，含 verify 捕获 rawBody）已消费 JSON 请求流，
  // 必须用 fixRequestBody 在 proxyReq 阶段用 req.body 重写 POST body，否则代理转发挂起
  // （http-proxy-middleware 3.x + body-parser 前置的官方方案，见 README fixRequestBody 一节；
  //  mxcad 协同 SDK createWork/joinWork 均为 application/json POST，实测缺此项时挂起）。
  // 仅当 req.readableLength === 0（bodyParser 已消费）时生效；multipart 跳过 json 解析时
  // req.body 为空 → 直接透传原始流，无副作用；与 verify 捕获的 req.rawBody 互不干扰。
  // 现有链路为 HTTP 转发（协同服务 mxcadassembly 为原生黑盒进程，REST 通道）；
  // 若未来需要转发 WebSocket 升级，须补 ws:true。
  server.use(
    '/api/cooperate',
    createProxyMiddleware({
      target: config.cooperate.url,
      changeOrigin: true,
      pathRewrite: { '^/api/cooperate': '' },
      on: { proxyReq: fixRequestBody },
    })
  );
  logger.log(`协同服务代理: /api/cooperate → ${config.cooperate.url}`);

  // 启动应用
  await app.listen(config.port, '0.0.0.0');
  const totalDuration = Date.now() - bootstrapStartTime;
  logger.log(`应用已启动，监听端口 ${config.port}，总耗时 ${totalDuration}ms`);
  // 生产环境不打印详细启动报告，开发环境保留
  if (config.nodeEnv !== 'production') {
    logger.log('📊 启动阶段性能报告:');
    logger.log('  - 环境变量加载: 已完成');
    logger.log('  - Redis 连接: 已完成 (异步)');
    logger.log('  - 数据库连接: 已完成 (带超时控制)');
    logger.log('  - 系统初始化: 已完成 (并行优化)');
    logger.log('  - MX 初始化: 异步后台执行中');
    logger.log('  - 缓存预热: 已禁用 (改为懒加载)');
  }
}
bootstrap();
