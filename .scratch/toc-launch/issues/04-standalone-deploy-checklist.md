# 04 — standalone 部署与上线 checklist（收尾）

**What to build:** C 端首版以 standalone 模式（backend:3001 + storage-service:3200 + function-workflow:3100，ADR-0016）完成部署验证，并落地一份可执行的上线 checklist 文档，覆盖功能闸门确认与外部平台配置。当前线上域名 demo.mxdraw3d.com，换正式域名是纯配置切换 + 外部清单（已核查无硬编码域名）。

**部署拓扑（已拍板）**: standalone 三进程运行在**同一台服务器**上（进程级分离，非分机部署）。遇到瓶颈后的扩容顺序：同机调优并发参数（核数/内存公式见 `docs/elastic-conversion-architecture.md`）→ function-workflow 多实例（需先验证任务分发，见跟踪项）→ 分机/云 FaaS。

**Blocked by:** 01（批量下载开关）、02（永久会员残留清理）、03（隐私政策页面）

**Status:** ready-for-agent

- [ ] standalone 三进程**单机**启动验证（参照 `deploy/docker-compose.standalone.yml` 或 PM2 编排），三服务 health 均通过，转换任务端到端跑通（上传→转换→预览→保存）
- [ ] 单机资源评估：按物理核数确认并发参数（各优先级并发之和 ≤ 物理核数，内存按最坏 4GB/张评估），写入部署文档
- [ ] 上线前配置确认：`collaborationEnabled`、`batchDownloadEnabled` 均默认关闭；微信登录开关按产品口径设置
- [ ] 上线 checklist 文档落地（`docs/` 下），包含：
  - 功能闸门清单（哪些开、哪些关，开启条件）
  - 正式域名切换步骤：新域名备案、微信开放平台回调白名单、微信支付 notify_url、HTTPS 证书、前端 API base 环境变量、`deviceAuthFrontendDomain`/`oldSiteApiBase` 等运行时配置
  - 隐私政策/用户协议已挂载确认
  - 上线后观察项：转换队列水位、配额告警、垃圾注册量（user-cleanup 生效）
- [ ] 上线后跟踪项登记：SVN 存储扩展、多实例任务分发验证（function-workflow 横向扩容前提）、mock 支付网关仅 dev、wechat-ip.guard 反代后改 `req.ip`
