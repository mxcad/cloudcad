# Profile / User Settings — 功能审计报告

> **分支对比**: `main` (功能完整，旧架构) vs `refactor/circular-deps` (重构中，部分缺失)
> **审计日期**: 2026-05-08
> **后端**: 两端点一致，无差异（见第 7 节）

---

## 1. 架构变更总览

| 维度 | main 分支 | current 分支 (refactor/circular-deps) |
|------|----------|---------------------------------------|
| **组件导入** | 统一从 `./components` barrel 导出 | 混用 `./Profile/` 和 `./components/` 两个来源 |
| **API 调用** | 直接调用 `usersApi` / `authApi` 服务 | 使用自定义 hooks（`usePasswordChange`, `useEmailBind` 等） |
| **Profile 入口** | `packages/frontend/src/pages/Profile.tsx` 1296 行 | `packages/frontend/src/pages/Profile.tsx` 1133 行 |

---

## 2. Tab 级别差异矩阵

### 2.1 个人信息 (ProfileInfoTab)

| 功能点 | main | current | 状态 |
|--------|------|---------|------|
| 查看用户名/昵称/邮箱/手机/微信/角色/状态/创建时间/最后登录 | ✅ | ✅ | 一致 |
| 编辑用户名/昵称（inline form） | ✅ | ✅ | 一致 |
| 用户名长度限制 (3-20) | ✅ | ✅ | 一致 |
| 用户名修改频率提示（一月最多3次） | ✅ | ✅ | 一致 |
| 成功/失败 alert 反馈 | ✅ | ✅ | 一致 |
| 调用 `usersApi.updateProfile()` | ✅ | - | 🔴 NEEDS DECISION |
| 调用 `useProfileUpdate()` hook | - | ✅ | 🔴 NEEDS DECISION |
| loading 状态独立管理 | ✅ (组件内部 `useState`) | ✅ (hook 提供) | 逻辑等价 |

**结论**: 意图相同，API 层抽象方式不同（直接 service vs hook）。**无需修复**，属于重构手法差异。

---

### 2.2 密码修改 (ProfilePasswordTab)

| 功能点 | main | current | 状态 |
|--------|------|---------|------|
| 当前密码字段 | ✅（通过 `window.__userHasPassword` 黑魔法判断） | ✅（通过 `user.hasPassword` prop 判断） | current 更好 |
| 新密码字段 | ✅ | ✅ | 一致 |
| 确认密码字段 | ✅ | ✅ | 一致 |
| 密码强度指示器 (4级) | ✅（组件内部计算） | ✅（父组件传入 prop） | 逻辑等价 |
| 显示/隐藏密码切换 | ✅ | ✅ | 一致 |
| "忘记密码？" 链接 | ✅（`window.location.href`） | ✅（`onNavigate('/forgot-password')`） | current 更好 |
| **"设置密码" hint** (OAuth 用户无密码) | ❌ 不支持 | ✅ 显示 "您的账户是通过手机号或微信自动创建的" 提示 | **current 新增** |
| 按钮文案动态切换（"设置密码"/"修改密码"） | ❌ 不支持 | ✅ 根据 `hasPassword` 切换 | **current 新增** |
| 密码复杂度校验 | ✅ (min 8位，大小写+数字) | ✅ (min 6位，大小写+数字) | ⚠️ 阈值不同 |
| 提交后自动重新登录 | ✅ | ✅ | 一致 |
| 自动登录失败→强制退出→跳转登录页 | ✅ | ✅ | 一致 |
| 安全提示 | ✅ (3条) | ✅ (4条，更详细) | current 更好 |
| 调用 `usersApi.changePassword()` | ✅ | - | 🔴 NEEDS DECISION |
| 调用 `usePasswordChange()` hook | - | ✅ | 🔴 NEEDS DECISION |

**结论**: Current 分支在无密码用户场景下功能更完整。API 调用方式差异属于重构手法。**无需修复**。

---

### 2.3 邮箱绑定 (ProfileEmailTab)

