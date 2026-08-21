/**
 * L1 基线测试 —— config-updater.js 纯函数
 *
 * 目的：在 Step A 拆分之前，用测试锁定这些纯函数的当前行为。
 * 若后续拆分（Step A/B）重构这些函数，本测试保证行为不漂移。
 *
 * 被测模块：runtime/scripts/config-updater.js（无顶层副作用，可安全 require）
 */
const {
  parseEnvContent,
  serializeEnvContent,
  parseEnvToBlocks,
  serializeBlocks,
  mergeExampleIntoEnv,
} = require('../../../runtime/scripts/config-updater');

// ==================== parseEnvContent ====================

describe('parseEnvContent', () => {
  test('解析普通键值对', () => {
    const input = ['DB_HOST=localhost', 'DB_PORT=5432', ''].join('\n');
    expect(parseEnvContent(input)).toEqual({
      DB_HOST: 'localhost',
      DB_PORT: '5432',
    });
  });

  test('跳过空行和注释行', () => {
    const input = [
      '# 这是一个注释',
      '',
      'A=1',
      '# 注释在中间',
      'B=2',
    ].join('\n');
    expect(parseEnvContent(input)).toEqual({ A: '1', B: '2' });
  });

  test('去除值的首尾引号', () => {
    const input = ['NAME="admin"', 'PASSWORD=\'secret\''].join('\n');
    expect(parseEnvContent(input)).toEqual({ NAME: 'admin', PASSWORD: 'secret' });
  });

  test('值含等号时只按第一个等号拆分', () => {
    const input = ['URL=https://a=b.com', ''].join('\n');
    expect(parseEnvContent(input)).toEqual({ URL: 'https://a=b.com' });
  });

  test('空内容返回空对象', () => {
    expect(parseEnvContent('')).toEqual({});
  });
});

// ==================== serializeEnvContent ====================

describe('serializeEnvContent', () => {
  test('保持原有行顺序和注释', () => {
    const original = ['# 顶部注释', 'A=old', '', 'B=old'].join('\n');
    const output = serializeEnvContent({ A: 'new', B: 'new2' }, original);
    expect(output).toEqual(['# 顶部注释', 'A=new', '', 'B=new2'].join('\n'));
  });

  test('更新已有 key 的新值', () => {
    const original = 'A=old\nB=keep';
    const output = serializeEnvContent({ A: 'new' }, original);
    expect(output).toContain('A=new');
    expect(output).toContain('B=keep'); // 未提及的 key 保留原值
  });

  test('追加新增 key 到末尾', () => {
    const original = 'A=1';
    const output = serializeEnvContent({ A: '1', NEW_KEY: 'x' }, original);
    expect(output).toContain('A=1');
    expect(output).toContain('# ===== 新增配置项 =====');
    expect(output).toContain('NEW_KEY=x');
  });

  test('无 originalContent 时输出全部 key', () => {
    const output = serializeEnvContent({ A: '1', B: '2' });
    expect(output).toContain('A=1');
    expect(output).toContain('B=2');
  });
});

// ==================== parseEnvToBlocks ====================

describe('parseEnvToBlocks', () => {
  test('识别 section_header 区块', () => {
    const input = ['# ===== 数据库配置 =====', 'DB=1'].join('\n');
    const blocks = parseEnvToBlocks(input);
    const header = blocks.find((b) => b.type === 'section_header');
    expect(header).toBeTruthy();
    expect(header.lines[0]).toContain('=====');
  });

  test('识别 keyvalue 区块（上方注释为独立 comment 块）', () => {
    const input = ['# 端口', 'PORT=3000'].join('\n');
    const blocks = parseEnvToBlocks(input);
    const kv = blocks.find((b) => b.type === 'keyvalue' && b.key === 'PORT');
    expect(kv).toBeTruthy();
    expect(kv.value).toBe('3000');
    // 真实行为：注释行归入独立 comment 块，keyvalue 块不含注释
    expect(kv.lines).toEqual(['PORT=3000']);
    const comment = blocks.find((b) => b.type === 'comment');
    expect(comment.lines).toEqual(['# 端口']);
  });

  test('识别 commented_keyvalue（注释掉的变量）', () => {
    const input = ['# THUMBNAIL_BG=0x000000'].join('\n');
    const blocks = parseEnvToBlocks(input);
    const ck = blocks.find((b) => b.type === 'commented_keyvalue');
    expect(ck).toBeTruthy();
    expect(ck.key).toBe('THUMBNAIL_BG');
    expect(ck.value).toBe('0x000000');
  });

  test('空行归入 comment 块', () => {
    const input = ['A=1', '', 'B=2'].join('\n');
    const blocks = parseEnvToBlocks(input);
    expect(blocks.some((b) => b.type === 'comment')).toBe(true);
  });

  test('普通游离注释归入 comment 块', () => {
    const input = ['# 游离注释', ''].join('\n');
    const blocks = parseEnvToBlocks(input);
    const comments = blocks.filter((b) => b.type === 'comment');
    expect(comments.length).toBeGreaterThanOrEqual(1);
  });
});

// ==================== serializeBlocks ====================

describe('serializeBlocks', () => {
  test('将区块序列化回 .env 字符串', () => {
    const blocks = [
      { type: 'keyvalue', lines: ['A=1'] },
      { type: 'comment', lines: [''] },
      { type: 'keyvalue', lines: ['B=2'] },
    ];
    expect(serializeBlocks(blocks)).toBe('A=1\n\nB=2');
  });

  test('空区块列表返回空字符串', () => {
    expect(serializeBlocks([])).toBe('');
  });
});

// ==================== mergeExampleIntoEnv ====================

describe('mergeExampleIntoEnv', () => {
  test('以 example 为骨架，保留用户已存在的 value', () => {
    const env = 'A=user_value\nB=user_b';
    const example = 'A=example_a\nB=example_b\nC=example_c';
    const output = mergeExampleIntoEnv(env, example);
    expect(output).toContain('A=user_value'); // 用户值保留
    expect(output).toContain('B=user_b');
    expect(output).toContain('C=example_c'); // 新 key 从 example 插入
  });

  test('example 中注释掉的变量，若用户已定义则激活（取消注释）', () => {
    const env = 'X=user_x';
    const example = '# X=example_x\nY=example_y';
    const output = mergeExampleIntoEnv(env, example);
    expect(output).toContain('X=user_x'); // 激活，用户值保留
    expect(output).not.toContain('# X='); // 不再以注释形式存在
  });

  test('example 中注释掉的变量，若用户未定义则保持注释', () => {
    const env = 'A=1';
    const example = '# Z=9\nA=example_a';
    const output = mergeExampleIntoEnv(env, example);
    expect(output).toContain('# Z=9'); // 保持注释
  });

  test('追加 .env 中有但 example 中没有的用户自定义 key', () => {
    const env = 'A=1\nMY_CUSTOM=abc';
    const example = 'A=example_a';
    const output = mergeExampleIntoEnv(env, example);
    expect(output).toContain('# ===== 用户自定义配置 =====');
    expect(output).toContain('MY_CUSTOM=abc');
  });

  test('example 区块间的空行被原样保留（不压缩）', () => {
    const env = 'A=1';
    const example = ['# ==== 块1 ====', 'A=example_a', '', '', '# ==== 块2 ====', 'B=b'].join('\n');
    const output = mergeExampleIntoEnv(env, example);
    // 真实行为：example 的空行作为 comment 块被原样保留
    expect(output).toContain('\n\n\n');
    expect(output).toMatch(/# ==== 块1 ====\nA=1\n\n\n# ==== 块2 ====\nB=b/);
  });
});
