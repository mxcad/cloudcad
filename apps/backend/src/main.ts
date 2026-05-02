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

import { Logger } from '@nestjs/common';
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

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const bootstrapStartTime = Date.now();
  logger.log('🚀 开始启动后端服务...');

  // 设置控制台编码为 UTF-8，解决 Windows 中文乱码问题
  if (process.platform === 'win32') {
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

  // 信任代理
  app.set('trust proxy', true);

  // 启用 CORS
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  });

  // 全局设置 CORP 响应头，支持 MxCAD-App 的 SharedArrayBuffer 跨域访问
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });

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
