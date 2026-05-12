///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException } from '@nestjs/common';
import { FileStatus } from '../../common/enums/file-status.enum';

/**
 * 文件状态生命周期状态机
 *
 * 封装 FileStatus 的所有合法状态转换规则。
 * 集中管理转换校验，避免转换逻辑散落在多个 service 中。
 *
 * 合法转换：
 * ```
 * UPLOADING  → PROCESSING | DELETED
 * PROCESSING → COMPLETED  | FAILED
 * COMPLETED  → DELETED
 * FAILED     → DELETED
 * DELETED    → COMPLETED
 * ```
 *
 * null 向后兼容：from 为 null 时视为 COMPLETED（历史数据无 fileStatus）
 */
export class FileStatusStateMachine {
  /**
   * 合法转换映射
   */
  private static readonly TRANSITIONS: Record<FileStatus, FileStatus[]> = {
    [FileStatus.UPLOADING]: [FileStatus.PROCESSING, FileStatus.DELETED],
    [FileStatus.PROCESSING]: [FileStatus.COMPLETED, FileStatus.FAILED],
    [FileStatus.COMPLETED]: [FileStatus.DELETED],
    [FileStatus.FAILED]: [FileStatus.DELETED],
    [FileStatus.DELETED]: [FileStatus.COMPLETED],
  };

  /**
   * 有效状态值集合（用于校验无效枚举值）
   */
  private static readonly VALID_STATUSES: Set<string> = new Set(
    Object.values(FileStatus),
  );

  /**
   * null 等价的默认状态（向后兼容历史数据）
   */
  private static readonly NULL_EQUIVALENT = FileStatus.COMPLETED;

  /**
   * 规范化 from 值：null → COMPLETED
   */
  private static normalizeFrom(from: FileStatus | null): FileStatus {
    if (from === null || from === undefined) {
      return FileStatusStateMachine.NULL_EQUIVALENT;
    }
    return from;
  }

  /**
   * 校验状态值是否在枚举中
   */
  private static validateStatus(
    status: unknown,
    role: 'from' | 'to',
  ): FileStatus {
    if (
      typeof status !== 'string' ||
      !FileStatusStateMachine.VALID_STATUSES.has(status)
    ) {
      throw new BadRequestException(
        `非法的文件状态值 "${String(status)}" (角色: ${role})`,
      );
    }
    return status as FileStatus;
  }

  /**
   * 查询转换是否合法（不抛异常）
   *
   * @param from 当前状态，null 视为 COMPLETED（向后兼容历史数据）
   * @param to   目标状态
   * @returns true 表示转换合法
   */
  static canTransition(from: FileStatus | null, to: FileStatus): boolean {
    // 校验 to 是否为已知状态值
    if (!FileStatusStateMachine.VALID_STATUSES.has(to)) {
      return false;
    }

    const normalizedFrom = FileStatusStateMachine.normalizeFrom(from);

    // 校验 normalizedFrom 是否为已知状态值
    if (!FileStatusStateMachine.VALID_STATUSES.has(normalizedFrom)) {
      return false;
    }

    const allowedTargets = FileStatusStateMachine.TRANSITIONS[normalizedFrom];
    return allowedTargets !== undefined && allowedTargets.includes(to);
  }

  /**
   * 验证状态转换是否合法，不合法则抛出 BadRequestException
   *
   * @param from 当前状态，null 视为 COMPLETED（向后兼容历史数据）
   * @param to   目标状态
   * @throws BadRequestException 当转换不合法时
   */
  static validateTransition(from: FileStatus | null, to: FileStatus): void {
    // 先校验状态值的有效性
    const validatedTo = FileStatusStateMachine.validateStatus(to, 'to');
    const normalizedFrom =
      from !== null && from !== undefined
        ? FileStatusStateMachine.validateStatus(from, 'from')
        : FileStatusStateMachine.normalizeFrom(from);

    if (!FileStatusStateMachine.canTransition(normalizedFrom, validatedTo)) {
      throw new BadRequestException(
        `非法的文件状态转换: "${normalizedFrom}" → "${validatedTo}"`,
      );
    }
  }
}
