///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import {
  extRefDiskFileName,
  extRefDiskCandidates,
} from '@cloudcad/contracts';

/**
 * 外部参照转换产物落位 util（单一事实源，登录态/游客态共用）。
 *
 * 外部参照的「磁盘名」约定（契约在 @cloudcad/contracts/files/ext-ref-naming）：
 * CAD 类（.dwg/.dxf/.dwt）落盘为 `{逻辑名}.mxweb`，图片/其它用原名。引擎按
 * `src_file_md5` 自定产物名（`{fileHash}.{srcExt}.mxweb`），因此转换成功后必须
 * 把产物**落位**为外部参照标准磁盘名，否则读取方按 `{逻辑名}.mxweb` 查找落空。
 *
 * 此前登录态（ExternalRefService.handleExternalReferenceFile）与游客态
 * （PublicFileService.uploadExtReference DWG 分支）各自实现：登录态有 copyFile、
 * 游客态只假设不拷贝——后者正是「外部参照上传无效」的根因。本服务把这两步收敛
 * 为同一实现，杜绝再次失配。
 */
@Injectable()
export class ExtRefStorageService {
  private readonly logger = new Logger(ExtRefStorageService.name);

  /**
   * 把引擎转换产物落位为外部参照标准磁盘名。
   *
   * @param srcFilePath 引擎产物路径（`{fileHash}.{srcExt}.mxweb`，转换成功即存在）
   * @param targetDir   目标目录（登录态 externalRefDir / 游客态 srcDir）
   * @param logicalName 外部参照逻辑名（`block.dwg`，不含 `.mxweb`；调用方负责
   *                    basename/路径遍历防护，本服务不额外清洗）
   * @returns 落位后的目标完整路径
   * @throws NotFoundException 产物缺失（引擎转换成功但未产出，属异常）
   */
  async stageConvertedExtRefArtifact(opts: {
    srcFilePath: string;
    targetDir: string;
    logicalName: string;
  }): Promise<string> {
    const { srcFilePath, targetDir, logicalName } = opts;
    const targetFile = path.join(targetDir, extRefDiskFileName(logicalName));

    // 幂等：引擎产物已按目标磁盘名落位（公开上传的临时文件 = {logicalName}，
    // 引擎按临时文件完整名自定产物名 {logicalName}.mxweb），拷贝自身无意义，
    // Node copyFile 源=目标还会抛错。此时直接返回，跳过拷贝。
    if (path.resolve(srcFilePath) === path.resolve(targetFile)) {
      this.logger.log(
        `[stageConvertedExtRefArtifact] 产物已按目标磁盘名就位，跳过拷贝: ${targetFile}`
      );
      return targetFile;
    }

    if (!fs.existsSync(srcFilePath)) {
      throw new NotFoundException(
        I18nContext.current()?.t(
          'error.file_extra.converted_file_not_exist',
          { args: { path: srcFilePath } }
        ) ?? `转换后的文件不存在: ${srcFilePath}`
      );
    }

    await fsPromises.copyFile(srcFilePath, targetFile);
    this.logger.log(
      `[stageConvertedExtRefArtifact] 产物落位成功: ${targetFile}`
    );
    return targetFile;
  }

  /**
   * 按候选集查找外部参照磁盘文件（检查存在 / 文件解析 / 下载共用）。
   *
   * 候选集顺序见 `extRefDiskCandidates`：标准磁盘名 → 逻辑名本身 →
   * 旧格式兼容（`{baseName}.mxweb`）。这消除了「检查存在只查标准名、文件解析走
   * 双候选」的分歧——同一文件不再「解析能命中、检查存在却报缺失」。
   *
   * @param targetDir   查找目录
   * @param logicalName 外部参照逻辑名
   * @returns 命中的完整路径，未命中返回 null
   */
  async findExtRefCandidate(
    targetDir: string,
    logicalName: string
  ): Promise<string | null> {
    for (const candidate of extRefDiskCandidates(logicalName)) {
      const candidatePath = path.join(targetDir, candidate);
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }
    return null;
  }
}
