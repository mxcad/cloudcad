import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import express from 'express';
import session from 'express-session';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';
import { AppModule } from './app.module';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  // 设置控制台编码为 UTF-8，解决 Windows 中文乱码问题
  if (process.platform === 'win32') {
    process.stdout.setEncoding('utf8');
    process.stderr.setEncoding('utf8');
  }

  const server = express();
  server.use(express.json({ limit: '50mb' }));
  server.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // 禁用 Express 的默认错误处理器，让 NestJS 的异常过滤器处理所有异常
  server.disable('x-powered-by');

  // 创建 Redis 客户端
  const redisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    password: process.env.REDIS_PASSWORD || undefined,
    database: parseInt(process.env.REDIS_DB || '0'),
  });

  await redisClient.connect().catch((err: Error) => {
    logger.error('Redis 连接失败:', err.message);
  });

  // 配置 Redis Session 存储
  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'mxcad:sess:',
  });

  // 添加 Session 支持（使用 Redis 存储）
  const sessionMiddleware = session({
    store: redisStore,
    secret:
      process.env.JWT_SECRET || 'mxcad-session-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24小时
      httpOnly: true,
      sameSite: 'lax', // 允许跨站请求携带 Cookie
      // 移除 domain 限制，让浏览器自动处理
    },
    name: 'mxcad.sid',
  });

  // 先应用 Session 中间件
  server.use(sessionMiddleware);

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
    {
      logger: ['error', 'warn', 'log'],
    }
  );

  // 全局前缀
  app.setGlobalPrefix('api');

  // 启用CORS
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 全局设置 CORP 响应头，支持 MxCAD-App 的 SharedArrayBuffer 跨域访问
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });

  // 配置Swagger文档
  AppModule.configureSwagger(app);

  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
bootstrap();
