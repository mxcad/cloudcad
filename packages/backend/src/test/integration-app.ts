import { INestApplication, VersioningType } from '@nestjs/common';

/**
 * 以 main.ts 的引导配置创建集成测试 HTTP app（URI 版本化）。
 * 全局校验管道由 AppModule 的 APP_PIPE CustomValidationPipe 提供（与 main.ts 一致，见 #219/#239）。
 * 注意：main.ts 还设置了全局前缀 `api`，此处不设置，以匹配测试 URL 使用的 `/v1/...` 路径。
 */
export function initIntegrationApp(app: INestApplication): INestApplication {
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  return app;
}
