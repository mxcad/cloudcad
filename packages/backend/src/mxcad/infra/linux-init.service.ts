///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import {
  checkMxAvailableSync,
  getPlatformInfo,
} from '@cloudcad/mx-version-tool';

const execAsync = promisify(exec);

/**
 * Linux 环境初始化服务
 * 在项目启动时自动配置 Linux 环境所需的权限和依赖
 */
@Injectable()
export class LinuxInitService implements OnModuleInit {
  private readonly logger = new Logger(LinuxInitService.name);
  private readonly mxcadDir: string;
  private readonly mxcadBinPath: string;

  constructor(private readonly configService: ConfigService) {
    // 从配置中获取 mxcad 目录路径
    // mxcad.assemblyPath 指向可执行文件，取其父目录即为 mxcad 根目录
    const binPath = this.configService.get<string>('mxcad.assemblyPath');
    this.mxcadBinPath = binPath || path.join(process.cwd(), '..', '..', 'runtime', 'linux', 'mxcad', 'mxcadassembly');
    this.mxcadDir = path.dirname(this.mxcadBinPath);
  }

  /**
   * 模块初始化时执行
   */
  async onModuleInit(): Promise<void> {
    const platformInfo = getPlatformInfo();
    this.logger.log(
      `当前平台: ${platformInfo.platform}, MX 路径: ${platformInfo.mxPath}`
    );

    // 检查 MX 是否可用
    const mxCheck = checkMxAvailableSync();
    if (!mxCheck.available) {
      this.logger.error(`MX 检查失败: ${mxCheck.message}`);
      // Linux 平台 MX 必须安装
      if (os.platform() === 'linux') {
        throw new InternalServerErrorException(mxCheck.message);
      }
    } else {
      this.logger.log(`MX 检查通过: ${mxCheck.message}`);
    }

    // 仅在 Linux 平台执行环境初始化
    if (os.platform() !== 'linux') {
      this.logger.log('当前平台非 Linux，跳过环境初始化');
      return;
    }

    this.logger.log('检测到 Linux 平台，开始环境初始化...');

    // 校验 mxcadassembly 可执行文件路径配置（跨平台 .env 误配置在此 fail-fast）
    this.validateAssemblyPath();

    try {
      await this.initializeLinuxEnvironment();
      this.logger.log('Linux 环境初始化完成');
    } catch (error) {
      this.logger.error(`Linux 环境初始化失败: ${error.message}`);
      this.logger.warn('部分功能可能无法正常工作，请手动执行初始化脚本');
    }
  }

  /**
   * 初始化 Linux 环境
   * 根据文档要求：
   * 1. 设置 mxcadassembly 目录权限
   * 2. 设置 mx/so 目录权限
   * 3. 复制 locale 文件到系统目录
   */
  private async initializeLinuxEnvironment(): Promise<void> {
    const mxcadDir = this.mxcadDir;

    // 检查目录是否存在
    if (!fs.existsSync(mxcadDir)) {
      this.logger.warn(`mxcad 目录不存在: ${mxcadDir}`);
      return;
    }

    // 1. 设置 mxcad 主程序权限
    await this.setExecutablePermissions(mxcadDir);

    // 2. 设置 mx/so 共享库权限
    await this.setSharedLibraryPermissions(mxcadDir);

    // 3. 复制 locale 文件到系统目录
    await this.copyLocaleFiles(mxcadDir);
  }

  /**
   * 校验 mxcadassembly 可执行文件路径配置
   * 防止跨平台 .env 复制导致的 Windows 路径在 Linux 上运行（exit 127）
   * 生产环境 fail-fast，开发环境仅告警（允许先启动后补二进制）
   */
  private validateAssemblyPath(): void {
    const isProduction =
      this.configService.get<string>('nodeEnv') === 'production';

    // 跨平台误配置检测：Linux 上以 .exe 结尾的一定是 Windows 路径
    // 配置层（configuration.ts resolveMxExecutablePath）已自动回退平台默认路径，
    // 此处仅作为防御性检查，不阻塞启动
    if (path.extname(this.mxcadBinPath).toLowerCase() === '.exe') {
      this.logger.warn(
        `MXCAD_ASSEMBLY_PATH 指向 Windows 可执行文件: ${this.mxcadBinPath}，` +
          `已回退到平台默认路径 runtime/linux/mxcad/mxcadassembly`,
      );
      return;
    }

    if (!fs.existsSync(this.mxcadBinPath)) {
      const message = `mxcadassembly 程序不存在: ${this.mxcadBinPath}（请检查 MXCAD_ASSEMBLY_PATH 配置）`;
      if (isProduction) {
        this.logger.error(message);
        throw new InternalServerErrorException(message);
      }
      this.logger.warn(message);
      return;
    }

    try {
      fs.accessSync(this.mxcadBinPath, fs.constants.X_OK);
    } catch {
      const message = `mxcadassembly 程序没有可执行权限: ${this.mxcadBinPath}（请执行 chmod +x）`;
      if (isProduction) {
        this.logger.error(message);
        throw new InternalServerErrorException(message);
      }
      this.logger.warn(message);
    }
  }

