-- ADR-0082 D4 修订：通道验证证据带结论强度
--
-- 旧实现把 mock 模式通过、EHLO-only 探测通过、端到端真发通过压成 ok: true 同一个
-- bit，三者写进同一条验证记录、被通道开启门禁同等采信——mock 模式未接触任何外部
-- 系统，却被当作「可以开启通道」的证据（sms 通道 provider 默认 mock 时门禁恒放行）。
-- 本列记录测试动作如实声明的结论强度，门禁只认 PROBE / END_TO_END。
--
-- 默认 PROBE：早于本列的存量记录按「探测通过」采信，等价于升级前的既有行为，
-- 升级不阻断已验证部署；通道配置一变记录即被删除，存量记录自然过期。

CREATE TYPE "ChannelVerdict" AS ENUM ('PROBE', 'END_TO_END', 'SIMULATED');

-- AlterTable
ALTER TABLE "channel_verifications" ADD COLUMN "verdict" "ChannelVerdict" NOT NULL DEFAULT 'PROBE';
