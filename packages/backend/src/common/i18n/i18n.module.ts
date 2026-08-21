import { Module } from '@nestjs/common';
import * as path from 'path';
import {
  AcceptLanguageResolver,
  I18nModule as NestI18nModule,
  I18nYamlLoader,
} from 'nestjs-i18n';

@Module({
  imports: [
    NestI18nModule.forRoot({
      fallbackLanguage: 'zh-CN',
      loader: I18nYamlLoader,
      loaderOptions: {
        path: path.join(__dirname, '/translations/'),
        watch: true,
      },
      resolvers: [AcceptLanguageResolver],
    }),
  ],
  exports: [NestI18nModule],
})
export class I18nModule {}