  /**
   * 设置 mxcadassembly 主程序权限
   */
  private async setExecutablePermissions(mxcadDir: string): Promise<void> {
    const mxcadAssemblyPath = this.mxcadBinPath;

    if (!fs.existsSync(mxcadAssemblyPath)) {
      this.logger.warn(`mxcadassembly 程序不存在: ${mxcadAssemblyPath}`);
      return;
    }

    try {
      // 设置可执行权限
      await execAsync(`chmod +x "${mxcadAssemblyPath}"`);
      this.logger.log(`已设置 mxcadassembly 可执行权限`);

      // 设置整个 mxcad 目录权限
      await execAsync(`chmod -R 755 "${mxcadDir}"`);
      this.logger.log(`已设置 mxcad 目录权限`);
    } catch (error) {
      this.logger.error(`设置 mxcadassembly 权限失败: ${error.message}`);
      // 尝试使用 sudo（可能需要无密码 sudo 配置）
      this.logger.warn(
        '如果权限不足，请手动执行: sudo chmod -R 777 runtime/linux/mxcad'
      );
    }
  }

  /**
   * 设置 mx/so 共享库权限
   */
  private async setSharedLibraryPermissions(mxcadDir: string): Promise<void> {
    const mxSoPath = path.join(mxcadDir, 'mx', 'so');

    if (!fs.existsSync(mxSoPath)) {
      this.logger.warn(`mx/so 目录不存在: ${mxSoPath}`);
      return;
    }

    try {
      // 设置共享库目录权限
      await execAsync(`chmod -R 755 "${mxSoPath}"`);
      this.logger.log(`已设置 mx/so 目录权限`);
    } catch (error) {
      this.logger.error(`设置 mx/so 权限失败: ${error.message}`);
      this.logger.warn('如果权限不足，请手动执行: sudo chmod -R 777 ./mx/so/*');
    }
  }

  /**
   * 复制 locale 文件到系统目录
   */
  private async copyLocaleFiles(mxcadDir: string): Promise<void> {
    const localeSourcePath = path.join(mxcadDir, 'mx', 'locale');
    const localeTargetPath = '/usr/local/share/locale';

    if (!fs.existsSync(localeSourcePath)) {
      this.logger.warn(`locale 目录不存在: ${localeSourcePath}`);
      return;
    }

    try {
      // 检查目标目录是否存在
      if (!fs.existsSync(localeTargetPath)) {
        await execAsync(`mkdir -p "${localeTargetPath}"`);
      }

      // 复制 locale 文件
      await execAsync(`cp -r -f "${localeSourcePath}" "${localeTargetPath}"`);
      this.logger.log(`已复制 locale 文件到系统目录`);
    } catch (error) {
      this.logger.error(`复制 locale 文件失败: ${error.message}`);
      this.logger.warn(
        '如果权限不足，请手动执行: sudo cp -r -f ./mx/locale /usr/local/share/locale'
      );
    }
  }

  /**
   * 检查 Linux 环境是否已正确配置
   */
  async checkEnvironment(): Promise<{
    isConfigured: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // 检查 MX 是否可用（所有平台）
    const mxCheck = checkMxAvailableSync();
    if (!mxCheck.available) {
      issues.push(`MX 不可用: ${mxCheck.message}`);
    }

    if (os.platform() !== 'linux') {
      return { isConfigured: issues.length === 0, issues };
    }

    const mxcadDir = this.mxcadDir;

    // 跨平台误配置检测：Linux 上以 .exe 结尾的一定是 Windows 路径
    if (path.extname(this.mxcadBinPath).toLowerCase() === '.exe') {
      issues.push(`MXCAD_ASSEMBLY_PATH 指向 Windows 可执行文件: ${this.mxcadBinPath}`);
    }

    // 检查主程序是否存在且可执行
    if (!fs.existsSync(this.mxcadBinPath)) {
      issues.push(`mxcadassembly 程序不存在: ${this.mxcadBinPath}`);
    } else {
      try {
        await fs.promises.access(this.mxcadBinPath, fs.constants.X_OK);
      } catch {
        issues.push(`mxcadassembly 程序没有可执行权限: ${this.mxcadBinPath}`);
      }
    }

    // 检查 mx/so 目录
    const mxSoPath = path.join(mxcadDir, 'mx', 'so');
    if (!fs.existsSync(mxSoPath)) {
      issues.push('mx/so 共享库目录不存在');
    }

    // 检查 locale 文件
    const localeSourcePath = path.join(mxcadDir, 'mx', 'locale');
    const localeTargetPath = '/usr/local/share/locale';
    if (fs.existsSync(localeSourcePath)) {
      const localeName = path.basename(localeSourcePath);
      if (!fs.existsSync(path.join(localeTargetPath, localeName))) {
        issues.push('locale 文件未复制到系统目录');
      }
    }

    return {
      isConfigured: issues.length === 0,
      issues,
    };
  }
}
