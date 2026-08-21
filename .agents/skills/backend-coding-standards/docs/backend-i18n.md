# 后端国际化（i18n）

> 新增错误消息时，必须在所有语言文件添加对应键。

## 翻译文件位置

```
src/common/i18n/translations/
├── zh-CN/error.yml
├── en-US/error.yml
├── zh-TW/error.yml
└── ko-KR/error.yml
```

## 规范

- 新增错误消息时，**四个文件都必须添加**对应键
- 使用 YAML 格式，保持键名一致
- 错误码格式：`ERROR_<MODULE>_<DESCRIPTION>`（如 `ERROR_FILE_NOT_FOUND`）

## 使用方式

```typescript
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class SomeService {
  constructor(private readonly i18n: I18nService) {}

  async someMethod() {
    const message = await this.i18n.translate('error.FILE_NOT_FOUND', {
      lang: 'zh-CN',
      args: { fileName: 'test.dwg' },
    });
  }
}
```
