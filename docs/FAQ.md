# 常见问题解答 (FAQ)

## 开发环境问题

### 1. 测试失败

**原因**: 基础设施未启动  
**解决**: `cd packages/backend && pnpm dev:infra`

### 2. 数据库连接失败

**原因**: PostgreSQL/Redis未运行  
**解决**: 检查 Docker 容器状态 `docker ps`

### 3. 依赖问题

**原因**: 使用了 npm/yarn  
**解决**: 删除 `node_modules`，使用 `pnpm install`

### 4. 类型生成失败

**原因**: 后端服务未启动或 Swagger 配置错误  
**解决**:

- 确保后端运行 `http://localhost:3001/api-docs`
- 检查 DTO 是否都有 `@ApiProperty`
- 检查响应 DTO 是否正确继承 `ApiResponseDto<T>`

### 5. Vite 热重载失效/缓存问题

**原因**: Vite 缓存了旧代码  
**解决**:

```powershell
# 停止前端服务
cd packages/frontend
# 清除缓存
Remove-Item -Path "node_modules\.vite" -Recurse -Force
# 重启服务
pnpm dev
# 浏览器硬刷新 Ctrl+Shift+R
```

### 6. 端口冲突

**原因**: 端口被占用  
**检查**: `netstat -ano | findstr :3001`  
**解决**: 修改 `.env` 中的端口或杀掉占用进程

### 7. TypeScript 类型错误

**原因**: 前端类型与后端不同步  
**解决**:

```bash
# 1. 确保后端服务运行
# 2. 重新生成类型
cd packages/frontend && pnpm generate:types
# 3. 重启前端开发服务器
```

### 8. Swagger 无法生成嵌套类型

**症状**: `openapi-typescript` 报错 `Can't resolve $ref`  
**原因**: 使用了复杂的 `allOf` 或 `$ref` 组合  
**解决**: 使用具体的继承类而非内联 schema：

```typescript
// ❌ 错误：内联 schema
@ApiResponse({
  schema: {
    allOf: [
      { $ref: getSchemaPath(ApiResponseDto) },
      { properties: { data: { $ref: getSchemaPath(AuthResponseDto) } } }
    ]
  }
})

// ✅ 正确：使用继承类
export class AuthApiResponseDto extends ApiResponseDto<AuthResponseDto> {
  @ApiProperty({ type: () => AuthResponseDto })
  declare data: AuthResponseDto;
}

@ApiResponse({ type: AuthApiResponseDto })
```

## 文件系统相关问题

### 1. 文件上传失败或无法创建文件夹

**原因**: FileSystemNode 节点类型混淆或父节点不存在  
**解决**:

- 确保根节点 `isRoot=true, isFolder=true`
- 文件夹节点 `isFolder=true`，文件节点 `isFolder=false`
- 创建子节点前检查父节点存在性
- 检查权限：用户是否有父节点的写入权限

### 2. 无法删除文件夹

**原因**: 级联删除配置或子节点未清理  
**解决**:

```prisma
// schema.prisma 中已配置级联删除
parent FileSystemNode? @relation(..., onDelete: Cascade)
```

- 删除会自动级联到所有子节点
- 检查数据库约束是否正确

### 3. 存储空间显示问题

**症状**: 存储空间信息不显示或显示错误  
**原因**: API调用失败或数据格式不正确  
**解决**:

- 检查浏览器控制台是否有错误信息
- 确认后端 `/file-system/storage` 端点正常响应
- 检查用户是否已登录
- 验证前端 `projectsApi.getStorageInfo()` 调用是否正确

## 认证相关问题

详情请参考 [认证问题排查指南](./AUTH_TROUBLESHOOTING.md)

## 开发工具问题

### 1. Docker 容器启动失败

**检查步骤**:

```bash
# 查看容器状态
docker ps -a

# 查看容器日志
docker logs <容器名称>

# 重启容器
docker-compose restart
```

### 2. Prisma Studio 无法连接

**原因**: 数据库未启动或连接配置错误  
**解决**:

```bash
# 确保数据库运行
cd packages/backend && pnpm dev:infra

# 检查环境变量
cat .env | grep DB_

# 启动 Studio
pnpm db:studio
```

### 3. 测试覆盖率报告生成失败

**原因**: Jest 配置或测试文件问题  
**解决**:

```bash
# 清理测试缓存
pnpm test --clearCache

# 重新生成覆盖率
pnpm test:cov

# 查看详细报告
open coverage/lcov-report/index.html
```

## 部署问题

### 1. 生产环境构建失败

**检查项**:

- Node.js 版本是否符合要求 (>= 20.19.5)
- 环境变量是否正确配置
- 依赖是否正确安装

### 2. 环境变量配置错误

**常见错误**:

- JWT_SECRET 使用默认值
- 数据库连接参数错误
- 本地文件存储路径配置错误

**解决**:

```bash
# 复制示例配置
cp .env.example .env

# 修改关键配置
JWT_SECRET=your-super-secret-jwt-key-change-in-production
DB_HOST=localhost
FILES_DATA_PATH=./filesData
```

## 性能问题

### 1. 前端加载缓慢

**优化建议**:

- 检查网络请求是否过多
- 启用代码分割
- 优化图片资源

### 2. 后端响应慢

**排查步骤**:

- 检查数据库查询性能
- 查看Redis缓存命中率
- 分析慢查询日志

## 更多帮助

如果以上解决方案无法解决您的问题，请：

1. 查看项目文档目录 `docs/`
2. 检查 GitHub Issues
3. 提交新的 Issue 并提供详细信息：
   - 错误信息
   - 复现步骤
   - 环境信息
   - 相关日志
