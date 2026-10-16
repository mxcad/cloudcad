/**
 * env-files.js 回归测试（jest，tests/runtime-unit）
 *
 * 目标：钉住「.env 模板创建」的唯一事实源语义，防止 postinstall 与离线部署包
 * 两条路径出现第二份拷贝逻辑。
 *
 * 关键不变式：
 * - 目标已存在即跳过，绝不覆盖（已有配置可能含本地修改或密钥）
 * - 只拷缺失，不做 merge
 * - 目标内容逐字节等于模板（模板含 GBK 编码中文注释，任何重写编码都会损坏）
 * - 仅 backend .env 填充空白密钥（唯一在生产模式校验必填项的服务）
 * - 权限收紧 600（#424 等保）
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ENV_EXAMPLE_NAME,
  ENV_TARGETS,
  resolveEnvFiles,
  createEnvFilesFromExamples,
} = require('../../../runtime/scripts/lib/env-files');

const silent = { log: () => {}, error: () => {} };

/** 在临时目录搭一棵最小的项目树（只建模板，不建目标） */
function makeProjectRoot(templates = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'env-files-'));
  for (const [dirName, content] of Object.entries(templates)) {
    const dir = path.join(root, ...dirName.split('/'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ENV_EXAMPLE_NAME), content);
  }
  return root;
}

// 不含空白密钥的模板：用于验证「逐字节相同」，密钥填充由专门的用例覆盖
const BACKEND_EXAMPLE = [
  '# 模板含中文注释',
  'DATABASE_URL=postgresql://postgres:password@localhost:5432/cloudcad',
  'DB_PORT=5432',
  '',
].join('\n');

// 含一个空白必填密钥：backend 生产模式校验项，首次部署必须自动填充
const BACKEND_EXAMPLE_WITH_SECRET = [
  BACKEND_EXAMPLE,
  'REDIS_PASSWORD=',
].join('\n');

describe('ENV_TARGETS 清单', () => {
  test('固定三个目标，前端用 .env.local 而非 .env', () => {
    expect(ENV_TARGETS).toEqual([
      { dirName: ['packages', 'backend'], target: '.env' },
      { dirName: ['packages', 'frontend'], target: '.env.local' },
      { dirName: ['docker'], target: '.env' },
    ]);
  });

  test('resolveEnvFiles 按 projectRoot 拼出模板/目标路径对', () => {
    const files = resolveEnvFiles('D:/proj');
    expect(files).toHaveLength(3);
    expect(files[0]).toEqual({
      dirName: ['packages', 'backend'],
      exampleFile: path.join('D:/proj', 'packages', 'backend', '.env.example'),
      envFile: path.join('D:/proj', 'packages', 'backend', '.env'),
    });
    expect(files[1].envFile).toMatch(/frontend[\\/]\.env\.local$/);
  });
});

