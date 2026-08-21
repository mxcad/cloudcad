import { describe, expect, it } from 'vitest';
import {
  evaluateCrossProjectPaste,
  evaluateCrossProjectTransfer,
  TRANSFER_BLOCK_REASONS,
} from './crossProjectPaste';

const PROJECT_A = 'project-a';
const PROJECT_B = 'project-b';

describe('evaluateCrossProjectTransfer（跨项目转移 6 域矩阵）', () => {
  it('同项目恒放行，不判为跨项目', () => {
    expect(
      evaluateCrossProjectTransfer({
        operation: 'move',
        sourceProjectId: PROJECT_A,
        targetProjectId: PROJECT_A,
      })
    ).toEqual({ allowed: true, crossProject: false });
  });

  it('任一侧 id 缺失恒放行', () => {
    expect(
      evaluateCrossProjectTransfer({
        operation: 'move',
        sourceProjectId: '',
        targetProjectId: PROJECT_B,
      })
    ).toEqual({ allowed: true, crossProject: false });
    expect(
      evaluateCrossProjectTransfer({
        operation: 'copy',
        sourceProjectId: PROJECT_A,
        targetProjectId: '',
      })
    ).toEqual({ allowed: true, crossProject: false });
  });

  describe('项目 → 项目（targetRootKind=project）', () => {
    it('源出向查询失败（settings null）→ 保守拒绝', () => {
      const verdict = evaluateCrossProjectTransfer({
        operation: 'move',
        sourceProjectId: PROJECT_A,
        targetProjectId: PROJECT_B,
        sourceSettings: null,
        targetSettings: { transferInFromProject: 'ALL' },
      });
      expect(verdict).toEqual({
        allowed: false,
        crossProject: true,
        reasonKey: TRANSFER_BLOCK_REASONS.SOURCE_PROJECT_FORBIDDEN,
      });
    });

    it('源出向 NONE → 拒绝（MODE_MISMATCH）', () => {
      const verdict = evaluateCrossProjectTransfer({
        operation: 'move',
        sourceProjectId: PROJECT_A,
        targetProjectId: PROJECT_B,
        sourceSettings: { transferOutToProject: 'NONE' },
        targetSettings: { transferInFromProject: 'ALL' },
      });
      expect(verdict.reasonKey).toBe(
        TRANSFER_BLOCK_REASONS.SOURCE_MODE_MISMATCH
      );
      expect(verdict.allowed).toBe(false);
    });

    it('源出向 COPY_ONLY：move 拒绝、copy 放行', () => {
      const base = {
        sourceProjectId: PROJECT_A,
        targetProjectId: PROJECT_B,
        sourceSettings: { transferOutToProject: 'COPY_ONLY' },
        targetSettings: { transferInFromProject: 'ALL' },
      };
      expect(
        evaluateCrossProjectTransfer({ ...base, operation: 'move' }).allowed
      ).toBe(false);
      expect(
        evaluateCrossProjectTransfer({ ...base, operation: 'copy' })
      ).toEqual({ allowed: true, crossProject: true });
    });

    it('源出向 MOVE_ONLY：copy 拒绝、move 放行', () => {
      const base = {
        sourceProjectId: PROJECT_A,
        targetProjectId: PROJECT_B,
        sourceSettings: { transferOutToProject: 'MOVE_ONLY' },
        targetSettings: { transferInFromProject: 'ALL' },
      };
      expect(
        evaluateCrossProjectTransfer({ ...base, operation: 'copy' }).allowed
      ).toBe(false);
      expect(
        evaluateCrossProjectTransfer({ ...base, operation: 'move' }).allowed
      ).toBe(true);
    });

    it('源出向 ALL → 放行', () => {
      const verdict = evaluateCrossProjectTransfer({
        operation: 'move',
        sourceProjectId: PROJECT_A,
        targetProjectId: PROJECT_B,
        sourceSettings: { transferOutToProject: 'ALL' },
        targetSettings: { transferInFromProject: 'ALL' },
      });
      expect(verdict).toEqual({ allowed: true, crossProject: true });
    });

    it('目标入向查询失败 → 保守拒绝', () => {
      const verdict = evaluateCrossProjectTransfer({
        operation: 'copy',
        sourceProjectId: PROJECT_A,
        targetProjectId: PROJECT_B,
        sourceSettings: { transferOutToProject: 'ALL' },
        targetSettings: null,
      });
      expect(verdict).toEqual({
        allowed: false,
        crossProject: true,
        reasonKey: TRANSFER_BLOCK_REASONS.TARGET_PROJECT_FORBIDDEN,
      });
    });

    it('目标入向 NONE → 拒绝（TARGET_MODE_MISMATCH）', () => {
      const verdict = evaluateCrossProjectTransfer({
        operation: 'move',
        sourceProjectId: PROJECT_A,
        targetProjectId: PROJECT_B,
        sourceSettings: { transferOutToProject: 'ALL' },
        targetSettings: { transferInFromProject: 'NONE' },
      });
      expect(verdict.reasonKey).toBe(
        TRANSFER_BLOCK_REASONS.TARGET_MODE_MISMATCH
      );
      expect(verdict.allowed).toBe(false);
    });
  });

  describe('项目 → 个人空间（targetRootKind=personal-space）', () => {
    it('出向按 transferOutToPersonalSpace 判定（默认 NONE → 拒绝）', () => {
      const verdict = evaluateCrossProjectTransfer({
        operation: 'move',
        sourceProjectId: PROJECT_A,
        targetProjectId: 'personal-space',
        targetRootKind: 'personal-space',
        sourceSettings: { transferOutToPersonalSpace: 'NONE' },
      });
      expect(verdict.allowed).toBe(false);
      expect(verdict.reasonKey).toBe(
        TRANSFER_BLOCK_REASONS.SOURCE_MODE_MISMATCH
      );
    });

    it('出向 COPY_ONLY：move 拒绝、copy 放行；不查目标入向', () => {
      const base = {
        operation: 'move' as const,
        sourceProjectId: PROJECT_A,
        targetProjectId: 'personal-space',
        targetRootKind: 'personal-space' as const,
        sourceSettings: { transferOutToPersonalSpace: 'COPY_ONLY' },
        targetSettings: null, // 目标非项目，不应查询
      };
      expect(
        evaluateCrossProjectTransfer({ ...base, operation: 'move' }).allowed
      ).toBe(false);
      expect(
        evaluateCrossProjectTransfer({ ...base, operation: 'copy' })
      ).toEqual({ allowed: true, crossProject: true });
    });
  });

  describe('个人空间 → 项目（sourceRootKind=personal-space）', () => {
    it('不查源出向；入向按 transferInFromPersonalSpace 判定', () => {
      const base = {
        operation: 'move' as const,
        sourceProjectId: 'personal-space',
        targetProjectId: PROJECT_B,
        sourceRootKind: 'personal-space' as const,
        sourceSettings: null, // 源非项目，不应查询
      };
      expect(
        evaluateCrossProjectTransfer({
          ...base,
          targetSettings: { transferInFromPersonalSpace: 'NONE' },
        }).allowed
      ).toBe(false);
      expect(
        evaluateCrossProjectTransfer({
          ...base,
          targetSettings: { transferInFromPersonalSpace: 'ALL' },
        })
      ).toEqual({ allowed: true, crossProject: true });
    });
  });
});

