/**
 * Docker 部署包（Windows 宿主）验证脚本（ADR-0075 #444）单测
 *
 * 覆盖 verify-windows-docker.js 导出的纯函数：
 * - WINDOWS_DOCKER_PACKAGE_PATTERN：挑包正则按形态过滤（C8）——只匹配 -docker- 段
 *   的 windows 宿主包（含 -private 变体段），排除裸机 windows 包与 docker linux 包
 * - parseEnvSimple：.env 解析口径（剥引号、跳注释）
 *
 * 完整 start.bat E2E 属外向验证（需 Windows + Docker Desktop Linux 容器模式），
 * 不在单测范围；本文件只守「挑包不串形态」与「env 解析」两条纯逻辑。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const VERIFY_SCRIPT = path.join(__dirname, '..', '..', '..', 'scripts', 'verify-windows-docker.js');
const { WINDOWS_DOCKER_PACKAGE_PATTERN, parseEnvSimple } = require(VERIFY_SCRIPT);

describe('WINDOWS_DOCKER_PACKAGE_PATTERN（#444 挑包按形态过滤，C8）', () => {
  test('匹配 docker windows 宿主包（oss）', () => {
    expect(WINDOWS_DOCKER_PACKAGE_PATTERN.test('cloudcad-deploy-1.0.0-20261020-docker-windows-x86_64.7z')).toBe(true);
  });

  test('匹配 docker windows 宿主包（-private 变体段）', () => {
    expect(WINDOWS_DOCKER_PACKAGE_PATTERN.test('cloudcad-deploy-private-1.0.0-20261020-docker-windows-x86_64.7z')).toBe(true);
  });

  test('排除裸机 windows 包（无 -docker- 段，build-windows job 产物）', () => {
    expect(WINDOWS_DOCKER_PACKAGE_PATTERN.test('cloudcad-deploy-1.0.0-20261020-windows.7z')).toBe(false);
    expect(WINDOWS_DOCKER_PACKAGE_PATTERN.test('cloudcad-deploy-private-1.0.0-20261020-windows.7z')).toBe(false);
  });

  test('排除 docker linux 宿主包（-docker-linux- 段）', () => {
    expect(WINDOWS_DOCKER_PACKAGE_PATTERN.test('cloudcad-deploy-1.0.0-20261020-docker-linux-x86_64.tar.gz')).toBe(false);
  });
});

describe('parseEnvSimple（#444 二次探针端口来源）', () => {
  let tmp;
  let envFile;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-win-docker-test-'));
    envFile = path.join(tmp, '.env');
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('解析键值、跳注释、剥引号', () => {
    fs.writeFileSync(
      envFile,
      ['# 注释行', '', 'PORT=3011', 'FRONTEND_PORT="8010"', "CONFIG_SERVICE_PORT='3032'", 'COOPERATE_HOST=host.docker.internal'].join('\n'),
      'utf8'
    );
    const env = parseEnvSimple(envFile);
    expect(env.PORT).toBe('3011');
    expect(env.FRONTEND_PORT).toBe('8010');
    expect(env.CONFIG_SERVICE_PORT).toBe('3032');
    expect(env.COOPERATE_HOST).toBe('host.docker.internal');
    expect(Object.keys(env)).toHaveLength(4);
  });
});
