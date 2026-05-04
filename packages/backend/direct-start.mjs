
import 'tsx/esm';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 开始启动后端服务...');
console.log('📍 当前目录:', __dirname);

// 设置环境变量
process.env.NODE_ENV = 'development';

// 直接导入 main.ts
const mainTsPath = resolve(__dirname, 'src/main.ts');
const mainTsUrl = pathToFileURL(mainTsPath).href;
console.log('📄 主文件:', mainTsPath);

try {
  await import(mainTsUrl);
  console.log('✅ 导入成功');
} catch (error) {
  console.error('❌ 启动失败:', error);
  process.exit(1);
}