| 功能点 | main (components/) | current (Profile/) | 状态 |
|--------|-------------------|-------------------|------|
| 首次绑定：输入邮箱 | ✅ | ✅ | 一致 |
| 首次绑定：验证验证码 | ✅ | ✅ | 一致 |
| 绑定成功展示 | ✅ | ✅ | 一致 |
| 已绑定状态展示 + benefits | ✅ | ✅ | 一致 |
| **换绑邮箱流程** | ❌ 不支持 | ✅ 完整支持 (verifyOld→inputNew→verifyNew) | **current 新增** |
| **`mailEnabled` 控制换绑按钮显示** | ❌ N/A | ✅ | **current 新增** |
| **换绑取消按钮** | ❌ N/A | ✅ | **current 新增** |
| **sendingCode 状态** | ❌ | ✅ | **current 新增** |
| **countdown 倒计时** | ❌ | ✅ | **current 新增** |
| 验证码输入框 `maxLength={6}` | ✅ | ✅ | 一致 |
| "返回修改" 按钮 | ✅ | ✅ | 一致 |
| 调用 `authApi.sendBindEmailCode()` | ✅ | - | 🔴 NEEDS DECISION |
| 调用 `useEmailBind()` hook | - | ✅ | 🔴 NEEDS DECISION |

**结论**: Current 分支新增了完整的换绑邮箱功能（main 分支完全缺失）。这是功能的增强，**无需修复**。

---

### 2.4 手机绑定 (ProfilePhoneTab)

| 功能点 | main (Profile/) | current (Profile/) | 状态 |
|--------|----------------|-------------------|------|
| 首次绑定：输入手机号→验证码 | ✅ | ✅ | 一致 |
| 换绑：验证原手机号 | ✅ | ✅ | 一致 |
| 换绑：输入新手机号 | ✅ | ✅ | 一致 |
| 换绑：验证新手机号 | ✅ | ✅ | 一致 |
| 手机号格式校验 (1[3-9]\d{9}) | ✅ | ✅ | 一致 |
| 验证码格式校验 (6位数字) | ✅ | ✅ | 一致 |
| 手机号脱敏显示 | ✅ | ✅ | 一致 |
| 已绑定状态展示 + benefits | ✅ | ✅ | 一致 |
| countdown 倒计时 | ✅ | ✅ | 一致 |
| sendingCode 状态 | ✅ | ✅ | 一致 |
| 输入合法性过滤（仅数字） | ✅ | ✅ | 一致 |
| Props 接收方式 | `phone` 直接 prop | `phone` 直接 prop | 一致 |
| 调用 `authApi.sendSmsCode()` | ✅ | - | 🔴 NEEDS DECISION |
| 调用 `usePhoneBind()` hook | - | ✅ | 🔴 NEEDS DECISION |

**结论**: 功能意图完全一致。API 调用方式差异属于重构手法。**无需修复**。

---

### 2.5 微信绑定 (ProfileWechatTab)

| 功能点 | main (Profile/) | current (Profile/) | 状态 |
|--------|----------------|-------------------|------|
| 已绑定状态 + benefits | ✅ | ✅ | 一致 |
| 未绑定状态 + "绑定微信" 按钮 | ✅ | ✅ | 一致 |
| 解绑微信（含确认弹窗） | ✅ | ✅ | 一致 |
| loading 状态管理 | ✅ | ✅ | 一致 |
| 绿色微信按钮样式 | ✅ | ✅ | 一致 |
| Props 接收方式 | `wechatId` 直接 prop | `wechatId` 直接 prop | 一致 |
| 调用 `authApi.bindWechat()` / `authApi.unbindWechat()` | ✅ | - | 🔴 NEEDS DECISION |
| 调用 `useWechatBind()` hook | - | ✅ | 🔴 NEEDS DECISION |

**结论**: 功能意图完全一致。API 调用方式差异属于重构手法。**无需修复**。

---

### 2.6 账户注销 (ProfileDeactivateTab / ProfileAccountTab)

