/**
 * 配置文件增量更新集成测试
 * 
 * 模拟真实的目录结构和文件，测试完整的增量更新流程
 * 
 * 使用方式：
 *   node scripts/test-config-integration.js
 */

const fs = require('fs');
const path = require('path');
const { updateFrontendConfigs } = require('../runtime/scripts/config-updater');

// ==================== 测试设置 ====================

const TEST_DIR = path.join(__dirname, 'test-temp');
const FRONTEND_DIST = path.join(TEST_DIR, 'packages', 'frontend', 'dist');

// 测试目录结构
const testStructure = {
  // ini 目录配置
  'ini/myServerConfig.json.example': {
    uploadFileConfig: {
      baseUrl: '',
      create: {
        server: '/api/upload',
        accept: {
          extensions: 'mxweb,dwg,dxf',
          mimeTypes: '.mxweb,.dwg,.dxf'  // 新增
        }
      }
    },
    newFeature: {
      enabled: true
    }
  },
  'ini/myServerConfig.json': {
    uploadFileConfig: {
      baseUrl: 'http://custom.com',
      create: {
        server: '/custom/upload'
      }
    }
  },
  
  // brand 目录配置
  'brand/config.json.example': {
    title: '梦想网页 CAD 实时协同平台',
    logo: '/brand/logo.png',
    subtitle: '新增副标题',  // 新增配置
    showLogo: true          // 新增配置
  },
  'brand/config.json': {
    title: '用户自定义标题',
    logo: '/custom/logo.png'
  },
  
  // 嵌套子目录配置
  'settings/ui.json.example': {
    theme: 'dark',
    language: 'zh-CN',
    sidebar: {
      width: 300,        // 新增
      collapsible: true  // 新增
    }
  },
  'settings/ui.json': {
    theme: 'light',
    language: 'en-US'
  }
};

// ==================== 工具函数 ====================

function cleanTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function setupTestStructure() {
  // 创建目录
  const dirs = ['ini', 'brand', 'settings'];
  for (const dir of dirs) {
    const dirPath = path.join(FRONTEND_DIST, dir);
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  // 创建文件
  for (const [filePath, content] of Object.entries(testStructure)) {
    const fullPath = path.join(FRONTEND_DIST, filePath);
    fs.writeFileSync(fullPath, JSON.stringify(content, null, 2), 'utf8');
  }
  
  console.log('测试目录结构创建完成');
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
  
  // 验证 ini/myServerConfig.json
  const serverConfig = JSON.parse(fs.readFileSync(
    path.join(FRONTEND_DIST, 'ini/myServerConfig.json'), 'utf8'
  ));
  assert(
    serverConfig.uploadFileConfig.baseUrl === 'http://custom.com',
    'ini: 保持用户自定义 baseUrl'
  );
  assert(
    serverConfig.uploadFileConfig.create.accept !== undefined,
    'ini: 新增 accept 配置'
  );
  assert(
    serverConfig.newFeature !== undefined,
    'ini: 新增 newFeature'
  );
  
  // 验证 brand/config.json
  const brandConfig = JSON.parse(fs.readFileSync(
    path.join(FRONTEND_DIST, 'brand/config.json'), 'utf8'
  ));
  assert(
    brandConfig.title === '用户自定义标题',
    'brand: 保持用户自定义 title'
  );
  assert(
    brandConfig.subtitle === '新增副标题',
    'brand: 新增 subtitle'
  );
  assert(
    brandConfig.showLogo === true,
    'brand: 新增 showLogo'
  );
  
  // 验证 settings/ui.json
  const uiConfig = JSON.parse(fs.readFileSync(
    path.join(FRONTEND_DIST, 'settings/ui.json'), 'utf8'
  ));
  assert(
    uiConfig.theme === 'light',
    'settings: 保持用户自定义 theme'
  );
  assert(
    uiConfig.sidebar !== undefined,
    'settings: 新增 sidebar 对象'
  );
  assert(
    uiConfig.sidebar.width === 300,
    'settings: 新增 sidebar.width'
  );
  
  // 验证 .bak 备份文件存在
  assert(
    fs.existsSync(path.join(FRONTEND_DIST, 'ini/myServerConfig.json.bak')),
    '备份文件存在：ini/myServerConfig.json.bak'
  );
  assert(
    fs.existsSync(path.join(FRONTEND_DIST, 'brand/config.json.bak')),
    '备份文件存在：brand/config.json.bak'
  );
  assert(
    fs.existsSync(path.join(FRONTEND_DIST, 'settings/ui.json.bak')),
    '备份文件存在：settings/ui.json.bak'
  );
  
  console.log(`\n验证完成：${passed} 通过，${failed} 失败`);
  return failed === 0;
}

// ==================== 主测试流程 ====================

console.log('============================================');
console.log(' 配置文件增量更新集成测试');
console.log('============================================');
console.log('');

try {
  // 1. 清理测试目录
  cleanTestDir();
  
  // 2. 创建测试结构
  setupTestStructure();
  
  // 3. 运行增量更新
  console.log('\n运行增量更新...');
  const stats = updateFrontendConfigs(FRONTEND_DIST);
  console.log(`更新统计：`, stats);
  
  // 4. 验证结果
  console.log('');
  const success = verifyResults();
  
  // 5. 清理测试目录
  console.log('\n清理测试目录...');
  cleanTestDir();
  
  if (success) {
    console.log('\n✓ 集成测试通过');
    process.exit(0);
  } else {
    console.log('\n✗ 集成测试失败');
    process.exit(1);
  }
} catch (err) {
  console.error('测试异常:', err);
  cleanTestDir();
  process.exit(1);
}
