/**
 * 配置增量更新逻辑测试脚本
 * 
 * 使用方式：
 *   node scripts/test-config-updater.js
 */

const path = require('path');
const fs = require('fs');
const { mergeWithMissingOnly, parseEnvContent, serializeEnvContent } = require('../runtime/scripts/config-updater');

// ==================== 测试数据 ====================

const testExampleConfig = {
  uploadFileConfig: {
    baseUrl: "",
    create: {
      server: "/api/upload",
      accept: {
        extensions: "mxweb,dwg,dxf",
        mimeTypes: ".mxweb,.dwg,.dxf"  // 新增属性
      }
    }
  },
  wasmConfig: {
    url: "",
    type: "2d"
  },
  newFeature: {  // 新增对象
    enabled: true,
    options: ["opt1", "opt2"]
  },
  font: ["txt.shx", "simplex.shx"]  // 数组，应保持用户配置
};

const testUserConfig = {
  uploadFileConfig: {
    baseUrl: "http://custom-server.com",  // 用户自定义值
    create: {
      server: "/custom/upload"  // 用户自定义值
    }
  },
  wasmConfig: {
    type: "2d-st"  // 用户自定义值
  },
  font: ["custom-font.shx"]  // 用户数组
};

const expectedMergedConfig = {
  uploadFileConfig: {
    baseUrl: "http://custom-server.com",  // 保持用户值
    create: {
      server: "/custom/upload",  // 保持用户值
      accept: {  // 新增
        extensions: "mxweb,dwg,dxf",
        mimeTypes: ".mxweb,.dwg,.dxf"
      }
    }
  },
  wasmConfig: {
    type: "2d-st",  // 保持用户值
    url: ""  // 新增
  },
  font: ["custom-font.shx"],  // 保持用户数组
  newFeature: {  // 新增
    enabled: true,
    options: ["opt1", "opt2"]
  }
};

const testExampleEnv = `# 数据库配置
DATABASE_URL=postgresql://postgres:password@localhost:5432/cloudcad
DB_HOST=localhost
DB_PORT=5432

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379

# 新增配置
NEW_FEATURE_KEY=new_value
`;

const testUserEnv = `# 数据库配置
DATABASE_URL=postgresql://postgres:custom-password@localhost:5432/mydb
DB_HOST=my-host

# Redis 配置
REDIS_HOST=my-redis-host
REDIS_PORT=6380
`;

const expectedMergedEnv = `# 数据库配置
DATABASE_URL=postgresql://postgres:custom-password@localhost:5432/mydb
DB_HOST=my-host

# Redis 配置
REDIS_HOST=my-redis-host
REDIS_PORT=6380

# 新增配置
NEW_FEATURE_KEY=new_value
`;

// ==================== 测试函数 ====================

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    passedTests++;
  } else {
    console.error(`✗ ${message}`);
    failedTests++;
  }
}

function deepEqual(obj1, obj2) {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
}

// ==================== 运行测试 ====================

console.log('============================================');
console.log(' 配置增量更新逻辑测试');
console.log('============================================');
console.log('');

// 测试 1: JSON 配置增量更新
console.log('测试 1: JSON 配置增量更新');
const mergedConfig = mergeWithMissingOnly(testExampleConfig, testUserConfig);
assert(
  mergedConfig.uploadFileConfig.baseUrl === testUserConfig.uploadFileConfig.baseUrl,
  '保持用户自定义的 baseUrl'
);
assert(
  mergedConfig.uploadFileConfig.create.server === testUserConfig.uploadFileConfig.create.server,
  '保持用户自定义的 server'
);
assert(
  mergedConfig.uploadFileConfig.create.accept !== undefined,
  '新增 accept 配置'
);
assert(
  mergedConfig.uploadFileConfig.create.accept.mimeTypes === testExampleConfig.uploadFileConfig.create.accept.mimeTypes,
  'accept.mimeTypes 值来自 example'
);
assert(
  mergedConfig.wasmConfig.type === testUserConfig.wasmConfig.type,
  '保持用户自定义的 wasmConfig.type'
);
assert(
  mergedConfig.wasmConfig.url === testExampleConfig.wasmConfig.url,
  '新增 wasmConfig.url'
);
assert(
  mergedConfig.newFeature !== undefined,
  '新增 newFeature 对象'
);
assert(
  JSON.stringify(mergedConfig.font) === JSON.stringify(testUserConfig.font),
  '保持用户数组配置'
);
assert(
  deepEqual(mergedConfig, expectedMergedConfig),
  '合并结果与期望值完全匹配'
);
console.log('');

// 测试 2: .env 文件解析
console.log('测试 2: .env 文件解析');
const parsedEnv = parseEnvContent(testExampleEnv);
assert(
  parsedEnv.DATABASE_URL === 'postgresql://postgres:password@localhost:5432/cloudcad',
  '正确解析 DATABASE_URL'
);
assert(
  parsedEnv.REDIS_HOST === 'localhost',
  '正确解析 REDIS_HOST'
);
assert(
  parsedEnv.NEW_FEATURE_KEY === 'new_value',
  '正确解析新增配置'
);
assert(
  parsedEnv.DB_PORT === '5432',
  '正确解析 DB_PORT'
);
console.log('');

// 测试 3: .env 文件序列化
console.log('测试 3: .env 文件序列化');
const userEnvParsed = parseEnvContent(testUserEnv);
const exampleEnvParsed = parseEnvContent(testExampleEnv);
const mergedEnv = { ...userEnvParsed };
for (const key in exampleEnvParsed) {
  if (!(key in mergedEnv)) {
    mergedEnv[key] = exampleEnvParsed[key];
  }
}
const serializedEnv = serializeEnvContent(mergedEnv, testUserEnv);
assert(
  serializedEnv.includes('DATABASE_URL=postgresql://postgres:custom-password@localhost:5432/mydb'),
  '保持用户自定义的 DATABASE_URL'
);
assert(
  serializedEnv.includes('REDIS_HOST=my-redis-host'),
  '保持用户自定义的 REDIS_HOST'
);
assert(
  serializedEnv.includes('NEW_FEATURE_KEY=new_value'),
  '新增 NEW_FEATURE_KEY'
);
console.log('');

// 测试 4: 嵌套对象深度对比
console.log('测试 4: 嵌套对象深度对比');
const deepExample = {
  level1: {
    level2: {
      level3: {
        existing: 'value1',
        new: 'value2'
      }
    }
  }
};
const deepUser = {
  level1: {
    level2: {
      level3: {
        existing: 'user-value'
      }
    }
  }
};
const deepMerged = mergeWithMissingOnly(deepExample, deepUser);
assert(
  deepMerged.level1.level2.level3.existing === 'user-value',
  '保持深层嵌套的用户值'
);
assert(
  deepMerged.level1.level2.level3.new === 'value2',
  '新增深层嵌套配置'
);
console.log('');

// 测试 5: 类型不匹配处理
console.log('测试 5: 类型不匹配处理');
const typeExample = {
  value: 'string'
};
const typeUser = {
  value: 123
};
const typeMerged = mergeWithMissingOnly(typeExample, typeUser);
assert(
  typeMerged.value === 123,
  '类型不匹配时保持用户值'
);
console.log('');

// ==================== 测试结果 ====================

console.log('============================================');
console.log(` 测试结果：${passedTests} 通过，${failedTests} 失败`);
console.log('============================================');

if (failedTests > 0) {
  process.exit(1);
}
