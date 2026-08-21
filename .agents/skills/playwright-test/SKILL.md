---
name: playwright-test
description: 基于 Playwright MCP 的自动化测试技能。纯文本驱动（无障碍树 + CSS 选择器），无需多模态。Use when writing or running E2E tests, automating page interactions, verifying UI states, testing login/permission/CAD workflows, or any browser test automation.
---

# Playwright Test Automation

通过 Playwright MCP (`@playwright/mcp`) 提供的 MCP tool 操控浏览器，支持断言验证。

## 可用 MCP 工具

**核心操作**: `browser_navigate`, `browser_snapshot`, `browser_find`, `browser_click`, `browser_type`, `browser_fill_form`, `browser_select_option`, `browser_hover`, `browser_drag`, `browser_evaluate`, `browser_wait_for`, `browser_press_key`, `browser_resize`

**测试断言** (`--caps=testing` 已启用): `browser_verify_element_visible`, `browser_verify_text_visible`, `browser_verify_value`, `browser_verify_list_visible`, `browser_generate_locator`

**存储**: `browser_localstorage_*`, `browser_cookie_*`, `browser_sessionstorage_*`

## 通用测试工作流

### 1. 登录测试

```
browser_navigate("http://localhost:3000/login")
browser_snapshot()                    → 获取无障碍树，定位元素 ref
browser_type(target="@e5", text="user@test.com")
browser_type(target="@e8", text="password123")
browser_click(target="@e12")          → 点击登录按钮
browser_wait_for(text="欢迎回来")       → 等待登录成功
browser_snapshot()                    → 确认页面状态
```

### 2. 表单填写

```
browser_navigate(url)
browser_snapshot()
browser_fill_form(fields=[
  {target: "@e3", value: "项目名称"},
  {target: "@e7", value: "描述内容"}
])
browser_click(target="@e10")
browser_verify_text_visible(text="创建成功")
```

### 3. 列表验证

```
browser_navigate(url)
browser_snapshot()
browser_verify_list_visible(
  element="项目列表",
  target="@e15",
  items=["项目A", "项目B", "项目C"]
)
```

### 4. 权限跳转测试

```
browser_navigate("http://localhost:3000/admin")
browser_wait_for(time=2)
browser_snapshot()
browser_verify_text_visible(text="权限不足")
// 或验证被重定向到登录页
browser_verify_text_visible(text="登录")
```

### 5. 等待 + 网络请求验证

```
browser_navigate(url)
browser_click(target=...)
browser_wait_for(text="加载完成")   // 等待文本出现
browser_network_requests(static=false, filter="/api/projects")
browser_network_request(index=1)   // 查看请求详情
```

## CloudCAD 典型测试场景

| 场景 | 步骤 |
|------|------|
| 用户登录 | navigate → fill email/password → click 登录 → verify 跳转 |
| 创建项目 | navigate 项目管理 → click 新建 → fill 表单 → click 确认 → verify 列表 |
| CAD 页面加载 | navigate CAD 编辑页 → wait_for CAD 按钮出现 → verify 工具栏可见 |
| 权限拦截 | navigate 无权限页面 → verify_text "无权限" |
| 文件上传 | navigate → click 上传 → browser_file_upload(paths=[...]) → verify 列表 |

## 提示

- 定位元素优先用 `browser_snapshot()` 取无障碍树，`@eN` 引用最可靠
- 搜索特定元素用 `browser_find(text="关键词")` 比全量 snapshot 更省 token
- 表单多字段用 `browser_fill_form` 一次完成，避免逐个 type
- `browser_generate_locator` 可从无障碍元素生成 Playwright 测试选择器
- 用 `--caps=testing` 启用的 `browser_verify_*` 系列工具做断言，无需截图
