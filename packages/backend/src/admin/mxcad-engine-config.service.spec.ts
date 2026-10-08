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

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { runMxcadAssembly } from '@cloudcad/engine-exec';

// 只 mock 真正起子进程的 runMxcadAssembly；结果解析层（salvageSuccessResult）保持真实实现
jest.mock('@cloudcad/engine-exec', () => {
  const actual = jest.requireActual('@cloudcad/engine-exec');
  return { ...actual, runMxcadAssembly: jest.fn() };
});

import { MxcadEngineConfigService } from './mxcad-engine-config.service';

const mockRun = runMxcadAssembly as unknown as jest.Mock;

const INI_NAME = 'mxcad_ini.json';

/** 与部署包同形的真实 ini 骨架（dwg 子对象 + 顶层 direct_write_log，无 coordinate_log_enable） */
const REAL_INI = JSON.stringify({
  dwg: {
    read_exdata: false,
    cpp_server_port: 3090,
    test_log: false,
  },
  direct_write_log: false,
});

describe('MxcadEngineConfigService', () => {
  let engineDir: string;
  let service: MxcadEngineConfigService;

  const iniPath = () => path.join(engineDir, INI_NAME);
  const writeIni = (content: string) =>
    fs.writeFile(iniPath(), content, 'utf-8');
  const readIni = () => fs.readFile(iniPath(), 'utf-8');

  const makeRunResult = (overrides: Record<string, unknown> = {}) => ({
    stdout: '',
    stderr: '',
    exitCode: 0,
    signal: null,
    timedOut: false,
    ...overrides,
  });

  beforeEach(async () => {
    engineDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mxcad-ini-test-'));
    const moduleRef = await Test.createTestingModule({
      providers: [
        MxcadEngineConfigService,
        {
          provide: ConfigService,
          useValue: {
            get: () => path.join(engineDir, 'mxcadassembly.exe'),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(MxcadEngineConfigService);
  });

  afterEach(async () => {
    await fs.rm(engineDir, { recursive: true, force: true });
  });

  describe('getCoordinateLogEnabled', () => {
    it('ini 不存在（首次部署）视为关闭', async () => {
      await expect(service.getCoordinateLogEnabled()).resolves.toBe(false);
    });

    it('真实骨架 ini 无该键视为关闭，有该键按值返回', async () => {
      await writeIni(REAL_INI);
      await expect(service.getCoordinateLogEnabled()).resolves.toBe(false);

      await writeIni(
        JSON.stringify({ dwg: {}, coordinate_log_enable: true })
      );
      await expect(service.getCoordinateLogEnabled()).resolves.toBe(true);
    });

    it('容忍 UTF-8 BOM（Windows 记事本保存）', async () => {
      await writeIni('\uFEFF{"coordinate_log_enable":true}');
      await expect(service.getCoordinateLogEnabled()).resolves.toBe(true);
    });

    it('ini 不是有效 JSON 抛 500（管理员必须看到，不能静默当关闭）', async () => {
      await writeIni('{ not-json');
      await expect(service.getCoordinateLogEnabled()).rejects.toBeInstanceOf(
        InternalServerErrorException
      );
    });
  });

  describe('setCoordinateLogEnabled', () => {
    it('文件不存在时新建仅含该键的文件，回显 enabled 且不拉起引擎进程', async () => {
      mockRun.mockResolvedValue(makeRunResult({}));

      await expect(service.setCoordinateLogEnabled(true)).resolves.toEqual({
        enabled: true,
        logPath: null,
      });
      expect(JSON.parse(await readIni())).toEqual({
        coordinate_log_enable: true,
      });
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('upsert 顶层键且保留 dwg 子对象与其余键，再写覆盖旧值', async () => {
      await writeIni(REAL_INI);

      await service.setCoordinateLogEnabled(true);
      let data = JSON.parse(await readIni());
      expect(data.coordinate_log_enable).toBe(true);
      expect(data.direct_write_log).toBe(false);
      expect(data.dwg).toEqual({
        read_exdata: false,
        cpp_server_port: 3090,
        test_log: false,
      });

      await service.setCoordinateLogEnabled(false);
      data = JSON.parse(await readIni());
      expect(data.coordinate_log_enable).toBe(false);
      expect(data.direct_write_log).toBe(false);
    });

    it('写失败（如文件只读）抛 500 且不落半截内容', async () => {
      await writeIni(REAL_INI);
      // node:fs/promises 属性不可 redefine，无法 spyOn——用真实只读文件触发写失败
      // （Windows 置只读属性，Linux 权限位，两平台写均拒绝）
      await fs.chmod(iniPath(), 0o444);
      try {
        await expect(
          service.setCoordinateLogEnabled(true)
        ).rejects.toBeInstanceOf(InternalServerErrorException);
        // 原文件未被破坏
        expect(JSON.parse(await readIni())).toEqual(JSON.parse(REAL_INI));
      } finally {
        await fs.chmod(iniPath(), 0o644);
      }
    });
  });

  describe('getLogPath / getCachedLogPath', () => {
    it('about 输出 code=0 时提取 local_path，并以引擎目录为 cwd 调引擎', async () => {
      mockRun.mockResolvedValue(
        makeRunResult({
          stdout: JSON.stringify({
            code: 0,
            version: 'MxCAD 7.0',
            local_path: 'C:/Users/MxDrawHome/AppData/Local/MxWebCAD/',
          }),
        })
      );

      await expect(service.getLogPath()).resolves.toBe(
        'C:/Users/MxDrawHome/AppData/Local/MxWebCAD/'
      );
      expect(mockRun).toHaveBeenCalledWith(
        path.join(engineDir, 'mxcadassembly.exe'),
        JSON.stringify({ about: true }),
        expect.objectContaining({ cwd: engineDir })
      );
    });

    it('code=0 但缺 local_path 返回 null', async () => {
      mockRun.mockResolvedValue(
        makeRunResult({ stdout: JSON.stringify({ code: 0 }) })
      );
      await expect(service.getLogPath()).resolves.toBeNull();
    });

    it('探测失败（spawn 失败/非零 code）返回 null 且不缓存，下次重新探测', async () => {
      mockRun
        .mockResolvedValueOnce(
          makeRunResult({ stderr: 'ENOENT', exitCode: null })
        )
        .mockResolvedValueOnce(
          makeRunResult({ stdout: JSON.stringify({ code: 1, message: 'x' }) })
        );

      await expect(service.getLogPath()).resolves.toBeNull();
      await expect(service.getLogPath()).resolves.toBeNull();
      expect(mockRun).toHaveBeenCalledTimes(2);
    });

    it('成功结果进程内缓存（TTL 内），重复 GET 与 getCachedLogPath 不再拉起引擎进程', async () => {
      mockRun.mockResolvedValue(
        makeRunResult({
          stdout: JSON.stringify({ code: 0, local_path: 'C:/lp/' }),
        })
      );

      await expect(service.getLogPath()).resolves.toBe('C:/lp/');
      await expect(service.getLogPath()).resolves.toBe('C:/lp/');

      mockRun.mockClear();
      expect(service.getCachedLogPath()).toBe('C:/lp/');
      await expect(service.getLogPath()).resolves.toBe('C:/lp/');
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('getCachedLogPath 在从未探测过时返回 null 且不拉起引擎进程', () => {
      mockRun.mockResolvedValue(makeRunResult({}));
      expect(service.getCachedLogPath()).toBeNull();
      expect(mockRun).not.toHaveBeenCalled();
    });
  });
});
