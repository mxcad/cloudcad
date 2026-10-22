/**
 * 配置文件增量更新器
 *
 * 功能：
 * 1. 前端 JSON 配置文件增量更新
 * 2. .env 环境变量文件增量更新
 *
 * 更新规则：
 * - 如果用户配置文件不存在，直接复制 .example 文件
 * - 如果用户配置文件存在：
 *   - 备份为 .bak 文件
 *   - 读取 .example 作为模板
 *   - 递归对比每个属性
 *   - 只添加 .example 中有但用户配置中没有的属性
 *   - 不修改用户已有的任何配置
 */

const fs = require('fs');
const path = require('path');

// ==================== 工具函数 ====================

function log(msg) {
  console.log(`[ConfigUpdater] ${msg}`);
}

function error(msg) {
  console.error(`[ConfigUpdater] ERROR: ${msg}`);
}

/**
 * 判断是否是普通对象（非数组、非 null）
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 深度克隆对象
 */
function cloneDeep(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneDeep(item));
  }
  const result = {};
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      result[key] = cloneDeep(value[key]);
    }
  }
  return result;
}

/**
 * 递归合并对象
 *
 * 规则：
 * 1. 只添加 example 中有但 user 中没有的属性
 * 2. 不修改 user 中已有的任何属性（包括值、对象、数组）
 * 3. 对于嵌套对象，递归应用此规则
 * 4. 对于数组，保持 user 的数组不变
 *
 * @param {object} example - 模板配置（.example 文件）
 * @param {object} user - 用户配置（.bak 文件）
 * @returns {object} 合并后的配置
 */
function mergeWithMissingOnly(example, user) {
  // 类型不同，以 example 为准（罕见情况，记录警告）
  if (typeof example !== typeof user) {
    console.warn(
      `[ConfigUpdater] 警告：类型不匹配，example: ${typeof example}, user: ${typeof user}`
    );
    return cloneDeep(example);
  }

  // 如果不是对象（基础类型或数组），返回 user 值（保持用户配置）
  if (!isPlainObject(example)) {
    return user;
  }

  // 都是对象，创建结果对象（从 user 开始）
  const result = { ...user };

  // 遍历 example 的每个属性
  for (const key in example) {
    if (!Object.prototype.hasOwnProperty.call(example, key)) {
      continue;
    }

    if (!(key in result)) {
      // user 中没有这个属性，直接从 example 添加
      result[key] = cloneDeep(example[key]);
      log(`  新增配置项：${key}`);
    } else if (isPlainObject(example[key]) && isPlainObject(result[key])) {
      // 都是对象，递归合并
      result[key] = mergeWithMissingOnly(example[key], result[key]);
    }
    // user 中已有此属性（值或数组），保持不变
  }

  return result;
}

// ==================== JSON 配置文件更新 ====================

/**
 * 更新单个 JSON 配置文件
 *
 * @param {string} jsonFile - JSON 文件路径（用户配置文件）
 * @returns {boolean} 是否成功更新
 */
function updateJsonConfig(jsonFile) {
  const exampleFile = `${jsonFile}.example`;
  const bakFile = `${jsonFile}.bak`;

  // 检查 .example 文件是否存在
  if (!fs.existsSync(exampleFile)) {
    log(`跳过：${jsonFile}（无 .example 模板）`);
    return false;
  }

  // 如果用户配置文件不存在，直接复制 .example
  if (!fs.existsSync(jsonFile)) {
    try {
      fs.copyFileSync(exampleFile, jsonFile);
      log(`创建：${jsonFile}`);
      return true;
    } catch (err) {
      error(`创建失败：${jsonFile} - ${err.message}`);
      return false;
    }
  }

  // 用户配置文件存在，执行增量更新

  // 1. 备份用户配置
  try {
    fs.copyFileSync(jsonFile, bakFile);
    log(`备份：${jsonFile} -> ${bakFile}`);
  } catch (err) {
    error(`备份失败：${jsonFile} - ${err.message}`);
    return false;
  }

  // 2. 读取备份和 example
  let userConfig, exampleConfig;
  try {
    userConfig = JSON.parse(fs.readFileSync(bakFile, 'utf8'));
    exampleConfig = JSON.parse(fs.readFileSync(exampleFile, 'utf8'));
  } catch (err) {
    error(`读取 JSON 失败：${err.message}`);
    return false;
  }

  // 3. 增量合并
  log(`合并配置...`);
  const mergedConfig = mergeWithMissingOnly(exampleConfig, userConfig);

  // 4. 写回用户配置文件
  try {
    fs.writeFileSync(jsonFile, JSON.stringify(mergedConfig, null, 2), 'utf8');
    log(`更新：${jsonFile}`);
    return true;
  } catch (err) {
    error(`写入失败：${jsonFile} - ${err.message}`);
    // 恢复备份
    try {
      fs.copyFileSync(bakFile, jsonFile);
      log(`恢复备份：${jsonFile}`);
    } catch (restoreErr) {
      error(`恢复备份失败：${restoreErr.message}`);
    }
    return false;
  }
}

