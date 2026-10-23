///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 定义表不变式的红路径（规则本体见 runtime-config.invariants.ts）。
 *
 * 绿路径（真实定义表 → 空数组）在 runtime-config.service.spec.ts 断言；
 * 这里逐条验证规则真的会报警——否则一个 `return []` 的空实现也能通过绿路径，
 * 而配置页的分组错位、该二次确认的没确认、profile 静默偏离照样溜进生产。
 *
 * 全部用例在真实定义表上做单点改写，其余保持合法，因此失败信息只含目标规则。
 */

import { RUNTIME_CONFIG_DEFINITIONS } from "./runtime-config.constants";
import { validateDefinitions } from "./runtime-config.invariants";
import type { RuntimeConfigDefinition } from "./runtime-config.types";

const BASE = RUNTIME_CONFIG_DEFINITIONS;

/** 在真实定义表上原位改写一个键，其余保持合法 */
function patch(key: string, changes: Partial<RuntimeConfigDefinition>) {
  return BASE.map((d) => (d.key === key ? { ...d, ...changes } : d));
}

/** 从定义表里删掉一个键 */
function without(key: string) {
  return BASE.filter((d) => d.key !== key);
}

/** 断言违规清单里含某条原因（其余规则可能同时报警，不逐一钉死） */
function expectViolation(definitions: RuntimeConfigDefinition[], message: string) {
  expect(validateDefinitions(definitions)).toEqual(
    expect.arrayContaining([expect.stringContaining(message)])
  );
}

