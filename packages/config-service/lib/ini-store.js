const fs = require('fs');
const path = require('path');

/**
 * 配置 JSON 文件的共享存储原语（6 个配置适配器共用的「存储协议」单一事实源）。
 *
 * 收敛此前每个 adapter 各抄一遍的：建目录 / 读(缺失→从内置 source 拷贝落盘) /
 * 写 / reset(从内置 source 还原)。各 adapter 的领域差异（validateConfig 校验、
 * 是否 seed、reset 是否校验 source）留在 adapter 自己，本模块只提供文件读写原语。
 *
 * ⚠️ reset 是否校验 source 由各 adapter 显式传入 validate 决定，不可统一：
 * ui/server/sketches 的内置 source 与各自 schema 存在漂移（如 ui 的 logoImg 非布尔、
 * footerRightBtnSwitchData 含 schema 未列的枚举值），强制校验会令 reset 恒失败，
 * 故它们不校验；theme/quick-command 的 source 通过校验，reset 时校验以防内置源损坏。
 */

/** 建目录（不存在则递归创建）。 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** 读 JSON 文件；缺失或解析失败 → null。 */
function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** 写 JSON 文件（2 空格缩进，UTF-8）。 */
function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 「首次缺失 → 从内置 source 拷贝落盘」的 seed 读取。
 * source 缺失或不可读 → null（不写盘）。
 */
function seedFromSource(configPath, sourcePath) {
  if (!fs.existsSync(sourcePath)) return null;
  const source = readJsonFile(sourcePath);
  if (source == null) return null;
  writeJsonFile(configPath, source);
  return source;
}

/**
 * getConfig 语义（seed 型 adapter 用）：config 存在→读它；缺失→从 source seed 落盘；
 * source 也缺失→null。封装「先判存在再 seed」的分支，adapter 无需直接碰 fs。
 */
function readOrSeed(configPath, sourcePath) {
  if (fs.existsSync(configPath)) return readJsonFile(configPath);
  return seedFromSource(configPath, sourcePath);
}

/**
 * reset 统一骨架：从内置 source 还原到用户 config。
 *
 * @param {string} sourcePath 内置默认配置
 * @param {string} configPath 用户配置
 * @param {(data)=>string[]} [validate] 可选：对 source 做领域校验（返回 errors[]，非空则拒绝落盘）
 * @returns {{ok:true,data}|{ok:false,error}|{ok:false,errors}}
 */
function resetFromSource(sourcePath, configPath, validate) {
  if (!fs.existsSync(sourcePath)) {
    return { ok: false, error: '默认配置文件不存在，无法还原' };
  }
  let source;
  try {
    source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  } catch (e) {
    return { ok: false, error: '读取默认配置失败: ' + e.message };
  }
  if (validate) {
    const errors = validate(source);
    if (errors && errors.length > 0) return { ok: false, errors };
  }
  // 原 reset 经 updateConfig 落盘（内部建目录）；此处等价地先确保目录存在
  ensureDir(path.dirname(configPath));
  writeJsonFile(configPath, source);
  return { ok: true, data: source };
}

module.exports = {
  ensureDir,
  readJsonFile,
  writeJsonFile,
  seedFromSource,
  readOrSeed,
  resetFromSource,
};
