# 测试计划：系统管理域

## 覆盖页面

| 页面 | 路由 | 组件 | 权限要求 |
|------|------|------|---------|
| 仪表盘 | `/dashboard` | Dashboard.tsx | 需登录 |
| 用户管理 | `/users` | UserManagement/index.tsx | SYSTEM_USER_READ |
| 角色管理 | `/roles` | RoleManagement.tsx | SYSTEM_ROLE_READ |
| 审计日志 | `/audit-logs` | AuditLogPage.tsx | SYSTEM_ADMIN |
| 系统监控 | `/system-monitor` | SystemMonitorPage.tsx | SYSTEM_MONITOR |
| 运行时配置 | `/runtime-config` | RuntimeConfigPage.tsx | SYSTEM_CONFIG_READ |

## 测试用例矩阵

### 仪表盘 (Dashboard)

| ID | 交互类型 | 用例描述 | 操作步骤 | 预期结果 | 角色 | 优先级 |
|----|---------|---------|---------|---------|------|--------|
| D-001 | 基础 | 仪表盘正常加载 | goto /dashboard | 页面渲染，项目卡片/统计可见 | USER | P0 |
| D-002 | 基础 | 搜索框可见 | 页面加载 | 搜索输入框 + 搜索按钮可见 | USER | P1 |
| D-003 | 基础 | 创建项目按钮可见 | 页面加载 | "创建项目"按钮可见 | USER | P1 |
| D-004 | 列表 | 项目卡片列表 | 页面加载 | 项目卡片渲染，含名称/描述/时间 | USER | P0 |
| D-005 | 列表 | 空项目状态 | 无项目用户访问 | 空状态引导提示 | USER | P1 |
| D-006 | 表单 | 搜索项目 | 输入关键词→搜索 | 项目列表筛选匹配结果 | USER | P1 |
| D-007 | 基础 | 点击项目→跳转文件管理 | 点击项目卡片 | URL变为 /projects/:projectId/files | USER | P0 |

### 用户管理 (UserManagement)

| ID | 交互类型 | 用例描述 | 操作步骤 | 预期结果 | 角色 | 优先级 |
|----|---------|---------|---------|---------|------|--------|
| U-001 | 基础 | 用户管理页加载 | goto /users | 用户表格 + 工具栏 + Tab可见 | ADMIN | P0 |
| U-002 | 基础 | 活跃/已注销 Tab切换 | 点击"已注销"Tab | 列表刷新为已注销用户 | ADMIN | P0 |
| U-003 | 列表 | 用户表格分页 | 页面加载→翻页 | 分页控件可见，可翻页 | ADMIN | P1 |
| U-004 | 列表 | 用户表格排序 | 点击创建时间列头 | 按时间排序 | ADMIN | P1 |
| U-005 | 表单 | 搜索用户 | 输入用户名/邮箱→搜索 | 表格筛选匹配结果 | ADMIN | P1 |
| U-006 | 表单 | 角色筛选下拉 | 选择角色→筛选 | 表格只看该角色用户 | ADMIN | P1 |
| U-007 | 弹窗 | 创建用户→弹窗 | 点击"添加用户" | CreateUserModal打开 | ADMIN | P0 |
| U-008 | 弹窗 | 创建用户→成功 | 填写表单→提交 | Toast成功→列表更新 | ADMIN | P0 |
| U-009 | 弹窗 | 创建用户→校验失败 | 空用户名字段→提交 | 校验错误提示 | ADMIN | P1 |
| U-010 | 弹窗 | 编辑用户 | 点击编辑→修改→保存 | Toast成功→列表更新 | ADMIN | P1 |
| U-011 | 弹窗 | 软删除用户 | 点击删除→确认 | Toast"已删除"→列表更新 | ADMIN | P0 |
| U-012 | 弹窗 | 修改存储配额 | 点击配额→修改→保存 | QuotaModal，Toast成功 | ADMIN | P1 |
| U-013 | 权限 | USER_MANAGER→正常访问 | USER_MANAGER访问 /users | 页面正常加载 | USER_MANAGER | P1 |
| U-014 | 权限 | USER→NoPermissionPage | USER访问 /users | NoPermissionPage显示 | USER | P0 |
| U-015 | 状态 | 搜索无结果→空状态 | 搜索不存在用户 | 空状态提示 | ADMIN | P2 |

### 角色管理 (RoleManagement)

