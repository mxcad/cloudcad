# 转换引擎配置与环境变量审计报告

## 1. 概述

本报告对 CloudCAD 转换引擎 (`packages/conversion-engine/`) 进行全面的配置审计，涵盖环境变量、并发控制机制、格式转换参数差异以及错误处理和日志记录机制。

---

## 2. 转换引擎配置项

### 2.1 核心配置接口

转换引擎通过 `ConversionEngineConfig` 接口定义配置项：

| 配置项 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `binPath` | string | 是 | - | MxCAD 转换程序可执行文件路径 |
| `outputRoot` | string | 是 | - | 转换输出文件的根目录 |
| `maxConcurrency` | number | 否 | 3 | 最大并发转换任务数 |
| `defaultTimeoutMs` | number | 否 | 300000 | 默认超时时间（毫秒） |

### 2.2 环境变量映射

后端配置系统通过 `.env` 文件注入转换引擎相关配置：

| 环境变量 | 配置路径 | 默认值 | 说明 |
|----------|----------|--------|------|
| `MXCAD_ASSEMBLY_PATH` | `mxcad.assemblyPath` | `runtime/windows/mxcad/mxcadassembly.exe` | MxCAD 转换程序路径 |
| `MXCAD_UPLOAD_PATH` | `mxcadUploadPath` | `data/uploads` | 上传临时目录 |
| `MXCAD_TEMP_PATH` | `mxcadTempPath` | `data/temp` | 临时文件目录 |
| `MXCAD_FONTS_PATH` | `mxcad.fontsPath` | `runtime/windows/mxcad/fonts` | 字体目录 |
| `MXCAD_FILE_EXT` | `mxcad.fileExt` | `.mxweb` | 输出文件扩展名 |
| `MXCAD_COMPRESSION` | `mxcad.compression` | `true` | 是否启用压缩 |
| `TIMEOUT_FILE_CONVERSION` | `timeout.fileConversion` | `60000` | 文件转换超时（毫秒） |
| `UPLOAD_MAX_CONCURRENT` | `upload.maxConcurrent` | `3` | 最大并发上传/转换数 |
| `MXCAD_DWG2JPG_PATH` | `thumbnail.dwg2JpgPath` | `runtime/windows/mxcad/tool/MxWebDwg2Jpg.exe` | 缩略图生成工具路径 |
| `THUMBNAIL_WIDTH` | `thumbnail.width` | `120` | 缩略图宽度（像素） |
| `THUMBNAIL_HEIGHT` | `thumbnail.height` | `120` | 缩略图高度（像素） |
| `THUMBNAIL_AUTO_GENERATE_ENABLED` | `thumbnail.autoGenerateEnabled` | `true` | 是否自动生成缩略图 |

### 2.3 路径解析规则

配置中的路径支持相对路径和绝对路径：
- **绝对路径**: 直接使用配置值
- **相对路径**: 基于项目根目录解析（`apps/backend/../..`）

```typescript
// 路径解析逻辑 (configuration.ts:28-42)
function resolvePath(inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return path.normalize(inputPath);
  }
  const projectRoot = path.join(process.cwd(), '..', '..');
  return path.resolve(projectRoot, inputPath);
}
```

---

## 3. 并发控制实现分析

### 3.1 信号量机制

转换引擎使用内置的 `Semaphore` 类实现并发控制：

```typescript
// process-runner.service.ts:20-52
class Semaphore {
  private current = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.current--;
    }
  }
}
```

**关键特性：**
- **公平队列**: 使用 FIFO 队列管理等待任务
- **非阻塞获取**: 通过 Promise 实现异步等待
- **状态监控**: 提供 `running` 和 `waiting` 属性

### 3.2 队列管理

任务执行流程：
1. **获取信号量许可** → 等待队列（如果满）
2. **启动子进程** → `child_process.spawn`
3. **执行完成/超时** → 释放信号量许可
4. **唤醒等待任务** → 从队列取出下一个

### 3.3 超时机制

超时处理采用两级策略：

| 阶段 | 动作 | 时间 |
|------|------|------|
| 超时触发 | 发送 SIGTERM 信号 | 配置的 timeoutMs |
| SIGTERM 无效 | 发送 SIGKILL 强制终止 | 额外 5 秒 |

```typescript
// 超时处理逻辑 (process-runner.service.ts:221-235)
const timer = setTimeout(() => {
  timedOut = true;
  child.kill('SIGTERM');
  
  setTimeout(() => {
    if (!child.killed && !settled) {
      child.kill('SIGKILL');
    }
  }, 5_000);
}, timeoutMs);
```

### 3.4 重试机制

支持可配置的重试策略：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `maxRetries` | 0 | 最大重试次数（0 表示不重试） |
| `retryDelayMs` | 1000 | 重试间隔（毫秒） |

---

## 4. 格式转换参数差异

### 4.1 支持的转换格式

| 格式 | 方法 | 输出扩展名 | 说明 |
|------|------|-----------|------|
| mxweb | `toMxweb()` | `.mxweb` | CAD → MxWeb 在线格式 |
| dwg | `toDwg()` | `.dwg` | MxWeb → DWG 原生格式 |
| pdf | `toPdf()` | `.pdf` | CAD → PDF 文档 |
| thumbnail | `generateThumbnail()` | `.jpg` | 生成缩略图 |
| bins | `splitToBins()` | `.bin` | 大文件分片 |

### 4.2 参数对比矩阵

| 参数 | mxweb | dwg | pdf | thumbnail | bins |
|------|-------|-----|-----|-----------|------|
| `timeoutMs` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `outputDir` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `outputName` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `width` | - | - | ✓ | ✓ | - |
| `height` | - | - | ✓ | ✓ | - |
| `colorPolicy` | - | - | ✓ | - | - |
| `quality` | - | - | - | ✓ | - |