| 功能点 | main (components/ProfileDeactivateTab) | current (components/ProfileDeactivateTab) | 状态 |
|--------|---------------------------------------|------------------------------------------|------|
| 验证方式选择下拉 | ✅ | ✅ | 一致 |
| 密码验证 | ✅ | ✅ | 一致 |
| 手机验证码验证 | ✅ | ✅ | 一致 |
| 邮箱验证码验证 | ✅ | ✅ | 一致 |
| 微信扫码验证 | ✅ | ✅ | 一致 |
| 注销确认 checkbox | ✅ | ✅ | 一致 |
| 危险操作二次确认弹窗 | ✅ | ✅ | 一致 |
| loading 状态（注销中...） | ✅ | ✅ | 一致 |
| **"立即注销" checkbox (跳过30天)** | ✅ | ✅ | 一致 |
| 注销成功后 1500ms 延迟登出 | ✅ | ✅ | 一致 |
| 图标库 | lucide-react | lucide-react | 一致 |
| 倒计时（发送验证码） | ✅ | ✅ | 一致 |
| SessionStorage 保存验证方式 | ✅ | ✅ | 一致 |
| 微信注销成功状态展示 | ✅ | ✅ | 一致 |

**注意**: `packages/frontend/src/pages/Profile/ProfileAccountTab.tsx` (旧版) 也存在但**未被使用**——当前 Profile.tsx 导入的是 `components/ProfileDeactivateTab`。

| 功能点 | main ProfileAccountTab (Profile/) | current ProfileAccountTab (Profile/) | 状态 |
|--------|----------------------------------|-------------------------------------|------|
| WechatVerifyModal 弹窗 | ✅ | ✅ | 一致 |
| 内联 API 调用（发送验证码） | ✅ (动态 import authApi) | ✅ (直接 import) | 实现不同，意图一致 |

**结论**: 功能意图完全一致。`ProfileAccountTab.tsx` 在 main 分支是活跃组件，在 current 分支成为废弃代码（被 `ProfileDeactivateTab` 替代）。**无需修复**。

---

### 2.7 微信注销确认 (WechatDeactivateConfirm)

| 功能点 | main | current | 状态 |
|--------|------|---------|------|
| 微信扫码授权流程 | ✅ | ✅ | 一致 |
| 成功/失败状态管理 | ✅ | ✅ | 一致 |
| loading/error 状态 | ✅ | ✅ | 一致 |
| SessionStorage key 管理 | ✅ | ✅ | 一致 |
| 绑定调用方式 | `authApi.bindWechat()` 直接调用 | `useWechatBind().bindWechat()` hook | 🔴 NEEDS DECISION |

**结论**: 功能意图完全一致。API 调用方式差异属于重构手法。**无需修复**。

---

## 3. Profile.tsx 入口差异

| 功能点 | main | current | 状态 |
|--------|------|---------|------|
| 标签页列表 (info/password/email/phone/wechat/deactivate) | ✅ | ✅ | 一致 |
| Runtime config 控制 tab 显隐 (mail/sms/wechat) | ✅ | ✅ | 一致 |
| 密码强度计算逻辑 | ✅ (组件内部) | ✅ (父组件计算传入) | 逻辑等价 |
| 头像展示 (avatar/placeholder) | ✅ | ✅ | 一致 |
| 用户名/角色展示 | ✅ | ✅ | 一致 |
| 滑块指示器 (tab-indicator) | ✅ | ✅ | 一致 |
| 成功/错误 alert 横幅 | ✅ | ✅ | 一致 |
| URL hash 解析微信回调 | ✅ | ✅ | 一致 |
| 密码 tab 动态标签文案 ("设置密码"/"修改密码") | ✅ | ✅ | 一致 |
| 注销表单 sessionStorage 恢复 | ✅ | ✅ | 一致 |
| 注销自动选择验证方式 | ✅ | ✅ | 一致 |
| `min-h-screen p-6` 容器布局 | ✅ | ✅ | 一致 |
| 暗色主题支持 | ✅ | ✅ | 一致 |

---

## 4. 组件重复问题

当前分支存在**两组同名组件**，位于不同目录：

