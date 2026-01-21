# 认证问题排查指南

## 401 Unauthorized 错误排查

### 症状

文件上传等需要认证的API返回401错误

### 原因

JWT Token过期、无效或未正确传递

### 解决方案

#### 1. 检查Token存储

在浏览器控制台检查：

```javascript
localStorage.getItem('accessToken');
localStorage.getItem('refreshToken');
localStorage.getItem('user');
```

#### 2. 清除并重新登录

```bash
# 清除所有认证数据
localStorage.clear()
# 重新登录获取新Token
```

#### 3. 检查API拦截器

- 确认 `apiService.ts` 请求拦截器正确添加 Authorization 头
- 确认响应拦截器正确处理Token刷新

#### 4. 后端Token验证

- 检查 `JwtAuthGuard` 是否正确配置
- 验证 JWT_SECRET 配置是否一致

#### 5. 端口冲突处理

```bash
# 检查端口占用
netstat -ano | findstr :3001
# 终止占用进程
taskkill /PID <进程ID> /F
# 重新启动后端
cd packages/backend && pnpm dev
```

### 认证流程完整检查

1. **登录成功** → 存储 accessToken 和 refreshToken
2. **API请求** → 自动添加 Authorization: Bearer <token>
3. **Token过期** → 自动使用 refreshToken 获取新 token
4. **刷新失败** → 清除本地存储，跳转登录页

### 常见认证问题

#### 前端登录后立即跳回登录页

**原因**: 响应数据结构不匹配，localStorage 存储了 `undefined`  
**解决**:

```bash
# 1. 清除浏览器 localStorage
localStorage.clear();
# 2. 硬刷新页面 Ctrl+Shift+R
# 3. 检查后端响应格式是否正确
```

#### API 响应格式错误

**症状**: `response.data.accessToken is undefined`  
**原因**: 前端期待 `{ accessToken }` 但后端返回 `{ code, message, data: { accessToken } }`  
**解决**: 前端 `apiService.ts` 自动解包已实现，检查是否正确导入

### 邮箱验证问题

#### 验证邮件未收到

1. 检查邮件服务器配置
2. 查看垃圾邮件文件夹
3. 确认邮箱地址正确

#### 验证码无效

1. 检查验证码是否过期（通常10分钟）
2. 确认输入的验证码与邮件中的一致
3. 尝试重新发送验证码

### 密码重置问题

#### 重置邮件未收到

1. 检查邮箱是否已注册
2. 验证邮件服务器配置
3. 查看垃圾邮件文件夹

#### 重置失败

1. 确认验证码未过期
2. 检查新密码是否符合要求
3. 确认两次输入的密码一致

## 调试技巧

### 启用详细日志

在浏览器控制台查看API请求和响应：

```javascript
// 在 apiService.ts 中已添加详细日志
console.log('[ApiService] API响应:', {
  url: response.config.url,
  status: response.status,
  data: response.data,
});
```

### 检查网络请求

使用浏览器开发者工具的Network标签：

1. 查看请求头是否包含 Authorization
2. 检查响应状态码和内容
3. 确认Token是否正确传递

### 后端日志检查

查看后端控制台输出：

- JWT验证相关日志
- 数据库查询错误
- 权限检查失败信息