/**
 * 更新前端目录下所有 JSON 配置文件
 * 递归处理 dist 目录下所有子目录（如 ini/, brand/ 等）
 *
 * 重要: 配置文件现在存储在外置目录 (data/configs/frontend/)
 * 此函数从 dist/ 的 .example 文件初始化外置配置
 *
 * @param {string} frontendDistDir - 前端 dist 目录路径
 * @returns {object} 更新统计信息
 */
function updateFrontendConfigs(frontendDistDir) {
  const publicDir = frontendDistDir; // dist 目录即为 public 构建产物目录

  if (!fs.existsSync(publicDir)) {
    log(`前端 public 目录不存在：${publicDir}`);
    return { updated: 0, created: 0, skipped: 0, failed: 0 };
  }

  const stats = { updated: 0, created: 0, skipped: 0, failed: 0 };

  // 递归遍历 dist 目录,将 .example 文件初始化到 dist 目录
  function processDistDirectory(distDir) {
    if (!fs.existsSync(distDir)) {
      return;
    }

    const entries = fs.readdirSync(distDir, { withFileTypes: true });

    for (const entry of entries) {
      const distPath = path.join(distDir, entry.name);

      if (entry.isDirectory()) {
        // 递归处理子目录
        processDistDirectory(distPath);
      } else if (entry.isFile()) {
        const fileName = entry.name;

        // 处理 .json.example 文件 -> 直接在 dist 目录处理
        if (fileName.endsWith('.json.example')) {
          const targetJsonFile = distPath.replace('.json.example', '.json');
          const existedBefore = fs.existsSync(targetJsonFile);

          // 调用 updateJsonConfig 处理（目标在 dist 目录）
          const success = updateJsonConfig(targetJsonFile);

          if (!success) {
            stats.failed++;
          } else if (!existedBefore) {
            stats.created++;
          } else {
            stats.updated++;
          }
        }
        // 处理 brand 目录下的资源文件（图片和 JSON）
        // 从 dist/brand/*.example 复制到 dist/brand/（去掉 .example）
        else if (
          distDir.includes(path.sep + 'brand' + path.sep) ||
          distDir.endsWith(path.sep + 'brand')
        ) {
          if (fileName.endsWith('.example')) {
            const originalFile = distPath.replace('.example', '');
            if (!fs.existsSync(originalFile)) {
              try {
                fs.copyFileSync(distPath, originalFile);
                log(`创建：${path.relative(frontendDistDir, originalFile)}`);
                stats.created++;
              } catch (err) {
                error(`创建失败：${originalFile} - ${err.message}`);
                stats.failed++;
              }
            } else {
              log(
                `跳过（保留用户文件）: ${path.relative(frontendDistDir, originalFile)}`
              );
              stats.skipped++;
            }
          }
        }
      }
    }
  }

  log(`开始更新前端配置文件...`);
  processDistDirectory(publicDir);

  return stats;
}

// ==================== .env 文件更新 ====================

/**
 * 解析 .env 文件内容为对象
 *
 * @param {string} content - 文件内容
 * @returns {object} 键值对对象
 */
function parseEnvContent(content) {
  const result = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    // 跳过空行和注释
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    // 解析 KEY=VALUE
    const equalIndex = trimmedLine.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmedLine.substring(0, equalIndex).trim();
      const value = trimmedLine.substring(equalIndex + 1).trim();
      // 移除引号（如果存在）
      const unquotedValue = value.replace(/^["']|["']$/g, '');
      if (key) {
        result[key] = unquotedValue;
      }
    }
  }

  return result;
}

/**
 * 将对象序列化为 .env 格式
 *
 * @param {object} envObj - 键值对对象
 * @param {string} originalContent - 原始内容（用于保持注释和格式）
 * @returns {string} .env 格式字符串
 */