### 4.3 命令行参数构建

不同格式的命令行参数差异：

```typescript
// PDF 转换 (format-converter.service.ts:113-124)
const args: string[] = ['-i', sourcePath, '-o', outputPath, '-f', 'pdf'];
if (options?.width) args.push('-w', String(options.width));
if (options?.height) args.push('-h', String(options.height));
if (options?.colorPolicy) args.push('--color', options.colorPolicy);

// 缩略图生成 (format-converter.service.ts:160-177)
const args: string[] = ['-i', sourcePath, '-o', outputPath, '-f', 'thumbnail'];
if (options?.width) args.push('-w', String(options.width));
if (options?.height) args.push('-h', String(options.height));
if (options?.quality) args.push('-q', String(options.quality));
```

### 4.4 输出路径差异

| 格式 | 输出类型 | 路径规则 |
|------|---------|----------|
| mxweb/dwg/pdf/thumbnail | 文件 | `{outputRoot}/{basename}.{ext}` |
| bins | 目录 | `{outputRoot}/{basename}_bins/` |

---

## 5. 错误处理与日志记录

### 5.1 错误类型体系

**ProcessError 自定义异常**：

```typescript
// process-runner.service.ts:57-74
export class ProcessError extends Error {
  public readonly binaryPath: string;
  public readonly durationMs: number;
  public readonly cause?: Error;

  constructor(
    message: string,
    binaryPath: string,
    durationMs: number,
    cause?: Error,
  ) {
    super(message);
    this.name = 'ProcessError';
    this.binaryPath = binaryPath;
    this.durationMs = durationMs;
    this.cause = cause;
  }
}
```

### 5.2 错误场景分类

| 错误类型 | 触发条件 | 处理方式 |
|----------|----------|----------|
| 进程启动失败 | 二进制文件不存在/权限不足 | 抛出 `ProcessError` |
| 执行超时 | 超过配置的 timeoutMs | 抛出 `ProcessError` |
| 退出码非零 | 外部程序执行失败 | 返回带错误信息的 `ConversionResult` |
| JSON 解析失败 | stdout 无合法 JSON | 使用 fallback 路径 |

### 5.3 日志记录策略

**日志级别分布**：

| 级别 | 使用场景 | 示例 |
|------|----------|------|
| `log` | 服务初始化 | `ProcessRunnerService 初始化: 最大并发 3, 默认超时 300000ms` |
| `debug` | 进程执行细节 | `[running=2 queued=1] 执行: /path/to/bin -i input.dwg -o output.mxweb` |
| `warn` | 可恢复异常 | `进程退出码非零: ...`, `进程超时...` |
| `error` | 不可恢复异常 | `创建目录失败: /path/to/dir` |

### 5.4 转换结果处理

```typescript
// 错误处理模式 (format-converter.service.ts:58-64)
if (result.exitCode !== 0) {
  return {
    success: false,
    outputPaths: [],
    error: `MxWeb 转换失败: ${result.stderr || result.stdout}`,
    durationMs: result.durationMs,
  };
}
```

---

## 6. 架构设计亮点

### 6.1 依赖注入设计

转换引擎采用接口抽象实现解耦：

```typescript
// 模块注册 (conversion.module.ts:39-59)
static forRoot(config: ConversionEngineConfig): DynamicModule {
  return {
    module: ConversionModule,
    providers: [
      { provide: CONVERSION_ENGINE_CONFIG, useValue: config },
      { provide: I_CONVERSION_SERVICE, useClass: FormatConverterService },
      ProcessRunnerService,
      FormatConverterService,
      OutputPathResolverService,
    ],
    exports: [I_CONVERSION_SERVICE, ProcessRunnerService, OutputPathResolverService],
  };
}
```

**优势**：
- **可替换实现**: 通过 `I_CONVERSION_SERVICE` token 支持不同转换引擎
- **配置集中化**: 所有配置通过单一配置对象注入
- **模块独立**: 转换引擎作为独立 package 可复用

### 6.2 输出路径解析

`OutputPathResolverService` 统一管理路径生成：

| 功能 | 实现 |
|------|------|
| 格式→扩展名映射 | `FORMAT_EXTENSIONS` 静态映射表 |
| 唯一文件名生成 | `${name}_${timestamp}_${random}` |
| 目录自动创建 | `mkdir -p` 语义（忽略 EEXIST） |

---

## 7. 潜在改进建议

### 7.1 配置增强

| 建议 | 说明 |
|------|------|
| 增加监控指标 | 暴露并发数、队列长度、执行耗时等指标 |
| 动态配置支持 | 支持运行时调整并发数和超时时间 |
| 配置验证 | 启动时校验 binPath 可执行性 |

### 7.2 错误处理增强

| 建议 | 说明 |
|------|------|
| 错误分类细化 | 区分不同类型的转换失败原因 |
| 告警机制 | 高失败率时触发告警 |
| 错误日志结构化 | 使用 JSON 格式输出便于日志分析 |

### 7.3 并发控制优化

| 建议 | 说明 |
|------|------|
| 动态并发调整 | 根据系统负载自动调整并发数 |
| 任务优先级 | 支持优先级队列 |
| 资源限制感知 | 考虑 CPU/内存使用情况 |

---

## 8. 总结

转换引擎配置体系设计合理，具备以下特点：

1. **配置灵活性**: 支持环境变量配置和运行时注入两种方式
2. **并发安全**: 信号量机制确保资源合理利用
3. **健壮性**: 完善的超时处理和重试机制
4. **可扩展性**: 接口抽象支持多种转换实现
5. **可观测性**: 多层次日志记录便于问题排查

整体架构符合 NestJS 最佳实践，配置与代码分离，便于运维和扩展。