describe('evaluateCrossProjectPaste（剪贴板粘贴薄封装）', () => {
  it('cut → move 语义（COPY_ONLY 源拒绝）', () => {
    const verdict = evaluateCrossProjectPaste({
      mode: 'cut',
      sourceProjectId: PROJECT_A,
      targetProjectId: PROJECT_B,
      sourceTransferOut: 'COPY_ONLY',
      targetTransferIn: 'ALL',
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reasonKey).toBe(TRANSFER_BLOCK_REASONS.SOURCE_MODE_MISMATCH);
  });

  it('copy → copy 语义（COPY_ONLY 源放行）', () => {
    const verdict = evaluateCrossProjectPaste({
      mode: 'copy',
      sourceProjectId: PROJECT_A,
      targetProjectId: PROJECT_B,
      sourceTransferOut: 'COPY_ONLY',
      targetTransferIn: 'ALL',
    });
    expect(verdict).toEqual({ allowed: true, crossProject: true });
  });

  it('源快照缺失（查询失败）→ 保守拒绝', () => {
    const verdict = evaluateCrossProjectPaste({
      mode: 'copy',
      sourceProjectId: PROJECT_A,
      targetProjectId: PROJECT_B,
      sourceTransferOut: null,
      targetTransferIn: 'ALL',
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reasonKey).toBe(
      TRANSFER_BLOCK_REASONS.SOURCE_PROJECT_FORBIDDEN
    );
  });
});