function serializeEnvContent(envObj, originalContent = '') {
  const lines = originalContent.split('\n');
  const output = [];
  const processedKeys = new Set();

  // 遍历原始行，保持原有顺序和注释
  for (const line of lines) {
    const trimmedLine = line.trim();

    // 空行和注释直接保留
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      output.push(line);
      continue;
    }

    // 解析 KEY=VALUE
    const equalIndex = trimmedLine.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmedLine.substring(0, equalIndex).trim();

      // 如果这个 key 在新配置中存在，使用新值
      if (key in envObj) {
        output.push(`${key}=${envObj[key]}`);
        processedKeys.add(key);
      } else {
        // key 不存在了，保留原值（可能已被删除）
        output.push(line);
      }
    } else {
      output.push(line);
    }
  }

  // 添加新增的 key（在原始文件中不存在的）
  const newKeys = Object.keys(envObj).filter((k) => !processedKeys.has(k));
  if (newKeys.length > 0) {
    output.push('');
    output.push('# ===== 新增配置项 =====');
    for (const key of newKeys) {
      output.push(`${key}=${envObj[key]}`);
      log(`  新增配置项：${key}`);
    }
  }

  return output.join('\n');
}

/**
 * 更新单个 .env 文件
 *
 * @param {string} envFile - .env 文件路径
 * @returns {boolean} 是否成功更新
 */
function updateEnvConfig(envFile) {
  const exampleFile = `${envFile}.example`;
  const bakFile = `${envFile}.bak`;

  // 检查 .example 文件是否存在
  if (!fs.existsSync(exampleFile)) {
    log(`跳过：${envFile}（无 .example 模板）`);
    return false;
  }

  // 如果用户配置文件不存在，直接复制 .example
  if (!fs.existsSync(envFile)) {
    try {
      fs.copyFileSync(exampleFile, envFile);
      log(`创建：${envFile}`);
      return true;
    } catch (err) {
      error(`创建失败：${envFile} - ${err.message}`);
      return false;
    }
  }

  // 用户配置文件存在，执行增量更新

  // 1. 备份用户配置
  try {
    fs.copyFileSync(envFile, bakFile);
    log(`备份：${envFile} -> ${bakFile}`);
  } catch (err) {
    error(`备份失败：${envFile} - ${err.message}`);
    return false;
  }

  // 2. 读取和解析
  let userEnv, exampleEnv;
  let originalContent;
  try {
    originalContent = fs.readFileSync(bakFile, 'utf8');
    userEnv = parseEnvContent(originalContent);
    exampleEnv = parseEnvContent(fs.readFileSync(exampleFile, 'utf8'));
  } catch (err) {
    error(`读取 .env 失败：${err.message}`);
    return false;
  }

  // 3. 增量合并：只添加 example 中有但 user 中没有的 key
  const mergedEnv = { ...userEnv };
  let hasNewKeys = false;

  for (const key in exampleEnv) {
    if (!Object.prototype.hasOwnProperty.call(exampleEnv, key)) {
      continue;
    }

    if (!(key in mergedEnv)) {
      mergedEnv[key] = exampleEnv[key];
      hasNewKeys = true;
      log(`  新增配置项：${key}`);
    }
    // user 中已有的 key，保持不变
  }

  // 4. 如果没有新增项，不需要写回
  if (!hasNewKeys) {
    log(`无需更新：${envFile}`);
    return true;
  }

  // 5. 写回用户配置文件
  try {
    const newContent = serializeEnvContent(mergedEnv, originalContent);
    fs.writeFileSync(envFile, newContent, 'utf8');
    log(`更新：${envFile}`);
    return true;
  } catch (err) {
    error(`写入失败：${envFile} - ${err.message}`);
    // 恢复备份
    try {
      fs.copyFileSync(bakFile, envFile);
      log(`恢复备份：${envFile}`);
    } catch (restoreErr) {
      error(`恢复备份失败：${restoreErr.message}`);
    }
    return false;
  }
}

/**
 * 更新指定的 .env 文件列表
 *
 * @param {Array<{dir: string, target: string}>} envConfigs - 配置列表
 * @returns {object} 更新统计信息
 */
