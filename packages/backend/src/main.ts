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

import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import { ConfigModule } from '@nestjs/config';
import express from 'express';
import session from 'express-session';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';
import { AppModule } from './app.module';
import configuration from './config/configuration';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { TusService } from './mxcad/tus/tus.service';
import { TusAuthMiddleware } from './mxcad/tus/tus-auth.middleware';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const bootstrapStartTime = Date.now();
  logger.log('🚀 开始启动后端服务...');

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

  // 创建基础 Express 实例
  const server = express();
  server.use(express.json({ limit: '50mb' }));
  server.use(express.urlencoded({ extended: true, limit: '50mb' }));
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
  server.use(
    session({
      store: redisStore,
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: config.session.cookieSecure,
        maxAge: config.session.maxAge,
        httpOnly: true,
        sameSite: config.session.cookieSameSite,
        domain: config.session.cookieDomain,
      },
      name: config.session.name,
    })
  );
  logger.log(
    `Session cookie secure: ${config.session.cookieSecure} (NODE_ENV=${config.nodeEnv})`
  );
  if (config.session.cookieDomain) {
    logger.log(`Session cookie domain: ${config.session.cookieDomain}`);
  }
  logger.log(`Session cookie sameSite: ${config.session.cookieSameSite}`);

  // 协同服务反向代理
  // /api/cooperate/** → 协同服务 /**（去掉 /api/cooperate 前缀）
  server.use(
    '/api/cooperate',
    createProxyMiddleware({
      target: config.cooperate.url,
      changeOrigin: true,
      pathRewrite: { '^/api/cooperate': '' },
    })
  );
  logger.log(`协同服务代理: /api/cooperate → ${config.cooperate.url}`);

  // 创建 NestJS 应用
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
    {
      logger: config.log.levels,
    }
  );

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
  const corsOrigins = config.nodeEnv === 'production'
    ? (process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
        : config.frontendUrl
          ? [config.frontendUrl]
          : ['http://localhost:3000'])
    : [config.frontendUrl || 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:3000'];

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cookie',
      'Tus-Resumable',
      'Upload-Length',
      'Upload-Metadata',
      'Upload-Offset',
      'X-CSRF-Token',
    ],
  });

  // 全局设置 CORP 响应头，支持 MxCAD-App 的 SharedArrayBuffer 跨域访问
  // 同时设置所有必要的安全响应头
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // 仅在 HTTPS 环境下设置 HSTS
    if (req.protocol === 'https' || req.get('X-Forwarded-Proto') === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    // 基础 Content-Security-Policy（可根据需要调整）
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws: wss:"
    );
    next();
  });

  // 配置 Tus 上传端点
  try {
    const tusService = app.get(TusService);
    const tusAuthMiddleware = app.get(TusAuthMiddleware);
    
    // 挂载 Tus 认证中间件和 Tus 服务器
    server.use('/api/v1/files', (req, res, next) => tusAuthMiddleware.use(req, res, next));
    server.use('/api/v1/files', tusService.getHandler());
    
    logger.log('✅ Tus 上传端点已挂载: /api/v1/files');
  } catch (error) {
    logger.warn('⚠️ Tus 服务挂载失败:', (error as Error).message);
  }

  // 配置 Swagger 文档
  AppModule.configureSwagger(app);

  // 启动应用
  await app.listen(config.port, '0.0.0.0');
  const totalDuration = Date.now() - bootstrapStartTime;
  logger.log(`应用已启动，监听端口 ${config.port}`);
  logger.log(`🎉 后端服务启动完成，总耗时 ${totalDuration}ms`);
  logger.log('📊 启动阶段性能报告:');
  logger.log('  - 环境变量加载: 已完成');
  logger.log('  - Redis 连接: 已完成 (异步)');
  logger.log('  - 数据库连接: 已完成 (带超时控制)');
  logger.log('  - 系统初始化: 已完成 (并行优化)');
  logger.log('  - SVN 初始化: 异步后台执行中');
  logger.log('  - 缓存预热: 已禁用 (改为懒加载)');
}
bootstrap();