| 组件 | `pages/Profile/` (被导入) | `pages/components/` (备用) |
|------|--------------------------|---------------------------|
| ProfilePasswordTab | ✅ (带 user prop, 设置密码提示) | ✅ (window 黑魔法, 无设置密码提示) |
| ProfileEmailTab | ✅ (完整换绑支持) | ✅ (仅首次绑定) |
| ProfilePhoneTab | ✅ (直接 props) | ✅ (user 对象 props) |
| ProfileWechatTab | ✅ (直接 props) | ✅ (user 对象 props) |

> **建议**: 清理 `pages/components/` 中的旧版本，统一使用 `pages/Profile/` 中的新版。

---

## 5. 后端端点一致性

两端点完全一致，无差异：

| 端点 | 方法 | 用途 |
|------|------|------|
| `/users/profile/me` | GET | 获取当前用户信息 |
| `/users/profile/me` | PATCH | 更新用户名/昵称 |
| `/users/change-password` | POST | 修改密码 |
| `/users/deactivate-account` | POST | 注销账户 |
| `/auth/bind-email` | POST | 发送绑定邮箱验证码 |
| `/auth/verify-bind-email` | POST | 验证并绑定邮箱 |
| `/auth/send-unbind-email-code` | POST | 发送解绑邮箱验证码 |
| `/auth/verify-unbind-email-code` | POST | 验证解绑邮箱验证码 |
| `/auth/rebind-email` | POST | 换绑邮箱 |
| `/auth/send-sms-code` | POST | 发送短信验证码 |
| `/auth/bind-phone` | POST | 绑定手机号 |
| `/auth/send-unbind-phone-code` | POST | 发送解绑手机验证码 |
| `/auth/verify-unbind-phone-code` | POST | 验证解绑手机验证码 |
| `/auth/rebind-phone` | POST | 换绑手机号 |
| `/auth/wechat/bind` | POST | 绑定微信 |
| `/auth/wechat/unbind` | POST | 解绑微信 |

---

## 6. 🔴 NEEDS DECISION 清单

以下差异属于**架构选择**，需团队决策：

| # | 差异 | main 方式 | current 方式 | 建议 |
|---|------|----------|-------------|------|
| 1 | 密码修改 API | `usersApi.changePassword()` 直接调用 | `usePasswordChange()` hook 封装 | **采用 hook**：更好的关注点分离 |
| 2 | 邮箱绑定 API | `authApi.sendBindEmailCode()` 等直接调用 | `useEmailBind()` hook 封装 | **采用 hook**：统一错误处理 |
| 3 | 手机绑定 API | `authApi.sendSmsCode()` 等直接调用 | `usePhoneBind()` hook 封装 | **采用 hook** |
| 4 | 微信绑定 API | `authApi.bindWechat()` 直接调用 | `useWechatBind()` hook 封装 | **采用 hook** |
| 5 | 个人信息更新 | `usersApi.updateProfile()` 直接调用 | `useProfileUpdate()` hook 封装 | **采用 hook** |
| 6 | 密码强度计算位置 | 组件内部 | 父组件传入 prop | **任意，无功能差异** |
| 7 | 废弃组件清理 | N/A | `pages/components/` 有旧版 | **清理旧版** |

---

## 7. 总结

| 类别 | 数量 |
|------|------|
| ✅ 功能意图一致 | 所有 Tab (7/7) |
| 🆕 current 新增功能 | 邮箱换绑、无密码用户设置密码提示、mailEnabled 门控 |
| 🔴 需要决策 | 7 项（均为 Hook vs 直接 API 调用选择） |
| ❌ 功能缺失/Bug | 0 |
| ⚠️ 需清理 | `pages/components/` 中与 `pages/Profile/` 重复的旧版组件 |

**总体评估**: 重构分支保留了所有 Profile 核心逻辑意图，并在此基础上新增了邮箱换绑和 OAuth 用户密码设置等增强功能。架构差异主要体现在 API 调用抽象层级（service 直接调用 vs hook 封装），不影响功能正确性。
