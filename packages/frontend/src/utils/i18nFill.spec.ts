import { describe, expect, it, vi } from "vitest";

// t 模拟为「返回翻译后模板原文（占位符保留）」——与运行时无变量插值行为一致
vi.mock("@/languages", () => ({
  t: (message: string): string => message,
}));

import { fillTemplate } from "./i18nFill";

describe("fillTemplate（多占位符手动插值，绕开 flexvars 桥接缺陷）", () => {
  it("双占位符 + 中间 ASCII 单词（flexvars 会乱码的场景）正确替换", () => {
    expect(
      fillTemplate("Remaining {months} months {days} days", {
        months: "1",
        days: "6",
      })
    ).toBe("Remaining 1 months 6 days");
  });

  it("三占位符审计模板正确替换", () => {
    expect(
      fillTemplate("{user} grants {target} permission {permission}", {
        user: "admin",
        target: "dev",
        permission: "READ",
      })
    ).toBe("admin grants dev permission READ");
  });

  it("中文模板 + 数字变量", () => {
    expect(
      fillTemplate("剩余 {months} 个月 {days} 天", { months: 2, days: 10 })
    ).toBe("剩余 2 个月 10 天");
  });

  it("变量值中出现的占位符文本按顺序替换（后序变量会替换前序值中的同名片段）", () => {
    expect(fillTemplate("{a} {b}", { a: "{b}", b: "x" })).toBe("x x");
  });

  it("模板中缺失的变量保持原样", () => {
    expect(fillTemplate("{a} and {b}", { a: "1" })).toBe("1 and {b}");
  });
});