function updateEnvConfigs(envConfigs) {
  const stats = { updated: 0, created: 0, skipped: 0, failed: 0 };

  log(`开始更新 .env 配置文件...`);

  for (const config of envConfigs) {
    const envFile = path.join(config.dir, config.target || '.env');
    const exampleFile = `${envFile}.example`;

    // 检查 .example 是否存在
    if (!fs.existsSync(exampleFile)) {
      log(`跳过：${envFile}（无 .example 模板）`);
      stats.skipped++;
      continue;
    }

    const existedBefore = fs.existsSync(envFile);
    const success = updateEnvConfig(envFile);

    if (!success) {
      stats.failed++;
    } else if (!existedBefore) {
      stats.created++;
    } else {
      stats.updated++;
    }
  }

  return stats;
}

// ==================== 主函数 ====================

/**
 * 更新前端配置文件
 *
 * @param {string} projectRoot - 项目根目录
 * @returns {object} 更新统计
 */
function updateFrontendConfigsWrapper(projectRoot) {
  const frontendDistDir = path.join(
    projectRoot,
    'packages',
    'frontend',
    'dist'
  );
  return updateFrontendConfigs(frontendDistDir);
}

/**
 * 更新后端 .env 文件
 *
 * @param {string} projectRoot - 项目根目录
 * @returns {object} 更新统计
 */
function updateBackendEnv(projectRoot) {
  const envConfigs = [
    { dir: path.join(projectRoot, 'packages', 'backend'), target: '.env' },
  ];
  return updateEnvConfigs(envConfigs);
}

/**
 * 更新所有配置文件（前端 JSON + 后端 .env）
 *
 * @param {string} projectRoot - 项目根目录
 * @returns {object} 总统计信息
 */
function updateAllConfigs(projectRoot) {
  log('============================================');
  log(' 配置文件增量更新');
  log('============================================');
  log('');

  const frontendStats = updateFrontendConfigsWrapper(projectRoot);
  log('');

  const backendStats = updateBackendEnv(projectRoot);
  log('');

  const totalStats = {
    updated: frontendStats.updated + backendStats.updated,
    created: frontendStats.created + backendStats.created,
    skipped: frontendStats.skipped + backendStats.skipped,
    failed: frontendStats.failed + backendStats.failed,
  };

  log('============================================');
  log(' 更新完成');
  log('============================================');
  log(
    `新增：${totalStats.created}, 更新：${totalStats.updated}, 跳过：${totalStats.skipped}, 失败：${totalStats.failed}`
  );

  return totalStats;
}

// ==================== 高级 .env 合并（区块感知） ====================

/**
 * 解析 .env 内容为结构化区块列表
 *
 * 区块类型：
 *   section_header — 分组标题（# ==== xxx ====）
 *   keyvalue       — KEY=VALUE 行（含上方注释）
 *   comment        — 游离注释/空行
 *
 * @param {string} content
 * @returns {Array<{type:string, lines:string[], key?:string, value?:string}>}
 */
function parseEnvToBlocks(content) {
  const blocks = [];
  const lines = content.split('\n');
  let buffer = []; // 暂存注释/空行

  function flushBuffer() {
    if (buffer.length === 0) return;
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && lastBlock.type === 'comment') {
      // 合并到上一个 comment 块
      lastBlock.lines.push(...buffer);
    } else {
      blocks.push({ type: 'comment', lines: [...buffer] });
    }
    buffer = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === '') {
      buffer.push(raw);
      continue;
    }

    if (/^# ===+/.test(trimmed)) {
      flushBuffer();
      blocks.push({ type: 'section_header', lines: [raw] });
      continue;
    }

    // 检测注释掉的 KEY=VALUE（# THUMBNAIL_BACKGROUND_COLOR=0x000000）
    const commentedKvMatch = trimmed.match(/^#\s+([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (commentedKvMatch) {
      const key = commentedKvMatch[1];
      const value = commentedKvMatch[2];
      flushBuffer();
      blocks.push({
        type: 'commented_keyvalue',
        lines: [raw],
        key,
        value,
      });
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0 && !trimmed.startsWith('#')) {
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1);
      flushBuffer();
      blocks.push({
        type: 'keyvalue',
        lines: [...buffer, raw],
        key,
        value,
      });
      buffer = [];
      continue;
    }

    // 注释或其他
    buffer.push(raw);
  }

  flushBuffer();
  return blocks;
}

/**
 * 将区块列表序列化为 .env 字符串
 */
function serializeBlocks(blocks) {
  return blocks.map((b) => b.lines.join('\n')).join('\n');
}

