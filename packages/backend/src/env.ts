// 预加载 .env / .env.local。
// 必须在任何模块求值（如 AuthModule.forRoot()）之前完成：
// FileSystemModule/HealthModule 等在 import 阶段就会调用 AuthModule.forRoot()，
// 若此时 process.env.IMPL 尚不可见，会误缓存 OSS 默认认证实现，导致 IMPL=1 不生效。
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

const backendDir = join(__dirname, '..');

const envFilePaths = [
  join(process.cwd(), '.env.local'),
  join(process.cwd(), '.env'),
  join(backendDir, '.env.local'),
  join(backendDir, '.env'),
];

const merged: Record<string, string> = {};
for (const envFilePath of envFilePaths) {
  if (existsSync(envFilePath)) {
    Object.assign(merged, dotenv.parse(readFileSync(envFilePath)));
  }
}

for (const [key, value] of Object.entries(merged)) {
  if (!(key in process.env)) {
    process.env[key] = value;
  }
}
