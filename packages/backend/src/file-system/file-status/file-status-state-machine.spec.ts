///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException } from "@nestjs/common";
import { FileStatus } from "../../common/enums/file-status.enum";
import { FileStatusStateMachine } from "./file-status-state-machine";

describe("FileStatusStateMachine", () => {
  // ==================== canTransition ====================
  describe("canTransition", () => {
    // --- 合法转换 ---
    describe("合法转换", () => {
      it("UPLOADING → PROCESSING", () => {
        expect(
          FileStatusStateMachine.canTransition(
            FileStatus.UPLOADING,
            FileStatus.PROCESSING,
          ),
        ).toBe(true);
      });

      it("UPLOADING → DELETED（用户取消上传）", () => {
        expect(
          FileStatusStateMachine.canTransition(
            FileStatus.UPLOADING,
            FileStatus.DELETED,
          ),
        ).toBe(true);
      });

      it("PROCESSING → COMPLETED", () => {
        expect(
          FileStatusStateMachine.canTransition(
            FileStatus.PROCESSING,
            FileStatus.COMPLETED,
          ),
        ).toBe(true);
      });

      it("PROCESSING → FAILED", () => {
        expect(
          FileStatusStateMachine.canTransition(
            FileStatus.PROCESSING,
            FileStatus.FAILED,
          ),
        ).toBe(true);
      });

      it("COMPLETED → DELETED（用户软删除）", () => {
        expect(
          FileStatusStateMachine.canTransition(
            FileStatus.COMPLETED,
            FileStatus.DELETED,
          ),
        ).toBe(true);
      });

      it("FAILED → DELETED（系统自动删除）", () => {
        expect(
          FileStatusStateMachine.canTransition(
            FileStatus.FAILED,
            FileStatus.DELETED,
          ),
        ).toBe(true);
      });

      it("DELETED → COMPLETED（回收站恢复）", () => {
        expect(
          FileStatusStateMachine.canTransition(
            FileStatus.DELETED,
            FileStatus.COMPLETED,
          ),
        ).toBe(true);
      });
    });

    // --- 非法转换 ---
    describe("非法转换", () => {
      it("UPLOADING → COMPLETED（跳过 PROCESSING）", () => {
        expect(
          FileStatusStateMachine.canTransition(
            FileStatus.UPLOADING,
            FileStatus.COMPLETED,
          ),
        ).toBe(false);
      });

      it("COMPLETED → COMPLETED（自身转换）", () => {
        expect(
          FileStatusStateMachine.canTransition(
            FileStatus.COMPLETED,
            FileStatus.COMPLETED,
          ),
        ).toBe(false);
      });

      it("DELETED → DELETED（重复删除）", () => {
        expect(
          FileStatusStateMachine.canTransition(
            FileStatus.DELETED,
            FileStatus.DELETED,
          ),
        ).toBe(false);
      });

      it("DELETED → PROCESSING（已删除不能转换）", () => {
        expect(
          FileStatusStateMachine.canTransition(
            FileStatus.DELETED,
            FileStatus.PROCESSING,
          ),
        ).toBe(false);
      });

      it("COMPLETED → PROCESSING（已完成不能回到处理中）", () => {
        expect(
          FileStatusStateMachine.canTransition(
            FileStatus.COMPLETED,
            FileStatus.PROCESSING,
          ),
        ).toBe(false);
      });

      it("FAILED → COMPLETED（失败后不能直接恢复，只能删除）", () => {
        expect(
          FileStatusStateMachine.canTransition(
            FileStatus.FAILED,
            FileStatus.COMPLETED,
          ),
        ).toBe(false);
      });

      it("PROCESSING → DELETED（处理中不能直接删除）", () => {
        expect(
          FileStatusStateMachine.canTransition(
            FileStatus.PROCESSING,
            FileStatus.DELETED,
          ),
        ).toBe(false);
      });
    });

    // --- null 处理（向后兼容） ---
    describe("null from（向后兼容）", () => {
      it("null → COMPLETED 视为合法（等同于从 COMPLETED 出发）", () => {
        expect(
          FileStatusStateMachine.canTransition(null, FileStatus.COMPLETED),
        ).toBe(false); // 自身转换
      });

      it("null → DELETED 视为合法（null ≈ COMPLETED → DELETED）", () => {
        expect(
          FileStatusStateMachine.canTransition(null, FileStatus.DELETED),
        ).toBe(true);
      });

      it("null → UPLOADING 视为非法", () => {
        expect(
          FileStatusStateMachine.canTransition(null, FileStatus.UPLOADING),
        ).toBe(false);
      });

      it("null → PROCESSING 视为非法", () => {
        expect(
          FileStatusStateMachine.canTransition(null, FileStatus.PROCESSING),
        ).toBe(false);
      });
    });
  });

  // ==================== validateTransition ====================
  describe("validateTransition", () => {
    it("合法转换不抛异常", () => {
      expect(() =>
        FileStatusStateMachine.validateTransition(
          FileStatus.COMPLETED,
          FileStatus.DELETED,
        ),
      ).not.toThrow();
    });

    it("非法转换抛出 BadRequestException", () => {
      expect(() =>
        FileStatusStateMachine.validateTransition(
          FileStatus.COMPLETED,
          FileStatus.PROCESSING,
        ),
      ).toThrow(BadRequestException);
    });

    it("非法转换异常消息包含 from 和 to 状态", () => {
      try {
        FileStatusStateMachine.validateTransition(
          FileStatus.DELETED,
          FileStatus.PROCESSING,
        );
        fail("应该抛出异常");
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        const message = (error as BadRequestException).message;
        expect(message).toContain("DELETED");
        expect(message).toContain("PROCESSING");
      }
    });

    it("null from 合法转换不抛异常（null → DELETED）", () => {
      expect(() =>
        FileStatusStateMachine.validateTransition(null, FileStatus.DELETED),
      ).not.toThrow();
    });

    it("null from 非法转换抛异常", () => {
      expect(() =>
        FileStatusStateMachine.validateTransition(
          null,
          FileStatus.PROCESSING,
        ),
      ).toThrow(BadRequestException);
    });

    it("null → COMPLETED 视为自身转换，抛异常", () => {
      expect(() =>
        FileStatusStateMachine.validateTransition(null, FileStatus.COMPLETED),
      ).toThrow(BadRequestException);
    });
  });

  // ==================== 未定义状态防护 ====================
  describe("边缘情况", () => {
    it("未定义的 from 状态抛出 BadRequestException", () => {
      expect(() =>
        FileStatusStateMachine.validateTransition(
          "INVALID" as FileStatus,
          FileStatus.COMPLETED,
        ),
      ).toThrow(BadRequestException);
    });

    it("未定义的 to 状态抛出 BadRequestException", () => {
      expect(() =>
        FileStatusStateMachine.validateTransition(
          FileStatus.COMPLETED,
          "INVALID" as FileStatus,
        ),
      ).toThrow(BadRequestException);
    });
  });
});
