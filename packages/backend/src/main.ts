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

const logger = new Logger('Bootstrap');

async function bootstrap() {
  // 设置控制台编码为 UTF-8，解决 Windows 中文乱码问题
  if (process.platform === 'win32') {
    process.stdout.setEncoding('utf8');
    process.stderr.setEncoding('utf8');
  }

  // 等待 ConfigModule 加载环境变量（官方推荐方式）
  // AppModule 的 ConfigModule.forRoot() 会自动加载 .env 和 .env.local
  await ConfigModule.envVariablesLoaded;

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

  // 配置 Redis Session 存储
  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'mxcad:sess:',
  });

  // 配置 Session 中间件
  // 注意：离线部署使用 HTTP，NODE_ENV 应设为 development（secure=false）
  // HTTPS 生产环境 NODE_ENV=production（secure=true）
  const sessionSecure = config.nodeEnv === 'production';
  server.use(
    session({
      store: redisStore,
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: sessionSecure,
        maxAge: config.session.maxAge,
        httpOnly: true,
        sameSite: 'lax',
      },
      name: config.session.name,
    })
  );
  logger.log(`Session cookie secure: ${sessionSecure} (NODE_ENV=${config.nodeEnv})`);

  // 创建 NestJS 应用
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
    {
      logger: ['error', 'warn', 'log'],
    }
  );

  // 全局前缀
  app.setGlobalPrefix('api');

  // 启用 CORS
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

  // 配置 Swagger 文档
  AppModule.configureSwagger(app);

  // 启动应用
  await app.listen(config.port, '0.0.0.0');
  logger.log(`应用已启动，监听端口 ${config.port}`);
}
bootstrap();