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

function extractDbNameFromUrl(url) {
  if (!url) return null;
  try {
    const match = url.match(/\/([^/?]+)(\?|$)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function updateEnvFile(filePath, updates) {
  let content = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8')
    : '';

  Object.entries(updates).forEach(([key, value]) => {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapedKey}=.*$`, 'm');
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
  extractDbNameFromUrl,
  updateEnvFile,
};
