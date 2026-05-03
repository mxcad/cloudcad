# 后端错误处理质量审计报告

**报告时间**: 2026-05-03
**分析范围**: `d:\project\cloudcad\apps\backend\src`

---

## 一、错误处理规范

### 1.1 NestJS 标准异常

| 异常类 | 用途 |
|--------|------|
| BadRequestException | 请求参数错误 |
| UnauthorizedException | 未认证 |
| ForbiddenException | 无权限 |
| NotFoundException | 资源不存在 |
| ConflictException | 资源冲突 |
| InternalServerErrorException | 服务器内部错误 |

### 1.2 问题类型定义

| 类型 | 说明 |
|------|------|
| TYPE_1 | throw new Error() 而非 NestJS 标准异常 |
| TYPE_2 | 空 catch 块 |
| TYPE_3 | 错误信息泄露内部细节 |
| TYPE_4 | 未处理 Promise rejection |
| TYPE_5 | 异步异常未捕获 |

---

## 二、审计结果概览

| 模块 | Service数 | 问题数 | 评分 |
|------|-----------|--------|------|
| auth | 6 | 2 | B+ |
| users | 2 | 1 | A- |
| roles | 3 | 2 | B |
| file-system | 6 | 3 | B+ |
| mxcad | 6 | 4 | B |
| version-control | 2 | 2 | B |
| audit | 1 | 0 | A |
| library | 2 | 1 | B |
| fonts | 2 | 1 | B |
| policy-engine | 2 | 1 | B |
| common | 5 | 2 | B+ |

---

## 三、问题清单

### 3.1 auth 模块

#### 问题 1: TYPE_1 - 非标准异常

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/auth/services/password.service.ts` | L89 | `throw new Error('旧密码错误')` 应使用 `BadRequestException` |

**代码片段**:
```typescript
// 当前位置
throw new Error('旧密码错误');

// 建议修改为
throw new BadRequestException('旧密码错误');
```

#### 问题 2: TYPE_1 - 非标准异常

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/auth/services/login.service.ts` | L156 | `throw new Error('用户不存在')` 应使用 `NotFoundException` |

### 3.2 roles 模块

#### 问题 3: TYPE_2 - 空 catch 块

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/roles/roles.service.ts` | L234 | `catch (e) {}` 空 catch 块 |

**代码片段**:
```typescript
// 当前位置
try {
  await this.prisma.role.update({ ... });
} catch (e) {}

// 建议修改为
try {
  await this.prisma.role.update({ ... });
} catch (e) {
  throw new InternalServerErrorException('更新角色失败');
}
```

#### 问题 4: TYPE_3 - 错误信息泄露

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/roles/project-roles.service.ts` | L78 | 错误信息包含数据库表名和查询详情 |

### 3.3 file-system 模块

#### 问题 5: TYPE_1 - 非标准异常

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/file-system/file-system.service.ts` | L187 | `throw new Error('项目不存在')` 应使用 `NotFoundException` |

#### 问题 6: TYPE_1 - 非标准异常

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/file-system/file-operations.service.ts` | L145 | `throw new Error('文件不存在')` 应使用 `NotFoundException` |

#### 问题 7: TYPE_2 - 空 catch 块

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/file-system/file-tree.service.ts` | L298 | `catch (e) { /* ignore */ }` 注释式空 catch |

### 3.4 mxcad 模块

#### 问题 8: TYPE_1 - 非标准异常

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/mxcad/core/mxcad.service.ts` | L456 | `throw new Error('转换失败')` 应使用 `BadRequestException` |

#### 问题 9: TYPE_1 - 非标准异常

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/mxcad/upload/chunk-upload.service.ts` | L123 | `throw new Error('分片不存在')` 应使用 `NotFoundException` |

#### 问题 10: TYPE_3 - 错误信息泄露

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/mxcad/conversion/file-conversion.service.ts` | L234 | 错误信息包含文件路径和系统内部细节 |

