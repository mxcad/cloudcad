const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { MXCAD_CONFIG } = require('../lib/constants');
const { log } = require('../lib/utils');

const execAsync = require('util').promisify(exec);

/**
 * MxCAD 转换执行器
 * 基于 FileConversionService.executeConversion 的逻辑
 */
class MxcadRunner {

  async execute(params, timeout) {
    const { srcPath, fileHash, createPreloadingData, outname, cmd, width, height, colorPolicy } = params;

    const absoluteSrcPath = this._resolvePath(srcPath);
    const param = {
      srcpath: absoluteSrcPath.replace(/\\/g, '/'),
      src_file_md5: fileHash || '',
      create_preloading_data: createPreloadingData !== false,
    };

    if (outname) param.outname = outname;
    if (cmd) param.cmd = cmd;
    if (width) param.width = String(width);
    if (height) param.height = String(height);
    if (colorPolicy) param.colorPolicy = colorPolicy;
    if (params.outjpg) param.outjpg = params.outjpg;
    if (params.roate_angle !== undefined) param.roate_angle = params.roate_angle;
    if (params.view_angle !== undefined) param.view_angle = params.view_angle;
    if (params.dwgVersion !== undefined) param.dwg_version = params.dwgVersion;
    if (params.layout_name) param.layout_name = params.layout_name;
    if (params.compression === false) param.compression = 0;

    const isLinux = os.platform() === 'linux';
    const originalDir = process.cwd();
    let changedDir = false;

    try {
      let commandStr;
      if (isLinux) {
        if (MXCAD_CONFIG.binPath) {
          process.chdir(MXCAD_CONFIG.binPath);
          changedDir = true;
        }
        const paramStr = JSON.stringify(param).replace(/"/g, "'");
        commandStr = `"${MXCAD_CONFIG.assemblyPath}" "${paramStr}"`;
      } else {
        commandStr = `"${MXCAD_CONFIG.assemblyPath}" ${JSON.stringify(param)}`;
      }

      log(`[MxcadRunner] 执行: ${commandStr}`);
      const execResult = await execAsync(commandStr, {
        encoding: 'utf8',
        // 默认执行超时 60s（原 MXCAD_CONFIG.defaultTimeout 被删：所有调用方均显式传
        // PRIORITY_CONFIG[*].timeout，该兜底恒不可达）。用 ?? 而非 ||：
        // 显式传 0 时尊重调用方意图（child_process 约定 timeout: 0 为禁用超时）。
        timeout: timeout ?? 60000,
        maxBuffer: MXCAD_CONFIG.maxBuffer,
      });

      const output = execResult.stdout || execResult.stderr || '';
      const parsed = this._parseOutput(output);

      if (parsed.code === 0) {
        log(`[MxcadRunner] 转换成功: ${srcPath}`);
        return { ...parsed, newpath: parsed.newpath || '' };
      }

      throw new Error(parsed.message || `转换失败, code=${parsed.code}`);
    } finally {
      if (changedDir) process.chdir(originalDir);
    }
  }

  _resolvePath(inputPath) {
    if (!inputPath) return inputPath;
    if (path.isAbsolute(inputPath)) return path.normalize(inputPath);
    return path.resolve(process.cwd(), inputPath);
  }

  _parseOutput(output) {
    let strOutput = String(output);
    const iPos = strOutput.lastIndexOf('{"code"');
    if (iPos !== -1) strOutput = strOutput.substring(iPos);
    try {
      return JSON.parse(strOutput);
    } catch (err) {
      log(`[MxcadRunner] 无法解析转换输出: ${err.message}`);
      return { code: 1, message: '转换输出格式错误', raw: strOutput.slice(0, 500) };
    }
  }
}

module.exports = MxcadRunner;
