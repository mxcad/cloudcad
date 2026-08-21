///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  AuditLogger,
  getAuditLoggerInstance,
  registerAuditLoggerInstance,
} from "../../audit/audit-logger.service";
import { Audit } from "./audit.decorator";
import { AuditAction, ResourceType } from "../enums/audit.enum";

describe("@Audit decorator", () => {
  const mockAudit = jest.fn();
  const mockLogger = { audit: mockAudit } as unknown as AuditLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    registerAuditLoggerInstance(mockLogger);
  });

  afterAll(() => {
    registerAuditLoggerInstance(null);
  });

  class TestService {
    @Audit(AuditAction.USER_LOGIN, ResourceType.USER)
    async login(): Promise<{ user: { id: string } }> {
      return { user: { id: "user123" } };
    }

    @Audit(AuditAction.USER_LOGIN, ResourceType.USER)
    async loginWithoutUser(): Promise<{ accessToken: string }> {
      return { accessToken: "token" };
    }

    @Audit(AuditAction.USER_LOGIN, ResourceType.USER)
    async returnsUndefined(): Promise<undefined> {
      return undefined;
    }

    @Audit(AuditAction.USER_LOGIN, ResourceType.USER)
    async throws(): Promise<never> {
      throw new Error("boom");
    }

    @Audit(AuditAction.USER_LOGOUT, ResourceType.USER, {
      resourceId: (_result, args) => args[0] as string,
      userId: (_result, args) => args[0] as string,
      success: (result) => Boolean((result as { success?: boolean })?.success),
      details: (_result, args) => ({ phone: args[1] as string }),
    })
    async customExtractors(
      userId: string,
      phone: string
    ): Promise<{ success: boolean }> {
      return { success: false };
    }

    @Audit(AuditAction.USER_VERIFY_EMAIL, ResourceType.USER, {
      when: (result) => Boolean((result as { accessToken?: string })?.accessToken),
    })
    async conditional(
      withToken: boolean
    ): Promise<{ accessToken?: string; user: { id: string } }> {
      return withToken
        ? { accessToken: "token", user: { id: "user123" } }
        : { user: { id: "user123" } };
    }
  }

  const service = new TestService();

  describe("成功路径审计", () => {
    it("应调用 audit 并传入 action/resourceType/提取字段，返回值不变", async () => {
      const result = await service.login();

      expect(result).toEqual({ user: { id: "user123" } });
      expect(mockAudit).toHaveBeenCalledTimes(1);
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.USER_LOGIN,
          resourceType: ResourceType.USER,
          resourceId: "user123",
          userId: "user123",
          success: true,
          details: {},
        }),
      );
    });
  });

  describe("默认提取器（result.user?.id）", () => {
    it("result 无 user 时 userId 回退为 'unknown'", async () => {
      await service.loginWithoutUser();

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: undefined,
          userId: "unknown",
        }),
      );
    });
  });

  describe("自定义提取器", () => {
    it("resourceId/userId/success/details 由提取器从参数与结果中取值", async () => {
      const result = await service.customExtractors("user123", "+8613812345678");

      expect(result).toEqual({ success: false });
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: "user123",
          userId: "user123",
          success: false,
          details: { phone: "+8613812345678" },
        }),
      );
    });
  });

  describe("异常路径", () => {
    it("原方法抛错时不审计，错误向上传播", async () => {
      await expect(service.throws()).rejects.toThrow("boom");
      expect(mockAudit).not.toHaveBeenCalled();
    });
  });

  describe("undefined result 容错", () => {
    it("原方法返回 undefined 时不抛错，userId 回退 'unknown'", async () => {
      const result = await service.returnsUndefined();

      expect(result).toBeUndefined();
      expect(mockAudit).toHaveBeenCalledTimes(1);
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: undefined,
          userId: "unknown",
          success: true,
        }),
      );
    });
  });

  describe("when 条件", () => {
    it("条件不满足时跳过审计，返回值不变", async () => {
      const result = await service.conditional(false);

      expect(result).toEqual({ user: { id: "user123" } });
      expect(mockAudit).not.toHaveBeenCalled();
    });

    it("条件满足时正常审计", async () => {
      await service.conditional(true);

      expect(mockAudit).toHaveBeenCalledTimes(1);
    });
  });

  describe("AuditLogger 未注册", () => {
    it("跳过审计不抛错，返回值不变", async () => {
      registerAuditLoggerInstance(null);
      try {
        const result = await service.login();

        expect(result).toEqual({ user: { id: "user123" } });
        expect(mockAudit).not.toHaveBeenCalled();
      } finally {
        registerAuditLoggerInstance(mockLogger);
      }
    });
  });

  describe("getAuditLoggerInstance", () => {
    it("应返回已注册实例", () => {
      expect(getAuditLoggerInstance()).toBe(mockLogger);
    });
  });
});