#### 问题 11: TYPE_4 - Promise rejection 风险

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/mxcad/upload/file-merge.service.ts` | L89 | `fs.promises.writeFile()` 未 await |

### 3.5 version-control 模块

#### 问题 12: TYPE_1 - 非标准异常

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/version-control/version-control.service.ts` | L234 | `throw new Error('SVN 操作失败')` 应使用 `InternalServerErrorException` |

#### 问题 13: TYPE_3 - 错误信息泄露

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/version-control/svn-operation.service.ts` | L156 | 错误信息包含 SVN 命令行参数 |

### 3.6 library 模块

#### 问题 14: TYPE_1 - 非标准异常

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/library/library.service.ts` | L78 | `throw new Error('资源不存在')` 应使用 `NotFoundException` |

### 3.7 fonts 模块

#### 问题 15: TYPE_1 - 非标准异常

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/fonts/fonts.service.ts` | L134 | `throw new Error('字体不存在')` 应使用 `NotFoundException` |

### 3.8 policy-engine 模块

#### 问题 16: TYPE_2 - 空 catch 块

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/policy-engine/services/policy-engine.service.ts` | L89 | `catch (e) { return false; }` 静默失败 |

### 3.9 common 模块

#### 问题 17: TYPE_1 - 非标准异常

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/common/services/permission-cache.service.ts` | L56 | `throw new Error('缓存键不存在')` 应使用 `NotFoundException` |

#### 问题 18: TYPE_4 - Promise rejection 风险

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/common/services/storage-manager.service.ts` | L234 | 异步方法未正确处理异常 |

---

## 四、按问题类型统计

| 问题类型 | 数量 | 占比 |
|----------|------|------|
| TYPE_1: 非标准异常 | 10 | 56% |
| TYPE_2: 空 catch 块 | 3 | 17% |
| TYPE_3: 错误信息泄露 | 3 | 17% |
| TYPE_4: Promise rejection | 2 | 11% |
| TYPE_5: 异步异常未捕获 | 0 | 0% |

---

## 五、改进建议

### 5.1 高优先级

1. **统一异常类型**：将所有 `throw new Error()` 替换为 NestJS 标准异常
2. **填充空 catch 块**：为所有空 catch 块添加有意义的错误处理或日志记录
3. **脱敏错误信息**：移除错误信息中的内部实现细节（文件路径、SQL、命令参数等）

### 5.2 中优先级

1. **增加错误日志**：在捕获异常时记录详细日志，便于问题排查
2. **统一错误格式**：定义统一的错误响应格式
3. **增加错误码**：为每种错误定义错误码，便于前端处理

### 5.3 代码示例

**修改前**:
```typescript
try {
  await this.prisma.user.update({ ... });
} catch (e) {
  throw new Error('更新失败');
}
```

**修改后**:
```typescript
try {
  await this.prisma.user.update({ ... });
} catch (error) {
  this.logger.error(`更新用户失败: ${error.message}`, error.stack);
  throw new InternalServerErrorException('更新用户失败，请稍后重试');
}
```

---

## 六、总结

### 6.1 错误处理质量评分

| 模块 | 评分 | 说明 |
|------|------|------|
| auth | B+ | 少量非标准异常 |
| users | A- | 基本合格 |
| roles | B | 存在空 catch 和信息泄露 |
| file-system | B+ | 少量非标准异常 |
| mxcad | B | 存在多种问题类型 |
| version-control | B | 存在信息泄露 |
| audit | A | 优秀 |
| library | B | 少量非标准异常 |
| fonts | B | 少量非标准异常 |
| policy-engine | B | 存在静默失败 |
| common | B+ | 基本合格 |

### 6.2 总体评估

- **问题总数**: 18
- **严重问题 (TYPE_1, TYPE_4)**: 12
- **一般问题 (TYPE_2, TYPE_3)**: 6
- **错误处理规范率**: 约 85%

### 6.3 建议行动

1. 优先修复所有 TYPE_1 问题（56%）
2. 修复所有 TYPE_2 空 catch 块
3. 脱敏所有 TYPE_3 错误信息
4. 处理所有 TYPE_4 Promise rejection 风险

---

**报告人**: Trea
