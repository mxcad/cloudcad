const path = require('path');
const fs = require('fs');

console.log('========== 调试 Preloading 文件路径构建 ==========');
console.log('');

// 模拟数据
const nodeId = 'cml92vbqy0005xkufgnc96hdi';
const fileHash = 'f72f8517355ec1d0720d87a2f32249b7';
const basePath = 'D:\\web\\MxCADOnline\\cloudcad\\filesData';

// 模拟 sourceNode.path
const sourceNodePath = '202602/cml92vbqy0005xkufgnc96hdi/cml92vbqy0005xkufgnc96hdi.dwg.mxweb';

console.log('1. 模拟 getStorageRootPath(nodeId):');
console.log('   sourceNode.path:', sourceNodePath);
console.log('   fullPath:', path.resolve(basePath, sourceNodePath));
const directoryPath = path.dirname(path.resolve(basePath, sourceNodePath));
console.log('   directoryPath:', directoryPath);
console.log('');

console.log('2. 模拟 getPreloadingData(nodeId):');
console.log('   nodeId:', nodeId);
console.log('   directoryPath:', directoryPath);
const preloadingFileName = `${nodeId}.dwg.mxweb_preloading.json`;
console.log('   preloadingFileName:', preloadingFileName);
const preloadingFilePath = path.join(directoryPath, preloadingFileName);
console.log('   preloadingFilePath:', preloadingFilePath);
console.log('');

console.log('3. 检查文件是否存在:');
const exists = fs.existsSync(preloadingFilePath);
console.log('   文件存在:', exists);

if (exists) {
  const stats = fs.statSync(preloadingFilePath);
  console.log('   文件大小:', stats.size, 'bytes');

  const content = fs.readFileSync(preloadingFilePath, 'utf-8');
  const data = JSON.parse(content);
  console.log('   外部参照数量:', data.externalReference?.length || 0);
  console.log('   图片数量:', data.images?.length || 0);
  console.log('   Preloading 内容:');
  console.log(JSON.stringify(data, null, 2));
} else {
  console.log('   文件不存在，尝试其他路径...');

  // 尝试其他可能的文件名
  const alternatives = [
    path.join(directoryPath, `${fileHash}.dwg.mxweb_preloading.json`),
    path.join(directoryPath, `${nodeId}.mxweb_preloading.json`),
    path.join(directoryPath, `${fileHash}.mxweb_preloading.json`),
  ];

  alternatives.forEach(altPath => {
    if (fs.existsSync(altPath)) {
      console.log('   找到文件:', altPath);
    }
  });
}

console.log('');
console.log('4. 检查目录中的所有文件:');
if (fs.existsSync(directoryPath)) {
  const files = fs.readdirSync(directoryPath);
  console.log('   目录内容:');
  files.forEach(file => {
    const filePath = path.join(directoryPath, file);
    const stats = fs.statSync(filePath);
    const isDir = stats.isDirectory();
    console.log(`     ${isDir ? '[DIR]' : '[FILE]'} ${file}`);
  });
}

console.log('');
console.log('========== 调试完成 ==========');