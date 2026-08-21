/**
 * 品牌资源文件增量更新测试
 * 
 * 测试场景：
 * 1. 用户已有 logo.png → 保留用户的
 * 2. 用户没有 logo.png → 从 .example 复制
 * 
 * 使用方式：
 *   node scripts/test-brand-resources.js
 */

const fs = require('fs');
const path = require('path');
const { updateFrontendConfigs } = require('../runtime/scripts/config-updater');

// ==================== 测试设置 ====================

const TEST_DIR = path.join(__dirname, 'test-temp-brand');
const FRONTEND_DIST = path.join(TEST_DIR, 'packages', 'frontend', 'dist');
const BRAND_DIR = path.join(FRONTEND_DIST, 'brand');

// ==================== 工具函数 ====================

function cleanTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function setupTestStructure() {
  // 创建 brand 目录
  fs.mkdirSync(BRAND_DIR, { recursive: true });

  // 创建 .example 文件
  fs.writeFileSync(
    path.join(BRAND_DIR, 'logo.png.example'),
    Buffer.from('EXAMPLE_LOGO_CONTENT', 'utf8')
  );
  fs.writeFileSync(
    path.join(BRAND_DIR, 'config.json.example'),
    JSON.stringify({
      title: '默认标题',
      logo: '/brand/logo.png'
    }, null, 2)
  );

  // 创建用户已有的 logo.png（模拟用户上传的）
  fs.writeFileSync(
    path.join(BRAND_DIR, 'logo.png'),
    Buffer.from('USER_CUSTOM_LOGO_CONTENT', 'utf8')
  );

  // 创建用户已有的 config.json（部分配置）
  fs.writeFileSync(
    path.join(BRAND_DIR, 'config.json'),
    JSON.stringify({
      title: '用户自定义标题'
    }, null, 2)
  );

  console.log('测试目录结构创建完成');
  console.log('  brand/logo.png.example (部署包模板)');
  console.log('  brand/logo.png (用户自定义)');
  console.log('  brand/config.json.example (部署包模板)');
  console.log('  brand/config.json (用户自定义)');
}

function verifyResults() {
  console.log('\n验证结果...');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ✗ ${message}`);
      failed++;
    }
  }

  // 验证 logo.png 内容是否保持用户自定义
  const logoContent = fs.readFileSync(path.join(BRAND_DIR, 'logo.png'), 'utf8');
  assert(
    logoContent === 'USER_CUSTOM_LOGO_CONTENT',
    'logo.png: 保持用户自定义内容'
  );

  // 验证 logo.png.example 仍然存在
  assert(
    fs.existsSync(path.join(BRAND_DIR, 'logo.png.example')),
    'logo.png.example: 模板文件存在'
  );

  // 验证 config.json 增量更新
  const configContent = JSON.parse(fs.readFileSync(path.join(BRAND_DIR, 'config.json'), 'utf8'));
  assert(
    configContent.title === '用户自定义标题',
    'config.json: 保持用户自定义 title'
  );
  assert(
    configContent.logo === '/brand/logo.png',
    'config.json: 新增 logo 配置'
  );

  return failed === 0;
}

// ==================== 测试 2：用户没有 logo.png ====================

function testNewInstallation() {
  console.log('\n============================================');
  console.log(' 测试 2: 全新安装（用户没有 logo.png）');
  console.log('============================================\n');

  const NEW_INSTALL_DIR = path.join(TEST_DIR, 'new-install');
  const NEW_BRAND_DIR = path.join(NEW_INSTALL_DIR, 'packages', 'frontend', 'dist', 'brand');

  // 创建新安装目录结构
  fs.mkdirSync(NEW_BRAND_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(NEW_BRAND_DIR, 'logo.png.example'),
    Buffer.from('DEFAULT_LOGO_CONTENT', 'utf8')
  );
  fs.writeFileSync(
    path.join(NEW_BRAND_DIR, 'config.json.example'),
    JSON.stringify({
      title: '默认标题',
      logo: '/brand/logo.png'
    }, null, 2)
  );

  console.log('运行增量更新...');
  const stats = updateFrontendConfigs(path.join(NEW_INSTALL_DIR, 'packages', 'frontend', 'dist'));
  console.log('更新统计:', stats);

  // 验证
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ✗ ${message}`);
      failed++;
    }
  }

  assert(
    fs.existsSync(path.join(NEW_BRAND_DIR, 'logo.png')),
    'logo.png: 从 .example 复制创建'
  );

  const logoContent = fs.readFileSync(path.join(NEW_BRAND_DIR, 'logo.png'), 'utf8');
  assert(
    logoContent === 'DEFAULT_LOGO_CONTENT',
    'logo.png: 内容来自 .example'
  );

  return failed === 0;
}

// ==================== 主测试流程 ====================

console.log('============================================');
console.log(' 品牌资源文件增量更新测试');
console.log('============================================');
console.log('');

try {
  // 清理测试目录
  cleanTestDir();

  // 创建测试结构
  setupTestStructure();

  // 运行增量更新
  console.log('\n运行增量更新...');
  const stats = updateFrontendConfigs(FRONTEND_DIST);
  console.log('更新统计:', stats);

  // 验证结果
  console.log('');
  const success = verifyResults();

  // 测试全新安装场景
  const newInstallSuccess = testNewInstallation();

  // 清理测试目录
  console.log('\n清理测试目录...');
  cleanTestDir();

  if (success && newInstallSuccess) {
    console.log('\n✓ 所有测试通过');
    process.exit(0);
  } else {
    console.log('\n✗ 部分测试失败');
    process.exit(1);
  }
} catch (err) {
  console.error('测试异常:', err);
  cleanTestDir();
  process.exit(1);
}
