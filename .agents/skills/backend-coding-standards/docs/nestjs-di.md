# NestJS 依赖注入注意事项

Backend 最常出错的领域。主要问题集中在 `import type` 和循环依赖上。

## 禁止 import type 注入

NestJS 使用装饰器元数据来确定构造函数参数的类型。`import type` 会剥离这些元数据，导致运行时 DI 失败。

```typescript
// ❌ 错误 — import type 剥离装饰器元数据
import type { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,  // 💥 运行时: UsersService is undefined
  ) {}
}
```

```typescript
// ✅ 正确 — 正常 import
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,  // ✅ 正常工作
  ) {}
}
```

**注意**: 即使 Biome 的 `organizeImports` 已关闭（`biome.json` 中 `"organizeImports": "off"`），AI 仍可能手写 `import type` 导致 DI 失败。始终检查注入的类是否为正常 import。

## Token 注入打破循环依赖

使用 Injection Token 而不是直接引用具体类，是打破循环依赖的标准做法：

```typescript
// ✅ 正确 — 使用 Token 注入
import { Inject } from '@nestjs/common';
import { USER_SERVICE } from './auth.constants';
import type { IUserService } from './interfaces';

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_SERVICE) private readonly userService: IUserService,
    @Inject(AUTH_PROVIDER) private readonly authProvider: IAuthProvider,
  ) {}
}
```

关键点：
- 使用 `@Inject(TOKEN)` 而不是直接写类名
- Token 定义在单独的 constants 文件中
- 注入接口类型（`IUserService`），实现类由 Module 的 providers 绑定

## 模块依赖必须单向 DAG

```
✅ AuthModule → UsersModule, CommonModule  (单向，OK)
❌ AuthModule ↔ UsersModule                (双向，禁止)
```

当前状态：
- `forwardRef` 已在 AuthModule 中移除
- 模块依赖为单向 DAG
- 新增模块时，画出依赖图确认无循环

## Provider 注册

```typescript
@Module({
  imports: [UsersModule, CommonModule],
  providers: [
    AuthService,
    { provide: USER_SERVICE, useClass: UsersService },     // Token → 实现类
    { provide: AUTH_PROVIDER, useClass: LocalAuthProvider }, // 策略模式
  ],
  exports: [AuthService],  // 只导出其他模块需要的
})
export class AuthModule {}
```

## 常见错误速查

| ❌ 错误 | ✅ 正确 |
|--------|--------|
| `import type { X }` 用于 DI 类 | `import { X }` |
| `forwardRef(() => XModule)` | Token 注入 + 单向依赖 DAG |
| 直接注入具体类 `XService` | 必要时用 `@Inject(TOKEN)` 注入接口 |
| Module 互相 imports | 提取公共接口到 Common 或拆分 |
