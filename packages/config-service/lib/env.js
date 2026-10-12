const fs = require('fs');
const { log } = require('./utils');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};

  content.split('\n').forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eqIndex = line.indexOf('=');
    if (eqIndex > 0) {
      const key = line.substring(0, eqIndex).trim();
      let value = line.substring(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  });

  return result;
}

function updateEnvFile(filePath, updates) {
  let content = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8')
    : '';

  Object.entries(updates).forEach(([key, value]) => {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapedKey}=.*$`, 'm');
    // escape 字符类刻意与 runtime/scripts/config-updater.js 的 escapeEnvValue 逐字一致
    // （本包是 0 依赖独立服务，无法 require 它）；改一侧必须同步改另一侧——
    // 漂移守卫见 runtime/scripts/config-updater.test.js
    const needsQuotes = /[#\s$`!&|;<>]/.test(value);
    const escapedValue = needsQuotes
      ? `"${value.replace(/"/g, '\\"')}"`
      : value;
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${escapedValue}`);
    } else {
      content += `\n${key}=${escapedValue}`;
    }
  });

  fs.writeFileSync(filePath, content, 'utf8');
}

module.exports = {
  parseEnvFile,
  updateEnvFile,
};
