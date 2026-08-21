# Express v5 注意事项

> 后端使用 Express v5，部分 API 与 v4 不兼容。

## session.destroy() 和 session.save()

Express v5 中返回 `Promise<void>`（不再支持回调风格）：

```typescript
// ❌ 错误 — v5 不支持回调
req.session.destroy(() => { ... });

// ✅ 正确 — 直接 await
await req.session.destroy();

// ✅ 正确 — save 也一样
await req.session.save();
```

## 其他 v5 差异

| 特性 | v4 | v5 |
|------|-----|-----|
| `res.send()` | 同步 | 同步（不变） |
| 路由参数 | `:param` | `:param`（不变） |
| 中间件签名 | `(req, res, next)` | 不变 |
| `app.del()` | 已弃用 | 已移除，用 `app.delete()` |
