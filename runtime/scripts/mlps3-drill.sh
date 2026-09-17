#!/usr/bin/env bash
# =============================================================================
# mlps3-drill.sh — 等保部署机演练跑手（#401 地图，部署机演练清单 D1-D10）
#
# 用法（部署机上）：
#   bash runtime/scripts/mlps3-drill.sh            # 跑全部只读检查，生成报告
#   bash runtime/scripts/mlps3-drill.sh eicar      # D6：投放 EICAR 样例并跑一次扫描
#
# 输出：data/mlps3-drill-<时间戳>.md（把该文件发回即可作为演练证据）
# 默认模式只读，不修改任何文件；eicar 子命令仅向 filesDataPath 加测试文件。
# =============================================================================
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/packages/backend/.env"
REPORT="$PROJECT_ROOT/data/mlps3-drill-$(date +%Y%m%d-%H%M%S).md"
mkdir -p "$PROJECT_ROOT/data"

MODE="${1:-check}"
PASS=0; FAIL=0; SKIP=0

report() { echo "$*" | tee -a "$REPORT"; }
ok()   { PASS=$((PASS+1)); report "✅ $*"; }
bad()  { FAIL=$((FAIL+1)); report "❌ $*"; }
skip() { SKIP=$((SKIP+1)); report "⏭️ $*（跳过）"; }
read_env() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-; }

report "# 等保部署机演练报告 $(date '+%F %T')"
report ""
report "部署目录：$PROJECT_ROOT"
report ""

