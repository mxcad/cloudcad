#!/usr/bin/env node

/**
 * 从后端 Swagger API 生成前端类型定义
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES 模块中获取 __dirname 的等效方法
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SWAGGER_URL = 'http://localhost:3001/api/docs';
const OUTPUT_FILE = path.join(__dirname, '../types/api.ts');

async function generateTypes() {
  try {
    console.log('🚀 开始生成前端类型定义...');
    
    // 确保输出目录存在
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 检查后端服务是否运行
    console.log('📡 检查后端服务状态...');
    try {
      await fetch(`${SWAGGER_URL}-json`);
    } catch (error) {
      console.error('❌ 后端服务未运行，请先启动后端: pnpm dev');
      process.exit(1);
    }

    // 生成类型定义
    console.log('📝 正在生成类型定义...');
    const command = `npx openapi-typescript ${SWAGGER_URL}-json -o ${OUTPUT_FILE}`;
    
    execSync(command, { stdio: 'inherit' });
    
    console.log('✅ 类型定义生成完成!');
    console.log(`📁 输出文件: ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('❌ 生成类型定义失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  generateTypes();
}

export { generateTypes };