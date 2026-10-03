import { describe, expect, it } from 'vitest';

import {
  evaluateCrossProjectTransfer,
  type TransferDomain,
  type TransferSettings,
} from './policy';

const P = (id: string, domain: TransferDomain = 'project') => ({ id, domain });

const ALL: TransferSettings = {
  transferOutToProject: 'ALL',
  transferOutToPersonalSpace: 'ALL',
  transferOutToLibrary: 'ALL',
  transferInFromProject: 'ALL',
  transferInFromPersonalSpace: 'ALL',
  transferInFromLibrary: 'ALL',
};

describe('@cloudcad/platform · transfer/policy', () => {
  it('同根 → 无跨项目约束', () => {
    expect(
      evaluateCrossProjectTransfer({
        operation: 'move',
        source: P('a'),
        target: P('a'),
        sourceSettings: null,
        targetSettings: null,
      })
    ).toEqual({ allowed: true, crossProject: false });
  });

  it('源为库：move 恒拒绝，copy 豁免', () => {
    const lib = P('lib', 'library');
    expect(
      evaluateCrossProjectTransfer({
        operation: 'move',
        source: lib,
        target: P('p1'),
        sourceSettings: null,
        targetSettings: ALL,
      })
    ).toEqual({
      allowed: false,
      crossProject: true,
      reason: 'LIBRARY_MOVE_FORBIDDEN',
    });
    expect(
      evaluateCrossProjectTransfer({
        operation: 'copy',
        source: lib,
        target: P('p1'),
        sourceSettings: null,
        targetSettings: ALL,
      })
    ).toEqual({ allowed: true, crossProject: true });
  });

  it('出向：源为项目按目标域查 transferOut*；缺失保守拒绝；模式不匹配', () => {
    const src: TransferSettings = { transferOutToPersonalSpace: 'MOVE_ONLY' };
    expect(
      evaluateCrossProjectTransfer({
        operation: 'copy',
        source: P('a'),
        target: P('ps', 'personalSpace'),
        sourceSettings: src,
        targetSettings: null,
      })
    ).toEqual({
      allowed: false,
      crossProject: true,
      reason: 'SOURCE_MODE_MISMATCH',
    });
    expect(
      evaluateCrossProjectTransfer({
        operation: 'move',
        source: P('a'),
        target: P('ps', 'personalSpace'),
        sourceSettings: src,
        targetSettings: null,
      })
    ).toEqual({ allowed: true, crossProject: true });
    expect(
      evaluateCrossProjectTransfer({
        operation: 'move',
        source: P('a'),
        target: P('ps', 'personalSpace'),
        sourceSettings: null,
        targetSettings: null,
      })
    ).toEqual({
      allowed: false,
      crossProject: true,
      reason: 'SOURCE_PROJECT_FORBIDDEN',
    });
  });

  it('字段为 null（查询成功但未配置）→ 按默认放行（对齐后端 modeAllows(null → true)）', () => {
    // 出向：源为项目，transferOut* 字段为 null → 放行
    expect(
      evaluateCrossProjectTransfer({
        operation: 'move',
        source: P('a'),
        target: P('ps', 'personalSpace'),
        sourceSettings: { transferOutToPersonalSpace: null },
        targetSettings: null,
      })
    ).toEqual({ allowed: true, crossProject: true });
    // 入向：目标为项目，transferIn* 字段为 null → 放行
    expect(
      evaluateCrossProjectTransfer({
        operation: 'move',
        source: P('ps', 'personalSpace'),
        target: P('b'),
        sourceSettings: null,
        targetSettings: { transferInFromPersonalSpace: null },
      })
    ).toEqual({ allowed: true, crossProject: true });
  });

  it('查询失败（settings 整体为 null）→ 保守拒绝，与「字段 null」区分', () => {
    expect(
      evaluateCrossProjectTransfer({
        operation: 'move',
        source: P('a'),
        target: P('b'),
        sourceSettings: null,
        targetSettings: { transferInFromProject: 'ALL' },
      })
    ).toEqual({
      allowed: false,
      crossProject: true,
      reason: 'SOURCE_PROJECT_FORBIDDEN',
    });
    expect(
      evaluateCrossProjectTransfer({
        operation: 'move',
        source: P('ps', 'personalSpace'),
        target: P('b'),
        sourceSettings: null,
        targetSettings: null,
      })
    ).toEqual({
      allowed: false,
      crossProject: true,
      reason: 'TARGET_PROJECT_FORBIDDEN',
    });
  });

  it('入向：目标为项目按源域查 transferIn*', () => {
    const tgt: TransferSettings = { transferInFromPersonalSpace: 'COPY_ONLY' };
    expect(
      evaluateCrossProjectTransfer({
        operation: 'move',
        source: P('ps', 'personalSpace'),
        target: P('b'),
        sourceSettings: null,
        targetSettings: tgt,
      })
    ).toEqual({
      allowed: false,
      crossProject: true,
      reason: 'TARGET_MODE_MISMATCH',
    });
    expect(
      evaluateCrossProjectTransfer({
        operation: 'copy',
        source: P('ps', 'personalSpace'),
        target: P('b'),
        sourceSettings: null,
        targetSettings: tgt,
      })
    ).toEqual({ allowed: true, crossProject: true });
  });
});
