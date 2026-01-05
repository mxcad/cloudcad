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

async function bootstrap() {
  const server = express();
  server.use(express.json({ limit: '50mb' }));
  server.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // 创建 Redis 客户端
  const redisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    password: process.env.REDIS_PASSWORD || undefined,
    database: parseInt(process.env.REDIS_DB || '0'),
  });

  await redisClient.connect().catch((err) => {
    console.error('Redis 连接失败:', err);
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
      domain: 'localhost', // 允许在 localhost 的所有端口共享 Cookie
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

  // 全局前缀
  app.setGlobalPrefix('api');

  // 全局前缀
  app.setGlobalPrefix('api');

  // 配置Swagger文档
  AppModule.configureSwagger(app);

  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
bootstrap();