describe('createEnvFilesFromExamples', () => {
  test('目标缺失时从模板创建，内容逐字节相同', () => {
    const root = makeProjectRoot({
      'packages/backend': BACKEND_EXAMPLE,
    });

    const result = createEnvFilesFromExamples(root, silent);

    expect(result.copied).toBe(1);
    expect(result.skipped).toBe(0);
    const envPath = path.join(root, 'packages', 'backend', '.env');
    expect(fs.readFileSync(envPath, 'utf8')).toBe(BACKEND_EXAMPLE);
    expect(result.touched).toEqual([envPath]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('目标已存在时跳过且不覆盖已有内容', () => {
    const root = makeProjectRoot({
      'packages/backend': BACKEND_EXAMPLE,
    });
    const envPath = path.join(root, 'packages', 'backend', '.env');
    const custom = '# 本地自定义配置\nMY_CUSTOM=1\n';
    fs.writeFileSync(envPath, custom);

    const result = createEnvFilesFromExamples(root, silent);

    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(fs.readFileSync(envPath, 'utf8')).toBe(custom);
    // 已存在的目标也纳入权限收紧
    expect(result.touched).toEqual([envPath]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('模板缺失的目录直接跳过，不报错也不建文件', () => {
    const root = makeProjectRoot({
      'packages/backend': BACKEND_EXAMPLE,
    });
    const dockerEnv = path.join(root, 'docker', '.env');

    expect(() => createEnvFilesFromExamples(root, silent)).not.toThrow();
    expect(fs.existsSync(dockerEnv)).toBe(false);
    // docker/ 目录本身也不应被创建
    expect(fs.existsSync(path.join(root, 'docker'))).toBe(false);

    fs.rmSync(root, { recursive: true, force: true });
  });

  test('backend .env 的空白密钥被填充，非空白键不被改动', () => {
    const root = makeProjectRoot({
      'packages/backend': BACKEND_EXAMPLE_WITH_SECRET,
    });

    createEnvFilesFromExamples(root, silent);

    const content = fs.readFileSync(
      path.join(root, 'packages', 'backend', '.env'),
      'utf8'
    );
    const lines = content.split('\n');
    const redisLine = lines.find((line) => line.startsWith('REDIS_PASSWORD='));
    expect(redisLine).toBeDefined();
    // 填充为随机 hex 密钥，不再是空白
    expect(redisLine).toMatch(/^REDIS_PASSWORD=[0-9a-f]{16,}$/);
    expect(lines).toContain(
      'DATABASE_URL=postgresql://postgres:password@localhost:5432/cloudcad'
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('非 backend 的 .env 不触发密钥填充', () => {
    const dockerExample = 'SOME_KEY=\n';
    const root = makeProjectRoot({
      'packages/backend': 'DATABASE_URL=x\n',
      docker: dockerExample,
    });

    createEnvFilesFromExamples(root, silent);

    expect(
      fs.readFileSync(path.join(root, 'docker', '.env'), 'utf8')
    ).toBe(dockerExample);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('后端 .env 缺失时不尝试填充密钥', () => {
    const root = makeProjectRoot({
      'packages/frontend': 'VITE_API_BASE_URL=/api\n',
    });

    expect(() => createEnvFilesFromExamples(root, silent)).not.toThrow();
    expect(
      fs.readFileSync(
        path.join(root, 'packages', 'frontend', '.env.local'),
        'utf8'
      )
    ).toBe('VITE_API_BASE_URL=/api\n');
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('所有目标已存在时 copied 为 0 且全部计入 touched', () => {
    const root = makeProjectRoot({
      'packages/backend': 'A=1\n',
      'packages/frontend': 'B=1\n',
      docker: 'C=1\n',
    });
    const files = resolveEnvFiles(root).map((f) => ({
      ...f,
      content: 'EXISTING\n',
    }));
    for (const file of files) {
      fs.writeFileSync(file.envFile, file.content);
    }

    const result = createEnvFilesFromExamples(root, silent);

    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(3);
    expect(result.touched).toHaveLength(3);
    for (const file of files) {
      expect(fs.readFileSync(file.envFile, 'utf8')).toBe('EXISTING\n');
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('对每个已存在的目标文件收紧权限为 600', () => {
    const root = makeProjectRoot({
      'packages/backend': 'A=1\n',
    });
    const chmodSync = jest
      .spyOn(fs, 'chmodSync')
      .mockImplementation(() => {});

    const result = createEnvFilesFromExamples(root, silent);

    expect(chmodSync).toHaveBeenCalledTimes(1);
    expect(chmodSync).toHaveBeenCalledWith(
      path.join(root, 'packages', 'backend', '.env'),
      0o600
    );
    expect(result.touched).toHaveLength(1);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('logger 收到创建与密钥填充日志', () => {
    const logs = [];
    const root = makeProjectRoot({
      'packages/backend': BACKEND_EXAMPLE,
    });

    createEnvFilesFromExamples(root, { log: (m) => logs.push(m) });

    expect(logs.some((l) => l.includes('packages') && l.includes('创建'))).toBe(
      true
    );
    expect(logs.some((l) => l.includes('空白密钥'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('拷贝失败走 error 通道且不影响其他目录', () => {
    const errors = [];
    const root = makeProjectRoot({
      'packages/backend': 'A=1\n',
      'packages/frontend': 'B=1\n',
    });
    const realCopy = fs.copyFileSync.bind(fs);
    const spy = jest.spyOn(fs, 'copyFileSync');
    spy.mockImplementation((src, dest) => {
      if (String(src).includes('backend')) {
        throw new Error('EACCES: permission denied');
      }
      return realCopy.call(fs, src, dest);
    });

    const result = createEnvFilesFromExamples(root, {
      log: () => {},
      error: (m) => errors.push(m),
    });

    expect(result.copied).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('EACCES');
    fs.rmSync(root, { recursive: true, force: true });
  });
});
