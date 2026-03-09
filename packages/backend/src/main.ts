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
import configuration from './config/configuration';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  // 设置控制台编码为 UTF-8，解决 Windows 中文乱码问题
  if (process.platform === 'win32') {
    process.stdout.setEncoding('utf8');
    process.stderr.setEncoding('utf8');
  }

  // 使用统一的配置源
  const config = configuration();

  const server = express();
  server.use(express.json({ limit: '50mb' }));
  server.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // 禁用 Express 的默认错误处理器，让 NestJS 的异常过滤器处理所有异常
  server.disable('x-powered-by');

  // 创建 Redis 客户端 (使用统一配置)
  const redisClient = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
      connectTimeout: config.redis.connectTimeout,
    },
    password: config.redis.password,
    database: config.redis.db,
  });

  redisClient.on('error', (err) => {
    logger.error('Redis 客户端错误:', err.message);
  });

  try {
    await redisClient.connect();
    logger.log('Redis Session 存储连接成功');
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('Redis 连接失败:', errorMessage);
  }

  // 配置 Redis Session 存储 (使用统一配置)
  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'mxcad:sess:',
  });

  // 添加 Session 支持（使用 Redis 存储）
  const sessionMiddleware = session({
    store: redisStore,
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.nodeEnv === 'production',
      maxAge: config.session.maxAge,
      httpOnly: true,
      sameSite: 'lax', // 允许跨站请求携带 Cookie
      // 移除 domain 限制，让浏览器自动处理
    },
    name: config.session.name,
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

  await app.listen(config.port, '0.0.0.0');
  logger.log(`应用已启动，监听端口 ${config.port}`);
}
bootstrap();