| ID | 交互类型 | 用例描述 | 操作步骤 | 预期结果 | 角色 | 优先级 |
|----|---------|---------|---------|---------|------|--------|
| RO-001 | 基础 | 角色管理加载 | goto /roles | 角色表格可见（系统+自定义角色） | ADMIN | P0 |
| RO-002 | 弹窗 | 创建角色→弹窗 | 点击"创建角色" | 名称输入+类别选择+权限树 | ADMIN | P0 |
| RO-003 | 选择 | 权限checkbox树 | 创建/编辑角色 | 权限按类别分组（系统/项目/库） | ADMIN | P1 |
| RO-004 | 弹窗 | 创建角色→成功 | 填写信息→勾选权限→确认 | Toast成功→列表更新 | ADMIN | P0 |
| RO-005 | 弹窗 | 编辑角色 | 点击角色→修改名称/权限→保存 | Toast成功 | ADMIN | P1 |
| RO-006 | 弹窗 | 删除角色→确认 | 点击删除→二次确认 | Toast"已删除" | ADMIN | P1 |
| RO-007 | 弹窗 | 删除角色→有关联用户 | 删除有用户的角色 | "请先移除用户"警告 | ADMIN | P2 |
| RO-008 | 权限 | USER_MANAGER→正常访问 | USER_MANAGER访问 /roles | 页面正常加载 | USER_MANAGER | P1 |
| RO-009 | 权限 | USER→NoPermissionPage | USER访问 /roles | NoPermissionPage | USER | P1 |

### 审计日志 (AuditLogPage)

| ID | 交互类型 | 用例描述 | 操作步骤 | 预期结果 | 角色 | 优先级 |
|----|---------|---------|---------|---------|------|--------|
| AL-001 | 基础 | 审计日志加载 | goto /audit-logs | 日志表格+筛选栏+分页可见 | ADMIN | P0 |
| AL-002 | 列表 | 日志分页 | 翻页 | 分页控件可操作 | ADMIN | P1 |
| AL-003 | 表单 | 操作类型筛选 | 选择操作类型→筛选 | 表格只看该类型日志 | ADMIN | P1 |
| AL-004 | 表单 | 用户搜索 | 输入用户名→搜索 | 日志按用户筛选 | ADMIN | P1 |
| AL-005 | 权限 | USER_MANAGER→不可见 | USER_MANAGER访问 | NoPermissionPage | USER_MANAGER | P1 |

### 系统监控 (SystemMonitorPage)

| ID | 交互类型 | 用例描述 | 操作步骤 | 预期结果 | 角色 | 优先级 |
|----|---------|---------|---------|---------|------|--------|
| SM-001 | 基础 | 系统监控加载 | goto /system-monitor | 健康状态+缓存+性能面板可见 | ADMIN | P0 |
| SM-002 | 基础 | 健康状态指示 | 页面加载 | 后端/DB/Redis 状态显示 | ADMIN | P1 |
| SM-003 | 基础 | 手动刷新 | 点击刷新按钮 | 数据更新 | ADMIN | P2 |
| SM-004 | 权限 | USER→NoPermissionPage | USER访问 | NoPermissionPage | USER | P1 |

### 运行时配置 (RuntimeConfigPage)

| ID | 交互类型 | 用例描述 | 操作步骤 | 预期结果 | 角色 | 优先级 |
|----|---------|---------|---------|---------|------|--------|
| RC-001 | 基础 | 运行时配置加载 | goto /runtime-config | 配置列表+分组可见 | ADMIN | P0 |
| RC-002 | 基础 | 配置项分组显示 | 页面加载 | 配置按类别分组 | ADMIN | P1 |
| RC-003 | 表单 | 搜索配置 | 输入配置键名→搜索 | 结果筛选 | ADMIN | P1 |
| RC-004 | 基础 | 编辑配置 | 点击配置→修改值→保存 | Toast生效 | ADMIN | P1 |
| RC-005 | 基础 | 敏感配置脱敏 | 查看password类配置 | 值显示**** | ADMIN | P2 |
| RC-006 | 权限 | USER_MANAGER→不可见 | USER_MANAGER访问 | NoPermissionPage | USER_MANAGER | P1 |

## 工作流测试

| ID | 流程 | 步骤 | 预期 | 角色 | 优先级 |
|----|------|------|------|------|--------|
| W-010 | 用户管理CRUD | 创建→编辑→删除 | 每步Toast确认 | ADMIN | P0 |
| W-011 | 角色管理CRUD | 创建角色→分配权限→删除 | 每步Toast确认 | ADMIN | P0 |
| W-012 | 侧边栏可见性 | 使用不同角色登录→查看侧边栏 | ADMIN看到全部，USER只看到基础 | 多角色 | P1 |

## 预估用例数

| 页面 | P0 | P1 | P2 | 小计 |
|------|-----|-----|-----|------|
| 仪表盘 | 3 | 4 | 0 | 7 |
| 用户管理 | 6 | 7 | 2 | 15 |
| 角色管理 | 3 | 4 | 2 | 9 |
| 审计日志 | 1 | 3 | 1 | 5 |
| 系统监控 | 1 | 1 | 2 | 4 |
| 运行时配置 | 1 | 4 | 1 | 6 |
| 工作流 | 2 | 1 | 0 | 3 |
| **总计** | **17** | **24** | **8** | **49** |

## 所需的种子数据

- [ ] ADMIN 角色用户（admin/Admin@123）
- [ ] USER_MANAGER 角色用户
- [ ] USER 角色用户
- [ ] 预建30+用户（测试分页）
- [ ] 预建自定义角色
- [ ] 预置审计日志数据

## 审核备注

审核人：______  日期：______  状态：通过 / 需修改
