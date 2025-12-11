import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
      trustProxy: true,
      bodyLimit: 50 * 1024 * 1024, // 50MB for file uploads
    })
  );

  // 启用CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // 全局前缀
  app.setGlobalPrefix('api');

  // 配置Swagger文档
  AppModule.configureSwagger(app);

  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');

  console.log(`应用运行在: ${await app.getUrl()}`);
  console.log(`API文档地址: ${await app.getUrl()}/api/docs`);
}
bootstrap();
