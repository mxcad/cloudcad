import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 通过 import.meta.url 获取当前文件路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 修正：移除 color1 字符串末尾多余的引号
const filePath = path.resolve(__dirname, '../src/styles/icon.js');
const svgProps = `shape-rendering="geometricPrecision"`;

function insertStr(source, start, newStr) {
  return source.slice(0, start) + newStr + source.slice(start);
}

fs.readFile(filePath, 'utf-8', (err, data) => {
  if (err) throw err;

  // 1. 将 fill="#FFFFFF" 替换为 currentColor
  // 2. 移除 fill="#89CBFA"（注意：原 color1 定义有语法错误，已直接写入正则）
  let newData = data
    .replace(/fill="#FFFFFF"/gi, 'fill="currentColor"')
    .replace(/fill="#89CBFA"/gi, ''); // 修正：移除错误引号

  // 添加 SVG 渲染属性（如果不存在）
  if (!newData.includes(svgProps)) {
    const queryCriteriaStr = '<svg';
    const index = newData.indexOf(queryCriteriaStr);
    if (index !== -1) {
      newData = insertStr(newData, index + queryCriteriaStr.length, ' ' + svgProps);
    }
  }

  fs.writeFile(filePath, newData, (err) => {
    if (err) throw err;
    console.log(`${filePath} 转换成功`);
  });
});