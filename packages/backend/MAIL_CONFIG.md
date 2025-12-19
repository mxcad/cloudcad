# 邮件服务配置

## Gmail SMTP 配置（推荐用于开发环境）

1. 在 Google 账户中启用两步验证
2. 生成应用专用密码：
   - 访问 https://myaccount.google.com/apppasswords
   - 选择"邮件"和设备
   - 生成16位密码

3. 配置环境变量：

```env
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-email@gmail.com
MAIL_PASS=your-16-digit-app-password
MAIL_FROM=CloudCAD <noreply@cloucad.com>
```

## 企业/其他 SMTP 配置

### Outlook/Hotmail

```env
MAIL_HOST=smtp-mail.outlook.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-email@outlook.com
MAIL_PASS=your-password
MAIL_FROM=CloudCAD <noreply@cloucad.com>
```

### 企业邮箱

```env
MAIL_HOST=smtp.your-company.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-email@your-company.com
MAIL_PASS=your-password
MAIL_FROM=CloudCAD <noreply@your-company.com>
```

## 重要提示

1. **不要使用个人 Gmail 密码**，必须使用应用专用密码
2. **生产环境**应使用企业邮箱或专业邮件服务（如 SendGrid、AWS SES）
3. 确保防火墙允许 SMTP 端口（587 或 465）
4. 邮件模板位于 `templates/email-verification.hbs`

## 测试邮件服务

配置完成后，可以通过以下方式测试：

1. 启动后端服务
2. 注册新用户
3. 检查邮箱是否收到验证邮件

## 故障排查

### 常见错误：

- "535 Authentication failed" - 检查邮箱密码是否正确
- "Timeout" - 检查网络连接和防火墙设置
- "Connection refused" - 检查 SMTP 主机和端口配置

### 调试方法：

在开发环境中，可以通过添加日志查看详细错误信息：

```typescript
this.logger.log(`发送邮件到: ${email}`);
this.logger.error(`邮件发送失败: ${error}`);
```