/**
 * 从 .env.example 合并到已有 .env
 *
 * 规则：
 * 1. 以 .env.example 的区块顺序为骨架
 * 2. 已存在的 KEY：保留 .env 的 value，更新 comment
 * 3. 不存在的 KEY：从 example 插入（含注释）
 * 4. .env 中多余的 KEY（不在 example 中）追加到末尾
 * 5. 区块间空行：原样保留 example 区块之间的空行（不做压缩）
 *
 * @param {string} envContent     - .env 文件内容
 * @param {string} exampleContent - .env.example 文件内容
 * @returns {string} 合并后的内容
 */
function mergeExampleIntoEnv(envContent, exampleContent) {
  const envBlocks = parseEnvToBlocks(envContent);
  const exampleBlocks = parseEnvToBlocks(exampleContent);

  // 构建 .env 的 KEY→区块映射（只取最后一个出现的值）
  // 同时匹配 keyvalue 和 commented_keyvalue，确保走注释的变量值也被保留
  const envKeyMap = new Map();
  for (const b of envBlocks) {
    if ((b.type === 'keyvalue' || b.type === 'commented_keyvalue') && b.key) {
      envKeyMap.set(b.key, b);
    }
  }

  // 按 example 的区块顺序构建输出
  const outBlocks = [];
  const seenKeys = new Set(); // example 中处理过的 KEY

  for (const exBlock of exampleBlocks) {
    if (exBlock.type === 'keyvalue' && exBlock.key) {
      // example 中已激活的变量
      const key = exBlock.key;
      seenKeys.add(key);
      const existing = envKeyMap.get(key);

      if (existing) {
        // KEY 用户已存在：保留用户 value（原文，不加引号），更新 comment/结构
        const newLines = [...exBlock.lines];
        newLines[newLines.length - 1] = `${key}=${existing.value}`;
        outBlocks.push({
          type: 'keyvalue',
          lines: newLines,
          key,
          value: existing.value,
        });
      } else {
        // 用户无此 KEY：直接插入 example 的完整区块
        outBlocks.push({
          type: 'keyvalue',
          lines: [...exBlock.lines],
          key,
          value: exBlock.value,
        });
      }
    } else if (exBlock.type === 'commented_keyvalue' && exBlock.key) {
      // example 中注释掉的变量（# KEY=VALUE）
      const key = exBlock.key;
      seenKeys.add(key);
      const existing = envKeyMap.get(key);

      // 注释就是注释：example 里写成 # KEY=VALUE 就表示「这不是默认配置」，
      // merge 不得把它解开成 KEY=VALUE 替用户做决定。只有用户在 .env 里主动去掉了
      // #（env 侧是 keyvalue）才输出为激活项；其余情况（用户副本仍是注释态、或从未
      // 配置过）一律逐字沿用模板注释行。
      // 这里刻意不回写用户在注释里改过的值：注释行是文档不是配置，模板是它的权威
      // 来源；而且 example 中同一 key 可能多次出现——`# IMPL=true 或 IMPL=1 → ...`
      // 这类散文行与 `# IMPL=` 都会被解析成 commented_keyvalue(IMPL)，按 key 回写
      // 用户值会把散文行改写成用户值并重复输出。
      // 反向（example 已激活 / 用户副本仍注释）在上方 keyvalue 分支按模板激活，
      // 那是模板作者把选项提升为默认值的显式动作，与「注释被解开」是两回事；
      // 已激活项永不反向注释（见 config-updater.test.js 的同名约定）。
      // 历史缺陷：曾按「.env 里存在这个 key」判激活。全新 .env 由模板逐字生成即含
      // 注释行，第二次跑 deploy/start 就静默激活「# CORS_ORIGINS=公网域名」这类模板
      // 默认值 → 生产环境 CORS 白名单整体替换掉 FRONTEND_URL，本机前端所有接口预检
      // 204 通过却拿不到 Access-Control-Allow-Origin，浏览器只报 TypeError:
      // Failed to fetch 且后端零日志。
      if (existing && existing.type === 'keyvalue') {
        // 用户已显式激活（去掉 #）→ 保留用户值
        outBlocks.push({
          type: 'keyvalue',
          lines: [`${key}=${existing.value}`],
          key,
          value: existing.value,
        });
      } else {
        outBlocks.push({ ...exBlock, lines: [...exBlock.lines] });
      }
    } else {
      // section_header 或 comment — 原样保留
      outBlocks.push({ ...exBlock, lines: [...exBlock.lines] });
    }
  }

  // 追加 .env 中有但 example 中没有的 KEY（用户自定义）
  const extraKeys = [];
  for (const b of envBlocks) {
    if ((b.type === 'keyvalue' || b.type === 'commented_keyvalue') && b.key && !seenKeys.has(b.key)) {
      extraKeys.push(b);
    }
  }
  if (extraKeys.length > 0) {
    outBlocks.push({
      type: 'comment',
      lines: ['', '# ===== 用户自定义配置 ====='],
    });
    for (const b of extraKeys) {
      outBlocks.push(b);
    }
    outBlocks.push({ type: 'comment', lines: [''] });
  }

  return serializeBlocks(outBlocks);
}