if [ "$MODE" = "eicar" ]; then
  # D6：EICAR 样例投放 → 扫描 → 隔离验证
  FD_DIR="$(read_env FILES_DATA_PATH)"; FD_DIR="${FD_DIR:-data/files}"
  case "$FD_DIR" in /*) ;; *) FD_DIR="$PROJECT_ROOT/$FD_DIR" ;; esac
  EICAR_FILE="$FD_DIR/eicar-test.txt"
  printf 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > "$EICAR_FILE"
  report "## D6 EICAR 演练"
  report "已投放：$EICAR_FILE"
  if [ -x "$SCRIPT_DIR/antivirus/scan-malware.sh" ] || [ -f "$SCRIPT_DIR/antivirus/scan-malware.sh" ]; then
    bash "$SCRIPT_DIR/antivirus/scan-malware.sh" >> "$REPORT" 2>&1 && ok "scan-malware.sh 执行完成" || bad "scan-malware.sh 执行失败（见上方输出）"
  else
    bad "scan-malware.sh 不存在"
  fi
  report "隔离目录检查（data/quarantine 应出现 eicar-test.txt）："
  find "$PROJECT_ROOT/data/quarantine" -name 'eicar-test*' 2>/dev/null | tee -a "$REPORT" || true
  report "审计/告警检查：grep eicar 后端日志与 alert_records 表（DB 查询留人工）"
  report "P1 邮件：查收件箱（前置 ALERT_EMAIL_ENABLED=true + ALERT_EMAIL_TO 已配）"
  exit 0
fi

# ==================== D4：.env 权限 600 ====================
report "## D4 .env 权限"
if [ -f "$ENV_FILE" ]; then
  PERM="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE" 2>/dev/null)"
  if [ "$PERM" = "600" ]; then ok ".env 权限 600（仅属主可读）"; else bad ".env 权限为 $PERM（期望 600，执行 chmod 600 $ENV_FILE）"; fi
else
  skip ".env 不存在（$ENV_FILE）"
fi

# ==================== D1（本地半）：端口绑定 127.0.0.1 ====================
report ""
report "## D1 端口收口（本地绑定检查；外部扫描需另在公网执行）"
LISTEN="$( (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | awk 'NR>2 {print $4}')"
for PORT in 5432 6379 9090 3100 3005 9093; do
  HIT="$(echo "$LISTEN" | grep -E "[:.]$PORT$" || true)"
  if [ -z "$HIT" ]; then
    skip "端口 $PORT 未监听（组件未启动或非本机部署）"
  elif echo "$HIT" | grep -qE "^(127\.0\.0\.1|\[?::1\]?):$PORT$"; then
    ok "端口 $PORT 仅绑定 127.0.0.1（$HIT）"
  else
    bad "端口 $PORT 绑定非回环地址：$HIT（应收口为 127.0.0.1:$PORT）"
  fi
done
report "外部扫描（人工，在公网环境执行）：扫 5432/6379/9090/3100/3005/9093 应全部超时"
report "业务回归（人工）：登录/上传/转换各一次"

# ==================== D2：fail2ban ====================
report ""
report "## D2 fail2ban SSH 封禁"
if command -v fail2ban-client >/dev/null 2>&1; then
  STATUS="$(fail2ban-client status sshd 2>&1)"
  if echo "$STATUS" | grep -q "Currently banned"; then
    ok "fail2ban sshd jail 运行中：$(echo "$STATUS" | tr '\n' ' ')"
  else
    bad "fail2ban sshd jail 未运行：$STATUS（执行 bash runtime/scripts/security/install-fail2ban.sh）"
  fi
else
  skip "fail2ban 未安装（执行 bash runtime/scripts/security/install-fail2ban.sh 后重跑）"
fi
report "人工验证：连续 10 次 SSH 错密 → fail2ban-client status sshd 出现该 IP → Loki 查 fail2ban 事件"

# ==================== D5：ClamAV ====================
report ""
report "## D5 ClamAV 夜间批扫"
if command -v clamscan >/dev/null 2>&1; then
  ok "clamscan 已安装：$(clamscan --version 2>/dev/null | head -1)"
  AV_LOG="$PROJECT_ROOT/data/logs/antivirus/app-antivirus.log"
  if [ -f "$AV_LOG" ]; then
    report "最近一次扫描摘要（data/logs/antivirus/app-antivirus.log 末行）："
    tail -1 "$AV_LOG" | tee -a "$REPORT"
  else
    skip "尚无扫描日志（$AV_LOG 不存在，首次夜间扫描后出现）"
  fi
  report "freshclam 签名日期（人工）：freshclam 输出末行，或查 /var/log/freshclam 类日志"
else
  bad "clamscan 未安装（执行 bash runtime/scripts/antivirus/install-clamav.sh）"
fi

# ==================== D3：P1 告警邮件通道 ====================
report ""
report "## D3 登录失败 P1 告警邮件"
ALERT_ENABLED="$(read_env ALERT_EMAIL_ENABLED)"
ALERT_TO="$(read_env ALERT_EMAIL_TO)"
if [ "${ALERT_ENABLED:-}" = "true" ] && [ -n "${ALERT_TO:-}" ]; then
  ok "ALERT_EMAIL_ENABLED=true，ALERT_EMAIL_TO=$ALERT_TO"
else
  bad "邮件告警未配置（ALERT_EMAIL_ENABLED=${ALERT_ENABLED:-<未设>}，ALERT_EMAIL_TO=${ALERT_TO:-<未设>}）"
fi
report "人工验证：人为触发 10 次登录失败 → 收件箱（$ALERT_TO）收到 P1 暴力破解邮件"

# ==================== D8：Loki 留存 ====================
report ""
report "## D8 Loki 留存 ≥190 天"
LOKI_CONF="$(ls "$PROJECT_ROOT"/docker/monitoring/loki/*.yml "$PROJECT_ROOT"/data/monitoring/loki/*.yml 2>/dev/null | head -1)"
if [ -n "${LOKI_CONF:-}" ]; then
  RET="$(grep -A3 'retention' "$LOKI_CONF" 2>/dev/null | head -4)"
  if echo "$RET" | grep -qiE "190|456h|6[0-9]h"; then
    ok "Loki retention 配置：$RET"
  else
    bad "Loki retention 未显式配置或 <190 天（当前：${RET:-<无>}；loki 配置加 -retention.delete-request-store 无关，设 retention_policy 或 --retention.expire-after=456h）"
  fi
else
  skip "未找到 loki 配置文件（裸机部署时确认实际配置路径后人工核对）"
fi

# ==================== D9：sshd 会话记录 ====================
report ""
report "## D9 sshd 会话记录"
SSHD_CONF="$(ls /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | head -3)"
LOGLEVEL="$(grep -hE '^\s*LogLevel' $SSHD_CONF 2>/dev/null | head -1)"
if [ -n "${LOGLEVEL:-}" ] && ! echo "$LOGLEVEL" | grep -qiE 'quiet|none'; then
  ok "sshd LogLevel：$LOGLEVEL（会话级日志已开）"
else
  bad "sshd 未配置会话级日志（sshd_config 设 LogLevel VERBOSE 后 reload）"
fi

# ==================== D11：公网 TLS（#408） ====================
report ""
report "## D11 公网 TLS（443 握手 + 80→443 跳转）"
CERT_PATH="$(read_env TLS_CERT_PATH)"
CERT_PATH="${CERT_PATH:-$PROJECT_ROOT/data/certs/fullchain.pem}"
KEY_PATH="$(read_env TLS_KEY_PATH)"
KEY_PATH="${KEY_PATH:-$PROJECT_ROOT/data/certs/privkey.pem}"
if [ -f "$CERT_PATH" ] && [ -f "$KEY_PATH" ]; then
  ok "证书已落位（$CERT_PATH + $KEY_PATH）"
  if command -v curl >/dev/null 2>&1; then
    HTTPS_CODE="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 https://127.0.0.1/ 2>/dev/null || echo FAIL)"
    if [ "$HTTPS_CODE" = "200" ] || [ "$HTTPS_CODE" = "502" ] || [ "$HTTPS_CODE" = "503" ]; then
      ok "443 HTTPS 可达（HTTP $HTTPS_CODE；502/503=后端未就绪但 TLS 握手成功）"
    else
      bad "443 HTTPS 不可达（curl 返回 $HTTPS_CODE；确认 443 端口已映射且 entrypoint 已切 TLS 模板）"
    fi
    REDIRECT="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 http://127.0.0.1/ 2>/dev/null || echo FAIL)"
    if echo "$REDIRECT" | grep -qE '^301 https://'; then
      ok "80 → 443 跳转：$REDIRECT"
    else
      bad "80 未跳转 https（实际：$REDIRECT；证书落位后重启容器/服务使 entrypoint 重新渲染）"
    fi
    HSTS_HDR="$(curl -sk -D - -o /dev/null --max-time 10 https://127.0.0.1/ 2>/dev/null | grep -i '^strict-transport-security' | head -1)"
    if [ -n "$HSTS_HDR" ]; then
      ok "HSTS 头：$HSTS_HDR"
    else
      bad "443 响应缺 HSTS 头（TLS 模板应下发 max-age=31536000; includeSubDomains; preload）"
    fi
  else
    skip "curl 不可用（人工验证 443 握手 + 80 跳转）"
  fi
else
  skip "证书未落位（期望 $CERT_PATH + $KEY_PATH；落位后重启容器/服务自动启用 TLS，无需改 compose）"
fi

# ==================== D7 / D10：指引 ====================
report ""
report "## D7 PII 回填+明文列下线（多阶段，手动逐步执行）"
report "  1. node packages/backend/scripts/pii-backfill.js（三重校验：存在性+解密往返+HMAC；断点续传）"
report "  2. verify 全绿 + 抽样解密比对"
report "  3. node packages/backend/scripts/pii-offline-plaintext.js（verify → backup-redact → drop-column，逐阶段手动）"
report "  前置：生产 PII 密钥与数据写入密钥一致；PII 密钥随 .env 备份"
report ""
report "## D10 资产台账 + 配置基线快照（人工）"
report "  1. 资产台账一张表：云主机/域名/证书/API 密钥/第三方服务 + 责任人"
report "  2. 每月配置基线快照 cron（compose 文件 + .env 脱敏快照）"

# ==================== 汇总 ====================
report ""
report "## 汇总"
report "通过 $PASS / 失败 $FAIL / 跳过 $SKIP"
report "报告文件：$REPORT"
echo ""
echo "报告已生成：$REPORT（把该文件发回即作为演练证据）"
