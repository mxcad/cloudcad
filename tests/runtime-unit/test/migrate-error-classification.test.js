/**
 * L1 特征测试 —— commands/migrate.js 迁移错误串判定纯函数（架构审查 ⑨）
 *
 * 目的：锁定 Prisma/PG 错误码 →「可安全继续」的语义判定。这些判定此前散在各 async
 * 函数里内联（P3018 / P3008 / 42P07 等 / 22P02 / CREATE INDEX CONCURRENTLY），
 * 错误码一旦变动会在部署时静默误判（把"变更已存在"当致命错误中断部署，或反之吞掉
 * 真错误）。抽成纯函数后，错误码语义集中且可单测。
 */

let migrate;

beforeAll(() => {
  migrate = require('../../../runtime/scripts/commands/migrate');
});

afterAll(() => {
  jest.resetModules();
});

describe('isAlreadyRolledBackError（P3018 = 已 rolled back，幂等视为成功）', () => {
  test('stderr 含 P3018 → true', () => {
    expect(migrate.isAlreadyRolledBackError('Error: P3018: Migration already rolled back')).toBe(true);
  });

  test('stderr 无 P3018（其他错误码）→ false', () => {
    expect(migrate.isAlreadyRolledBackError('Error: P3006: Migration not found')).toBe(false);
  });

  test('空串 / 非字符串 → false', () => {
    expect(migrate.isAlreadyRolledBackError('')).toBe(false);
    expect(migrate.isAlreadyRolledBackError(null)).toBe(false);
    expect(migrate.isAlreadyRolledBackError(undefined)).toBe(false);
  });
});

describe('isAlreadyAppliedError（P3008 = 已 applied，幂等可继续）', () => {
  test('stderr 含 P3008 → true', () => {
    expect(migrate.isAlreadyAppliedError('Error: P3008: Migration already recorded as applied')).toBe(true);
  });

  test('stderr 是 P3018（rolled back，非 applied）→ false', () => {
    expect(migrate.isAlreadyAppliedError('Error: P3018: rolled back')).toBe(false);
  });

  test('非字符串 → false', () => {
    expect(migrate.isAlreadyAppliedError(null)).toBe(false);
  });
});

describe('isAlreadyExistsError（变更已存在 → 可标记 applied 继续）', () => {
  test('识别 already exists / 42P07 / 42710 / 42701 / 42P16', () => {
    expect(migrate.isAlreadyExistsError('relation "file_system_nodes" already exists')).toBe(true);
    expect(migrate.isAlreadyExistsError('Error: 42P07: relation already exists')).toBe(true);
    expect(migrate.isAlreadyExistsError('42710: duplicate object name')).toBe(true);
    expect(migrate.isAlreadyExistsError('42701: too many columns')).toBe(true);
    expect(migrate.isAlreadyExistsError('42P16: invalid table definition')).toBe(true);
  });

  test('普通错误（语法/约束）→ false', () => {
    expect(migrate.isAlreadyExistsError('Error: syntax error at or near "FOO"')).toBe(false);
    expect(migrate.isAlreadyExistsError('Error: null value violates not-null constraint')).toBe(false);
  });

  test('非字符串 → false', () => {
    expect(migrate.isAlreadyExistsError(undefined)).toBe(false);
  });
});

describe('isEnumValueRemovedError（enum 值已不合法 → 可标记 applied 继续）', () => {
  test('22P02 + invalid input value for enum → true', () => {
    expect(
      migrate.isEnumValueRemovedError('Error: 22P02: invalid input value for enum "user_status"'),
    ).toBe(true);
  });

  test('仅 22P02 无 enum 上下文（如数值溢出）→ false', () => {
    expect(migrate.isEnumValueRemovedError('Error: 22P02: numeric field overflow')).toBe(false);
  });

  test('仅 enum 文案无 22P02 错误码 → false', () => {
    expect(migrate.isEnumValueRemovedError('invalid input value for enum "user_status"')).toBe(false);
  });
});

describe('hasConcurrentIndexCreation（零停机索引 CREATE INDEX CONCURRENTLY）', () => {
  test('含 CREATE INDEX CONCURRENTLY → true', () => {
    expect(migrate.hasConcurrentIndexCreation('CREATE INDEX CONCURRENTLY idx ON t (c);')).toBe(true);
  });

  test('普通 CREATE INDEX（阻塞式）→ false', () => {
    expect(migrate.hasConcurrentIndexCreation('CREATE INDEX idx ON t (c);')).toBe(false);
  });

  test('空串 / 非字符串 → false', () => {
    expect(migrate.hasConcurrentIndexCreation('')).toBe(false);
    expect(migrate.hasConcurrentIndexCreation(undefined)).toBe(false);
  });
});
