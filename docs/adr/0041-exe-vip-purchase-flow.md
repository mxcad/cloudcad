# ADR-0041: EXE 客户端 VIP 购买流程契约（设备码流 + 授权重定向）
**Status**: accepted

桌面客户端（`mx_cad_viewer` / `mx_cad_editor`）不实现任何支付逻辑、不做订单轮询：已登录时直接打开浏览器访问 `/member-center` 购买页；未登录时走现有设备码流，由 EXE 在 `verification_uri` 上追加 `redirect` 参数（同源校验），`/device` 授权成功后浏览器自动跳转到该重定向地址（购买页）。支付完成后 EXE 不主动感知，在需要 VIP 功能时实时调用 `GET /billing/membership` 判断会员状态。

## 上下文

EXE 需要 CloudCAD 账号的 VIP 会员能力，但要求保持零支付逻辑：建单、支付、对账全部复用 Web 端（前端 MemberCenter 购买页 + 后端 billing 模块，webhook 即时激活账号级会员）。方案对比过 EXE 轮询订单/轮询 membership（判定模糊、超时误报、需持续轮询）、购买会话端点（后端+前端改造成本高），最终选择"与登录同模式的授权重定向"。

## 决策

1. **未登录购买**：EXE 调 `POST /device/code` 拿 `device_code/user_code/verification_uri`，自行拼接 `{verification_uri}?user_code=X&client_id=Y&redirect={购买页URL}` 打开浏览器。`/device` 页解析 `redirect` 参数（仅接受同源 URL，防开放重定向），未登录时与 `user_code/client_id` 一并存入 sessionStorage 跳登录页，登录成功由 Login 页拼回 URL，授权成功后 `window.location.href = redirect`。EXE 轮询 `POST /device/oauth/token` 不受浏览器跳转影响。
2. **已登录购买**：EXE 直接打开 `{deviceAuthFrontendDomain}/member-center`，不经过设备码流。
3. **EXE 会员判定**：不做推送、不做购买后轮询；在需要 VIP 功能的时机（启动、点击会员功能入口）实时调 `GET /billing/membership` 获取最新会员状态。
4. **会员状态字段契约**（登录响应 user、`GET /auth/profile`、user-crud 用户响应三处同源输出，见「字段契约」章节）。

## 字段契约

EXE 登录（`POST /auth/login`）与 `GET /auth/profile` 响应中的会员状态字段统一如下：

| 字段 | 类型 | 语义 |
|------|------|------|
| `isVip` | boolean | 是否有效会员（`tierLevel > 0` 且未过期；永久会员恒为 true）。EXE 主判断字段 |
| `membershipTier` | string | 会员档位，格式 `VIP{level}`（`VIP0`=免费，`VIP1`/`VIP2`/`VIP3`...=有效会员），由 `vipTier.level` 推导 |
| `membershipTierLevel` | number | 数字等级（0=VIP0, 1=VIP1, ...），过期/失效统一降级为 0。与前端既有逻辑兼容 |
| `membershipExpiresAt` | string \| null | 会员到期时间（null=永久；免费用户为 null） |

**决策理由**：

- **档位字符串由 level 推导、不依赖 `vipTier.name`**：`name` 是显示名，管理员可随意修改（如 "VIP1-Plus"、"黄金会员"），作为契约字段会在改名时静默破坏 EXE 判断；`level` 是数字唯一键，稳定。展示名若后续需要，由客户端调 `GET /vip` 自行映射，契约与展示分离。
- **`VIP{level}` 格式而非二值（如 FREE/PRO）**：等级可扩展（VIP4/VIP5 无需改契约），免费档用 `VIP0` 与数据库 `vipTier.level=0` 兜底档对齐。
- **`isVip` 独立布尔**：EXE 主判断零字符串比较；档位字符串仅用于展示/细分。
- **单点推导**：`membershipTierOf(level)` 纯函数（`packages/backend/src/vip/membership-tier.ts`），三处响应（login.service / auth-facade.getProfileWithMembership / user-crud.flattenMembership）同源，零额外 DB 查询（复用已归一化 `tierLevel`，过期自动降级为 0）。

**EXE 侧注意**：历史实现判断 `membershipTier === "PRO"`，必须改为 `isVip === true`（或 `membershipTier !== "VIP0"`）。

## 后果

- 账号一致性：未登录场景由设备码流保证（授权时浏览器登录账号即 EXE 账号）；已登录场景依赖"同一台电脑同一用户"的自然假设，浏览器购买页若登录了其他账号，会员将归属该账号，EXE 侧不可感知（可接受，购买页展示当前登录账号供用户确认）。
- 后端改动：仅新增 `isVip`/`membershipTier` 响应字段（DTO + 推导函数，无表结构变更）；前端改动为 `/device` 授权页与登录页设备恢复逻辑（redirect 参数穿透）。
- 授权成功后跳转购买页时，Redis 中设备码已置为 AUTHORIZED，EXE 轮询照常换取 token，无需等待浏览器页面。
