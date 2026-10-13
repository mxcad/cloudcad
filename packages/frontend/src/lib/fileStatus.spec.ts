import { describe, expect, it } from 'vitest';
import {
  FILE_STATUS,
  TERMINAL_FAILURE_STATUSES,
  hasReadyArtifact,
  isCompletedStatus,
  isDeletedStatus,
  isFailedStatus,
  isProcessingStatus,
  isTerminalFailureStatus,
  isUploadingStatus,
} from './fileStatus';

describe('FILE_STATUS 词表', () => {
  it('与后端 Prisma FileStatus 枚举的 5 个值逐字一致', () => {
    expect(Object.keys(FILE_STATUS)).toEqual([
      'UPLOADING',
      'PROCESSING',
      'COMPLETED',
      'FAILED',
      'DELETED',
    ]);
    expect(FILE_STATUS.COMPLETED).toBe('COMPLETED');
    expect(FILE_STATUS.DELETED).toBe('DELETED');
  });
});

describe('isTerminalFailureStatus', () => {
  it('FAILED 与 DELETED 均为终态失败', () => {
    expect(isTerminalFailureStatus('FAILED')).toBe(true);
    expect(isTerminalFailureStatus('DELETED')).toBe(true);
  });

  it('UPLOADING / PROCESSING / COMPLETED 均非终态失败', () => {
    expect(isTerminalFailureStatus('UPLOADING')).toBe(false);
    expect(isTerminalFailureStatus('PROCESSING')).toBe(false);
    expect(isTerminalFailureStatus('COMPLETED')).toBe(false);
  });

  it('未知值、null、undefined 一律视为未知而非失败', () => {
    expect(isTerminalFailureStatus('')).toBe(false);
    expect(isTerminalFailureStatus(undefined)).toBe(false);
    expect(isTerminalFailureStatus(null)).toBe(false);
    expect(isTerminalFailureStatus('NO_SUCH_STATUS')).toBe(false);
  });

  it('终态集合本身只含 FAILED 与 DELETED', () => {
    expect([...TERMINAL_FAILURE_STATUSES].sort()).toEqual([
      'DELETED',
      'FAILED',
    ]);
  });
});

describe('isFailedStatus', () => {
  it('只认 FAILED——DELETED 不算「转换失败」', () => {
    expect(isFailedStatus('FAILED')).toBe(true);
    expect(isFailedStatus('DELETED')).toBe(false);
  });

  it('其余状态与空值均非 FAILED', () => {
    for (const s of ['UPLOADING', 'PROCESSING', 'COMPLETED', '', undefined, null]) {
      expect(isFailedStatus(s)).toBe(false);
    }
  });
});

describe('其余单值谓词', () => {
  it('各自只对自己的值返回 true，空值一律 false', () => {
    expect(isCompletedStatus('COMPLETED')).toBe(true);
    expect(isProcessingStatus('PROCESSING')).toBe(true);
    expect(isUploadingStatus('UPLOADING')).toBe(true);
    expect(isDeletedStatus('DELETED')).toBe(true);

    expect(isCompletedStatus('FAILED')).toBe(false);
    expect(isCompletedStatus(undefined)).toBe(false);
    expect(isProcessingStatus('COMPLETED')).toBe(false);
    expect(isUploadingStatus('')).toBe(false);
    expect(isDeletedStatus(null)).toBe(false);
  });
});

describe('hasReadyArtifact —— 引擎打开口径的唯一就绪判据', () => {
  it('fileHash 与 path 齐备才算就绪', () => {
    expect(
      hasReadyArtifact({ fileHash: 'abc', path: '/202610/n1/a.mxweb' })
    ).toBe(true);
  });

  it('是类型谓词：调用方拿到 fileHash/path 的非空收窄', () => {
    const node: { fileHash?: string | null; path?: string | null } = {
      fileHash: 'abc',
      path: '/x.mxweb',
    };
    if (hasReadyArtifact(node)) {
      expect(node.fileHash.length).toBeGreaterThan(0);
      expect(node.path.length).toBeGreaterThan(0);
    }
  });

  it('缺任一项即未就绪', () => {
    expect(hasReadyArtifact({ fileHash: 'abc', path: null })).toBe(false);
    expect(hasReadyArtifact({ fileHash: null, path: '/x.mxweb' })).toBe(false);
    expect(hasReadyArtifact({ fileHash: 'abc', path: '' })).toBe(false);
    expect(hasReadyArtifact({ fileHash: '', path: '/x.mxweb' })).toBe(false);
  });

  it('空对象、null、undefined 均视为未就绪', () => {
    expect(hasReadyArtifact({})).toBe(false);
    expect(hasReadyArtifact(null)).toBe(false);
    expect(hasReadyArtifact(undefined)).toBe(false);
  });

  it('就绪不等于「状态已翻到 COMPLETED」——path 就位即就绪', () => {
    // 落盘已完成但节点状态尚未刷新的窗口：产物可用，不能因为状态滞后就重发转换
    expect(hasReadyArtifact({ fileHash: 'abc', path: '/x.mxweb' })).toBe(true);
    expect(isCompletedStatus('UPLOADING')).toBe(false);
  });
});