describe("validateDefinitions", () => {
  it("真实定义表满足全部不变式", () => {
    expect(validateDefinitions()).toEqual([]);
  });

  it("空表不是绿灯：不留「不变式空过」的口子", () => {
    // `return []` 的空实现会在绿路径上漏过；这里强制至少报出一条实质违规
    const violations = validateDefinitions([]);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations).toEqual(
      expect.arrayContaining([expect.stringContaining("次数阈值")])
    );
  });

  it("每项必须声明 impact", () => {
    expectViolation(patch("backupEnabled", { impact: undefined }), "缺少 impact：backupEnabled");
  });

  it("运维基线落进 advanced 会被抓住", () => {
    expectViolation(patch("backupEnabled", { tier: "advanced" }), "运维基线 backupEnabled 必须在 admin 档");
  });

  it("限流项离开 advanced + security 会被抓住", () => {
    expectViolation(patch("rateLimitPublicMax", { tier: "user" }), "限流/锁定项 rateLimitPublicMax 必须是 advanced + security");
  });

  it("口令策略项分类写错会被抓住", () => {
    expectViolation(
      patch("passwordPolicyMinLength", { category: "account" }),
      "口令策略项 passwordPolicyMinLength 必须是 admin + security"
    );
  });

  it("分类闭集：整个分类消失会被抓住", () => {
    // RuntimeConfigCategory 是闭集且 EXPECTED_CATEGORIES 与定义表的实际分类
    // 严格相等，所以只能靠「某一类整体消失」让闭集失配
    expectViolation(BASE.filter((d) => d.category !== "collaboration"), "分类集合须等于");
  });

  it("子分组闭集：子分组挂到未声明的分类会被抓住", () => {
    expectViolation(patch("membershipEnabled", { subgroup: "billing-x" }), "不应声明子分组");
  });

  it("子分组闭集：多项大类少一个子分组会被抓住", () => {
    // 子分组是「集合」而非「每键唯一」，故须把整个子分组从表里拿掉
    const defs: RuntimeConfigDefinition[] = BASE.map((d): RuntimeConfigDefinition =>
      d.category === "security" && d.subgroup === "rate-limit" ? { ...d, subgroup: undefined } : d
    );
    expectViolation(defs, "分类 security 的子分组须等于");
  });

  it("品牌公开键的档位写错会被抓住", () => {
    expectViolation(patch("brandTitle", { tier: "admin" }), "品牌公开键 brandTitle 必须是 isPublic + brand + user");
  });

  it("会员入口出厂默认改 false 会被抓住", () => {
    expectViolation(patch("membershipEnabled", { defaultValue: false }), "membershipEnabled.defaultValue 必须是 true");
  });

  it("会员入口未登记会被抓住", () => {
    expectViolation(without("membershipEnabled"), "membershipEnabled");
  });

  it("次数阈值漏标 dangerous 会被抓住", () => {
    expectViolation(patch("rateLimitPublicMax", { dangerous: false }), "rateLimitPublicMax 必须标 dangerous");
  });

  it("窗口长度误标 dangerous 会被抓住，但账号锁定的窗口与时长例外", () => {
    expectViolation(
      patch("rateLimitPublicWindowMs", { dangerous: true }),
      "rateLimitPublicWindowMs 不得标 dangerous"
    );
    // 账号锁定的窗口与时长和阈值是一套（改一个不改另一个会互相抵消），故例外放行
    const defs = patch("accountLockWindowSeconds", { dangerous: true }).map((d) =>
      d.key === "accountLockDurationSeconds" ? { ...d, dangerous: true } : d
    );
    expect(
      validateDefinitions(defs).filter((v) => v.includes("不得标 dangerous"))
    ).toEqual([]);
  });

  it("profiles 两个目标值同值会被抓住", () => {
    expectViolation(
      patch("rateLimitPublicMax", {
        profiles: { secure: 100, normal: 100 },
      }),
      "profiles:rateLimitPublicMax 的 secure 与 normal 同值"
    );
  });

  it("刻意收敛同值的两键不受「secure/normal 必须不同」约束", () => {
    // mfaEnforceEnabled / passwordPolicyChangeEnforceEnabled 两种模式基线都是关闭，
    // 同值是「模式基线收敛」而非静默空操作（见 runtime-config.invariants.ts 说明）
    const defs = patch("mfaEnforceEnabled", {
      profiles: { secure: false, normal: false },
    });
    expect(validateDefinitions(defs).filter((v) => v.includes("同值"))).toEqual([]);
  });

  it("profiles 目标值越出自身 input.min/max 会被抓住", () => {
    // rateLimitPublicMax 的 input 区间是 [1, 100000]，profile 目标值不走 set() 的校验
    expectViolation(
      patch("rateLimitPublicMax", {
        profiles: { secure: 100, normal: 100001 },
      }),
      "profiles:rateLimitPublicMax（normal）越界"
    );
    expectViolation(
      patch("rateLimitPublicMax", {
        profiles: { secure: 0, normal: 10000 },
      }),
      "profiles:rateLimitPublicMax（secure）越界"
    );
  });

  it("排除清单的键声明 profiles 会被抓住", () => {
    expectViolation(
      patch("maxFileSize", { profiles: { secure: 100, normal: 100 } }),
      "profiles:maxFileSize 不应声明 profiles"
    );
  });

  it("profiles 声明整表消失会被抓住", () => {
    expectViolation(without("securityMode"), "必须包含 securityMode");
  });

  it("出厂默认的刻意例外被改掉会被抓住", () => {
    expectViolation(patch("adminLoginEntry", { defaultValue: "ADMIN_ONLY" }), "adminLoginEntry 出厂默认必须是 MERGED");
    expectViolation(
      patch("freeExportDownloadEnabled", { defaultValue: false }),
      "freeExportDownloadEnabled 出厂默认必须是 true"
    );
  });

  it("依赖边漏声明会被抓住", () => {
    expectViolation(
      patch("requireEmailVerification", { requires: undefined }),
      "依赖边未声明：requireEmailVerification->mailEnabled"
    );
  });

  it("依赖边引用未登记的键会被抓住", () => {
    expectViolation(
      patch("requireEmailVerification", { requires: ["mailEnabledTYPO"] }),
      "引用了未登记的键"
    );
  });

  it("依赖边的一端不是布尔键会被抓住", () => {
    expectViolation(
      patch("rateLimitPublicMax", { requires: ["mailEnabled"] }),
      "rateLimitPublicMax->mailEnabled 的依赖方 rateLimitPublicMax 不是布尔键"
    );
  });

  it("依赖图出现环会被抓住", () => {
    const defs = patch("mailEnabled", {
      requires: ["requireEmailVerification"],
    });
    expectViolation(defs, "依赖图存在环");
  });

  it("一次报出全部违规而不是停在第一条", () => {
    const defs: RuntimeConfigDefinition[] = BASE.map((d): RuntimeConfigDefinition => {
      if (d.key === "backupEnabled") return { ...d, tier: "advanced", impact: undefined };
      if (d.key === "membershipEnabled") return { ...d, defaultValue: false };
      return d;
    });
    expectViolation(defs, "运维基线 backupEnabled 必须在 admin 档");
    expectViolation(defs, "缺少 impact：backupEnabled");
    expectViolation(defs, "membershipEnabled.defaultValue 必须是 true");
  });
});
