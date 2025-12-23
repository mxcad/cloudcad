# CADEditorDirect 修复验证

## 问题 1：认证错误 (401 Unauthorized)
**原因**：CADEditorDirect 组件使用原生 `fetch` 而不是 `apiService`，导致没有自动添加认证令牌。

### 修复内容

#### 1. 修复 getFileInfo 函数
**之前：**
```typescript
const response = await fetch(`/api/file-system/nodes/${nodeId}`, {
  credentials: 'include',
});
```

**之后：**
```typescript
import { apiService } from '../services/apiService';

const fileData = await apiService.get(`/file-system/nodes/${nodeId}`);
```

#### 2. 修复 createSession 函数
**之前：**
```typescript
const response = await fetch('/api/session/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({ user }),
});
```

**之后：**
```typescript
import { apiService } from '../services/apiService';

await apiService.post('/session/create', { user });
```

#### 3. 优化导入方式
将动态导入改为静态导入，避免构建警告：
```typescript
import { apiService } from '../services/apiService';
```

## 问题 2：文件格式错误 (.dwg vs .mxweb)
**原因**：MxCAD 只能加载 `.mxweb` 格式的文件，但组件尝试访问原始的 `.dwg` 文件。

### 修复内容

#### 1. 使用 fileHash 构建 mxweb 文件路径
**之前：**
```typescript
const fileName = fileInfo.originalName || fileInfo.name;
const mxcadFileUrl = `/mxcad/file/${fileName}`;
```

**之后：**
```typescript
// 检查文件状态和哈希值
if (fileInfo.fileStatus !== 'COMPLETED' || !fileInfo.fileHash) {
  console.error('[CADEditorDirect] ❌ 文件无法访问');
  return;
}

// 构建正确的 MxCAD 文件访问 URL - 使用 fileHash 构建 mxweb 文件名
const mxwebFileName = `${fileInfo.fileHash}.mxweb`;
const mxcadFileUrl = `/mxcad/file/${mxwebFileName}`;
```

#### 2. 添加文件状态验证
- 检查 `fileStatus` 是否为 `COMPLETED`
- 验证 `fileHash` 是否存在
- 提供详细的错误日志

## 验证步骤

1. 确保用户已登录
2. 在文件管理器中点击 CAD 文件
3. 检查浏览器控制台：
   - 不应该有 401 错误
   - 应该显示正确的文件哈希值
   - 应该显示正确的 mxweb 文件路径
4. 确认 MxCAD 编辑器能够正常加载文件
5. 验证文件内容正确显示

## 技术细节

### 文件转换流程
1. 原始文件 (.dwg) 上传后存储
2. 后端使用 mxcadassembly.exe 转换为 .mxweb 格式
3. 转换后的文件以 `{fileHash}.mxweb` 格式命名
4. MxCAD 编辑器只能读取 .mxweb 格式文件

### API 端点说明
- `/api/file-system/nodes/{id}` - 需要认证，返回原始文件信息
- `/mxcad/file/{filename}` - 不需要认证，访问转换后的 .mxweb 文件
- `/api/session/create` - 不需要认证，创建用户会话

### 文件命名规则
- 原始文件：`01海绵城市专篇设计说明_t3.dwg`
- 转换后文件：`4b298dd48355af1202b532fc4d051658.mxweb`
- 访问 URL：`/mxcad/file/4b298dd48355af1202b532fc4d051658.mxweb`

## 构建验证

运行 `pnpm build` 确保没有类型错误和构建警告。修复后构建成功，无错误。