# SSH 加固与边界防护操作手册

> 等保三级 8.1.2.1（边界防护）/ 8.1.4.4（入侵防范）/ 8.1.5.1（运维通道）技术操作手册。
> 制度签发（三员职责、审批流程）见 `docs/ops/admin-roles.md`；本手册只讲「怎么配」。
> 关联票：#418（边界防护零成本补强落地）。
> 关联宿主加固：恶意代码防范（ClamAV 夜间批扫，#421）见 `docs/ops/malware-prevention.md`。

## 1. 端口收口（已完成，部署层强制）

#418 已将所有非业务端口改绑 `127.0.0.1`，公网不可达。对外仅保留：

| 端口 | 服务 | 暴露面 |
|---|---|---|
| 80 | Nginx（HTTP→HTTPS 跳转） | 公网 |
| 443 | Nginx（TLS，P0 工程落地后） | 公网 |
| 3000 | 协同服务 | 公网（3091 划归公网 TLS 工程） |
| 3001 | 后端 API | 公网 |

以下端口**仅本机可访问**（`docker/docker-compose.yml`、`docker/docker-compose.monitoring.yml`、`deploy/docker-compose.standalone.yml` 均已改绑 `127.0.0.1:`）：

| 端口 | 服务 | 访问方式 |
|---|---|---|
| 5432 | PostgreSQL | 仅本机 / 容器网络 |
| 6379 | Redis | 仅本机 / 容器网络 |
| 9090 | Prometheus | 本机或 SSH 隧道 |
| 3100 | Loki | 本机或 SSH 隧道 |
| 3005 | Grafana | 本机或 SSH 隧道 |
| 9093 | Alertmanager | 本机或 SSH 隧道 |
| 3200 | storage-service | 仅本机 / 容器网络 |
| 3100 | conversion-service | 仅本机 / 容器网络 |

**远程访问 Grafana/Prometheus**：用 SSH 隧道，不要开公网端口。

```bash
ssh -L 3005:127.0.0.1:3005 user@<host> -N
# 本机浏览器访问 http://127.0.0.1:3005
```

### 存量离线部署用户升级说明

端口收口后，**直连数据库/Redis 的习惯性用法失效**：

- 升级前若在本机外（跳板机/另一台机器）用 `psql -h <host>` / `redis-cli -h <host>` 直连，升级后需改为「SSH 到部署机本机再连」或「SSH 隧道转发」。
- 容器间通信（backend→postgres/redis/storage/conversion）走 Docker 内部网络，**不受影响**。
- 升级步骤：`docker compose up -d` 重启后端口即收口；业务功能（上传/转换/协同）零感知。

## 2. SSH 仅密钥登录加固

`/etc/ssh/sshd_config`（或 drop-in `/etc/ssh/sshd_config.d/hardening.conf`）：

```sshconfig
# 仅密钥登录，禁密码（含 root 密码）
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes

# 降低信息泄露
LogLevel VERBOSE
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 20
```

应用并验证（**先在另一会话保持已登录状态再重启，防止把自己锁在外面**）：

```bash
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
sudo sshd -t          # 语法校验
sudo systemctl reload sshd
# 新开会话用密钥登录验证成功后，再关掉密码会话
```

## 3. fail2ban 部署（推荐）

端口收口后 SSH 是唯一公网入口，fail2ban 是 SSH 暴力破解的最后防线：

```bash
# 默认参数：5 次失败 / 10 分钟窗口 → 封禁 1 小时
./runtime/scripts/security/install-fail2ban.sh install

# 自定义参数
F2B_MAXRETRY=10 F2B_BANTIME=7200 ./runtime/scripts/security/install-fail2ban.sh install

# 查看状态 / 验证
./runtime/scripts/security/install-fail2ban.sh status
./runtime/scripts/security/install-fail2ban.sh verify
```

- 配置渲染到 `/etc/fail2ban/jail.d/sshd.local`（模板 `runtime/scripts/security/fail2ban-sshd.local.conf`）。
- 封禁动作按发行版自动选择：`nftables`（优先）→ `iptables-multiport`。
- 日志路径按发行版自动探测：RHEL 系 `/var/log/secure`，Debian 系 `/var/log/auth.log`。
- **验证封禁**：连续 5 次错误 SSH 登录后，该 IP 应被封禁；`fail2ban-client status sshd` 可见 `Banned IP list`。
- 封禁/解封记录进 `fail2ban.log`，由 promtail 采集进 Loki 可查（见第 5 节）。

**443 公网 TLS 落地后**：扩展 web jail（nginx-http-auth），拦截登录接口暴力枚举，见 `install-fail2ban.sh` 尾部「未来扩展」注释。

## 4. 入侵信号告警（已内置）

两层互补，交叉印证同一入侵面：

| 层 | 机制 | 覆盖场景 |
|---|---|---|
| 应用层 | 账号失败锁定（#416）触发时上报 P1 告警 `security.brute_force_suspected`（`AlertService`，i18n 四语言） | 单账号连续失败触发锁定 |
| 指标层 | Prometheus 规则 `AuthLoginFailureSpike`（`docker/monitoring/prometheus/alert-rules.yml`）：登录接口 4xx 速率 >30 次/分持续 5 分钟 | 多账号/多 IP 分布式慢速爆破 |

- 应用层告警走既有 `AlertService` → P1 聚合邮件（15 分钟窗口），收件人 = `ALERT_EMAIL_TO`。
- 指标层告警走 Alertmanager → 同一 SMTP 通道。
- 阈值初值（30 次/分）上线后按误报/漏报调优，记录写入 `alert-rules.yml` 头部「调优记录」。

## 5. sshd 日志进 Loki

sshd 失败/成功日志经 promtail 采集进 Loki，与 fail2ban 封禁记录、应用层告警同库可查：

- 裸机部署：`runtime/scripts/monitoring/install-monitoring.sh --role agent` 安装 promtail，其配置已包含 `/var/log/secure`（RHEL）/ `/var/log/auth.log`（Debian）与 `fail2ban.log` 的采集目标。
- Docker 部署：监控栈 `docker-compose.monitoring.yml` 的 promtail 服务同理。

Loki 查询示例（LogQL，标签与 `promtail.yml` 的 `cloudcad-security-logs` job 一致：`job=cloudcad` + `src` 标签区分 secure/auth.log/fail2ban.log）：

```logql
{job="cloudcad", log_type="system", src=~"secure|auth.log"} |= "sshd" |= "Failed password"
{job="cloudcad", log_type="system", src="fail2ban.log"} |= "Ban IP"
```

## 6. 运维操作留痕

运维 CLI（`runtime/scripts/cli.js`，含 `cloudcad` 包装器）每次调用自动向 `data/ops-log/YYYYMM.ops.log` 追加留痕：

```
2026-08-31T14:14:37.672Z start user=MxDev cmd="deploy --skip-build"
2026-08-31T14:14:37.676Z exit user=MxDev code=0
```

- 启动行：ISO 时间戳 + 执行者（uid/username）+ 命令行参数。
- 退出行：ISO 时间戳 + 退出码。
- 按月分文件，`data/` 已 gitignore 不入库。
- 满足 8.1.4.3「运维操作可追溯」：谁在何时执行了哪条运维命令、结果如何，均可还原。
