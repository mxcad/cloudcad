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

      if (existing) {
        // 用户有此 key → 激活（取消注释），使用用户值
        outBlocks.push({
          type: 'keyvalue',
          lines: [`${key}=${existing.value}`],
          key,
          value: existing.value,
        });
      } else {
        // 用户无此 key → 保持注释
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
    const escapedValue = /[#\s$`!&|;<>]/.test(String(newValue))
      ? `"${String(newValue).replace(/"/g, '\\"')}"`
      : String(newValue);

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
    if (mergedContent !== serializeBlocks(blocks)) {
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

  // 包装函数
  updateFrontendConfigsWrapper,
  updateBackendEnv,
  updateAllConfigs,
};