/**
 * .env 值转义（唯一转义约定，与 parseEnvFile/parseEnvFileSimple 的剥引号逻辑配对）：
 * 含 shell 敏感字符（#、空白、$、反引号、!、&、|、;、<、>）的值必须加双引号——
 * 否则 dotenv 把 # 当行内注释：以 # 开头的口令解析为空值（后端首次启动创建
 * 管理员失败、PM2 反复重启），# 在中间的口令被静默截断（用户拿到的口令 ≠ 实际口令）。
 * runtime 包内所有写 .env 的路径（updateEnvFile、setup-offline fillEmptySecrets）
 * 必须走本函数，不得裸写值。
 * config-service 是 0 依赖独立包、无法 require 本函数，在
 * packages/config-service/lib/env.js（updateEnvFile）保留逐字相同的副本——
 * 两侧 escape 字符类必须同步修改，漂移守卫见 config-updater.test.js
 * （断言 runtime 实现 / config-service 实现 / 测试文件 SENSITIVE_RE 三份逐字一致）。
 * @param {string} value
 * @returns {string}
 */
function escapeEnvValue(value) {
  const s = String(value);
  return /[#\s$`!&|;<>]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

/**
 * 更新 .env 文件（增强版）
 *
 * 对比原版 cli.js updateEnvFile() 的增强：
 * - 支持新增 KEY（原版只能更新已有 KEY）
 * - 支持传入 examplePath 同步注释
 * - 保留文件结构
 *
 * @param {string} filePath    - .env 文件路径
 * @param {object} updates     - {KEY: value, ...}
 * @param {string} [examplePath] - .env.example 路径（用于获取注释和结构）
 * @returns {boolean}
 */
function updateEnvFile(filePath, updates, examplePath) {
  if (!fs.existsSync(filePath)) {
    error(`文件不存在: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const blocks = parseEnvToBlocks(content);
  const keyIndex = new Map(); // KEY → block index

  blocks.forEach((b, i) => {
    if (b.type === 'keyvalue' && b.key) keyIndex.set(b.key, i);
  });

  let changed = false;

  for (const [key, newValue] of Object.entries(updates)) {
    const idx = keyIndex.get(key);
    const escapedValue = escapeEnvValue(newValue);

    if (idx !== undefined) {
      // 更新已有 KEY
      const block = blocks[idx];
      const newLine = `${key}=${escapedValue}`;
      if (block.lines[block.lines.length - 1] !== newLine) {
        block.lines[block.lines.length - 1] = newLine;
        block.value = escapedValue;
        changed = true;
      }
    } else {
      // 新增 KEY
      const newBlock = {
        type: 'keyvalue',
        lines: [`${key}=${escapedValue}`],
        key,
        value: escapedValue,
      };
      blocks.push(newBlock);
      keyIndex.set(key, blocks.length - 1);
      changed = true;
      log(`  新增配置项：${key}`);
    }
  }

  // 如果提供了 examplePath，同步注释
  if (examplePath && fs.existsSync(examplePath)) {
    const exampleContent = fs.readFileSync(examplePath, 'utf8');
    const mergedContent = mergeExampleIntoEnv(
      serializeBlocks(blocks),
      exampleContent
    );
    // 与磁盘原内容比较：merged 与 serializeBlocks(blocks) 都含新值，结构一致时恒相等，
    // 按旧判据比较会跳过写入 → 值更新静默丢失（windows 宿主 E2E 暴露：端口移位未落盘，
    // v1 linux 端口冲突场景同样受影响）
    if (mergedContent !== content) {
      fs.writeFileSync(filePath, mergedContent, 'utf8');
      log(`更新：${filePath}（同步注释和结构）`);
    }
    return true;
  }

  // 无 examplePath：仅做简单的 KEY 更新
  if (changed) {
    fs.writeFileSync(filePath, serializeBlocks(blocks), 'utf8');
    log(`更新：${filePath}`);
  }

  return true;
}

// ==================== 转换服务配置一致性 ====================

/**
 * 本机形态主机名（与 lib/infra-gate.js 的 isLocalHost 同口径）。
 * 不能 require 它：config-updater ← lib/env ← lib/context ← lib/infra-gate 会成环，
 * 故在此保留副本，漂移守卫见 config-updater.test.js 的「本机形态口径」用例。
 */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * 解析 http(s) 服务地址的 host:port 段（URL 其余部分逐字保留）。
 *
 * 与 lib/infra-gate.js 的 parseDatabaseUrlHostPort 同构（仅协议与默认端口不同，
 * 后者硬编码 postgresql:// 故不能复用）。用「找 ':' 再切」而非捕获组切分：
 * 捕获组会把分隔符（/ ? #）吃掉，重组时静默丢失。
 *
 * @param {string} url 服务地址
 * @returns {{host: string, port: number|null, prefix: string, rest: string}|null}
 *   host    主机名（不含端口与 IPv6 方括号）
 *   port    端口段（无端口段时为 null）
 *   prefix  `http://[userinfo@]host`（端口段之前的部分，IPv6 保留方括号）
 *   rest    端口段之后的部分（含 /路径、查询参数与分隔符，逐字保留）
 *   形状无法识别（非 http(s):// 开头 / 空主机 / 空值）返回 null
 */
function parseHttpServiceUrl(url) {
  const text = String(url || '').trim();
  const schemeEnd = text.indexOf('://');
  if (schemeEnd < 2 || !/^https?$/.test(text.slice(0, schemeEnd))) return null;

  // userinfo 之后的部分才是 host[:port][/rest]；userinfo 内的 ':'（口令）不是端口
  const at = text.indexOf('@', schemeEnd + 3);
  const hostStart = at >= 0 ? at + 1 : schemeEnd + 3;

  // IPv6 主机须用方括号（裸 ::1 在 URL 中非法，归「形状无法识别」）
  let hostEnd;
  if (text[hostStart] === '[') {
    const close = text.indexOf(']', hostStart);
    if (close < 0) return null;
    hostEnd = close + 1;
  } else {
    const delim = text.slice(hostStart).search(/[:/?#\s]/);
    hostEnd = delim >= 0 ? hostStart + delim : text.length;
  }
  const host = text.slice(hostStart, hostEnd);
  if (!host) return null;
  const prefix = text.slice(0, hostEnd);

  let port = null;
  let rest = text.slice(hostEnd);
  if (text[hostEnd] === ':') {
    const portMatch = /^\d{1,5}/.exec(text.slice(hostEnd + 1));
    if (!portMatch) return null;
    port = Number(portMatch[0]);
    rest = text.slice(hostEnd + 1 + portMatch[0].length);
  }
  return { host: host.replace(/^\[|\]$/g, ''), port, prefix, rest };
}

/**
 * CONVERSION_SERVICE_URL ↔ CONVERSION_SERVICE_PORT 一致性修复。
 *
 * CONVERSION_SERVICE_PORT 是端口的单一事实源（start.js / verify-deploy.js 经
 * PORTS.conversion 据此拉起转换服务），CONVERSION_SERVICE_URL 是后端连接转换服务的
 * 地址。后端对该键的缺省值是**硬编码字面量** http://localhost:3100
 * （configuration.ts / http-conversion.executor.ts），不读 CONVERSION_SERVICE_PORT——
 * 故只改 PORT 不改 URL 会让后端恒连旧端口，转换全部静默失败且启动无感。
 *
 * 与 repairDatabaseUrlConsistency（DATABASE_URL ↔ DB_PORT）同一模式、同一写入口：
 * - 仅 FUNCTION_EXECUTOR=conversion-service 时执行（其他模式本键无人消费，改写是噪声）；
 * - 仅 URL 主机是本机形态时改写端口段——远程转换服务（如 helm standalone 的
 *   http://cloudcad-conversion:3100）不由本部署拉起，CONVERSION_SERVICE_PORT 对其
 *   无意义，不得猜测；
 * - URL 形状无法识别 → 原样保留（后端按用户显式值尝试）；
 * - 只动端口段，端口段以外的字节逐字保留。
 *
 * 幂等：已一致时不改文件、不打印日志，可被调用方重复调用。
 *
 * @param {string} envPath 后端 .env 路径
 * @returns {'missing'|'skipped'|'ok'|'repaired'|'failed'}
 */
function alignConversionServiceUrl(envPath) {
  if (!envPath || !fs.existsSync(envPath)) return 'missing';

  let envConfig;
  try {
    envConfig = parseEnvContent(fs.readFileSync(envPath, 'utf8'));
  } catch {
    return 'missing';
  }

  if (
    String(envConfig.FUNCTION_EXECUTOR || '')
      .trim()
      .toLowerCase() !== 'conversion-service'
  ) {
    return 'skipped';
  }

  // 与 lib/context.js 的 PORTS.conversion 同回退口径（非正整数 → 3100）
  const declared = parseInt(String(envConfig.CONVERSION_SERVICE_PORT || '').trim(), 10);
  const port = Number.isInteger(declared) && declared > 0 ? declared : 3100;

  const url = String(envConfig.CONVERSION_SERVICE_URL || '').trim();
  const parsed = url ? parseHttpServiceUrl(url) : null;

  let aligned = null;
  if (!url) {
    // 后端缺省字面量已含 3100，端口未改时无需补写
    aligned = port === 3100 ? null : `http://localhost:${port}`;
  } else if (parsed && LOCAL_HOSTNAMES.has(String(parsed.host).toLowerCase())) {
    aligned = parsed.port === port ? null : `${parsed.prefix}:${port}${parsed.rest}`;
  }
  if (aligned === null) return 'ok';

  if (!updateEnvFile(envPath, { CONVERSION_SERVICE_URL: aligned })) {
    error(`CONVERSION_SERVICE_URL 对齐写入失败：${envPath}`);
    return 'failed';
  }
  log(
    url
      ? `CONVERSION_SERVICE_URL（${url}）与 CONVERSION_SERVICE_PORT（${port}）不一致，已对齐为 ${aligned}`
      : `CONVERSION_SERVICE_URL 缺失而 CONVERSION_SERVICE_PORT=${port}，已补写 ${aligned}`
  );
  return 'repaired';
}

/**
 * 把转换服务端口同步到 conversion-service 自己的 .env。
 *
 * conversion-service 刻意不读 backend 的 .env（独立进程/独立部署，只认自己的），
 * 而 start.js 的端口顺延只回写 backend/.env。于是同一事实存两份、只有一份被改写：
 * 顺延到 3103 后，源码 dev 起的转换服务仍按自己 .env 的 3100 监听，后端却连 3103
 * ——上传转换全部 ECONNREFUSED，且错误信息为空串（2026-10-21 实例：连续多次 start
 * 各自撞上上一轮残留实例，端口从 3100 一路顺延到 3103）。
 *
 * 文件不存在时返回 'missing'（部署包不带该文件、端口由 start.js 经 process.env 注入，
 * 无需同步）。
 *
 * @param {string} conversionEnvPath packages/conversion-service/.env 路径
 * @param {number|string} port 顺延后的端口
 * @returns {'missing'|'ok'|'repaired'|'failed'}
 */
function syncConversionServiceEnvPort(conversionEnvPath, port) {
  if (!conversionEnvPath || !fs.existsSync(conversionEnvPath)) return 'missing';
  let current;
  try {
    current = parseEnvContent(fs.readFileSync(conversionEnvPath, 'utf8'))
      .CONVERSION_SERVICE_PORT;
  } catch {
    return 'missing';
  }
  const wanted = String(port);
  if (String(current ?? '').trim() === wanted) return 'ok';

  if (!updateEnvFile(conversionEnvPath, { CONVERSION_SERVICE_PORT: wanted })) {
    error(`转换服务端口同步写入失败：${conversionEnvPath}`);
    return 'failed';
  }
  log(
    current === undefined
      ? `conversion-service/.env 补写 CONVERSION_SERVICE_PORT=${wanted}（与后端对齐）`
      : `conversion-service/.env 的端口 ${current} 已同步为 ${wanted}（与后端对齐）`
  );
  return 'repaired';
}

// ==================== 导出 ====================

module.exports = {
  // 核心函数
  mergeWithMissingOnly,
  parseEnvContent,
  serializeEnvContent,

  // JSON 配置更新
  updateJsonConfig,
  updateFrontendConfigs,

  // .env 配置更新
  updateEnvConfig,
  updateEnvConfigs,

  // 高级 .env 合并
  parseEnvToBlocks,
  serializeBlocks,
  mergeExampleIntoEnv,
  updateEnvFile,
  escapeEnvValue,
  alignConversionServiceUrl,
  syncConversionServiceEnvPort,

  // 包装函数
  updateFrontendConfigsWrapper,
  updateBackendEnv,
  updateAllConfigs,
};
