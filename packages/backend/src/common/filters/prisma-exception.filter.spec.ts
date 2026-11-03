///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { extractUniqueConstraintFields } from './prisma-exception.filter';

describe('extractUniqueConstraintFields', () => {
  it('解析 Prisma 7 字符串约束名（单列）', () => {
    // roles.name 唯一约束
    expect(extractUniqueConstraintFields('roles_name_key')).toBe('name');
    // users.username 唯一约束
    expect(extractUniqueConstraintFields('users_username_key')).toBe('username');
    // users.email 唯一约束
    expect(extractUniqueConstraintFields('users_email_key')).toBe('email');
  });

  it('解析带下划线表名的约束名（最长表前缀匹配）', () => {
    // file_system_nodes 表 + 单列唯一约束
    expect(extractUniqueConstraintFields('file_system_nodes_token_key')).toBe('token');
    // file_shares.token 唯一约束
    expect(extractUniqueConstraintFields('file_shares_token_key')).toBe('token');
  });

  it('解析复合约束（多个字段以逗号连接）', () => {
    // 假设某表复合唯一约束 (name, parentId)
    expect(
      extractUniqueConstraintFields('file_system_nodes_name_parentId_key')
    ).toBe('name, parentId');
  });

  it('旧 Prisma 数组 target 直接连接', () => {
    expect(extractUniqueConstraintFields(['email'])).toBe('email');
    expect(extractUniqueConstraintFields(['name', 'parentId'])).toBe(
      'name, parentId'
    );
    expect(extractUniqueConstraintFields([])).toBe('');
  });

  it('无法反解时回退为原字符串，避免字段名丢失成空', () => {
    // 未知表名 → 剥掉 _key 后原样返回（不丢字段）
    expect(extractUniqueConstraintFields('unknown_table_field_key')).toBe(
      'unknown_table_field'
    );
  });

  it('空值 / 非字符串返回空', () => {
    expect(extractUniqueConstraintFields(undefined)).toBe('');
    expect(extractUniqueConstraintFields(null)).toBe('');
    expect(extractUniqueConstraintFields(123)).toBe('');
    expect(extractUniqueConstraintFields('')).toBe('');
  });

  it('Prisma 7 + driver adapter：字段在 cause.constraint.fields（meta.target 缺失）', () => {
    const meta = {
      modelName: 'Role',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '23505',
          originalMessage:
            'duplicate key value violates unique constraint "roles_name_key"',
          kind: 'UniqueConstraintViolation',
          constraint: { fields: ['name'] },
        },
      },
    };
    expect(extractUniqueConstraintFields(meta)).toBe('name');
  });

  it('Prisma 7 + driver adapter：无 constraint.fields 时从 originalMessage 反解约束名', () => {
    const meta = {
      driverAdapterError: {
        cause: {
          originalMessage:
            'duplicate key value violates unique constraint "file_system_nodes_token_key"',
          kind: 'UniqueConstraintViolation',
        },
      },
    };
    expect(extractUniqueConstraintFields(meta)).toBe('token');
  });

  it('Prisma 7 + driver adapter：复合约束字段', () => {
    const meta = {
      driverAdapterError: {
        cause: {
          constraint: { fields: ['name', 'parentId'] },
        },
      },
    };
    expect(extractUniqueConstraintFields(meta)).toBe('name, parentId');
  });
});
