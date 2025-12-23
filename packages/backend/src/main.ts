import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import session from 'express-session';
import { AppModule } from './app.module';

async function bootstrap() {
  const server = express();
  server.use(express.json({ limit: '50mb' }));
  server.use(express.urlencoded({ extended: true, limit: '50mb' }));
  
  // 添加 Session 支持
  server.use(
    session({
      secret: process.env.JWT_SECRET || 'mxcad-session-secret-key-change-in-production',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24小时
        httpOnly: true,
      },
      name: 'mxcad.sid',
    })
  );
  
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server)
  );

  // 启用CORS
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 全局前缀
  app.setGlobalPrefix('api');

  // 全局前缀
  app.setGlobalPrefix('api');

  // 配置Swagger文档
  AppModule.configureSwagger(app);

  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');

  console.log(`应用运行在: ${await app.getUrl()}`);
  console.log(`API文档地址: ${await app.getUrl()}/api/docs`);
}
bootstrap();
