import { validate, type ValidationError } from 'class-validator';
import {
  BATCH_DOWNLOAD_FORMATS,
  BatchFileItem,
  CreateBatchDownloadDto,
  CreateSingleFormatDownloadDto,
} from './create-batch-download.dto';

/** 展平嵌套校验错误（@ValidateNested 的字段错误落在 children 上） */
function flatten(errors: ValidationError[]): ValidationError[] {
  return errors.flatMap((e) => [e, ...flatten(e.children ?? [])]);
}

function messageHits(errors: ValidationError[]): boolean {
  return flatten(errors).some((e) =>
    Object.values(e.constraints ?? {}).includes('无效的目标格式')
  );
}

/** 单文件格式下载 DTO（单文件路由的 body） */
function singleFileDto(
  overrides: Partial<CreateSingleFormatDownloadDto>
): CreateSingleFormatDownloadDto {
  return Object.assign(new CreateSingleFormatDownloadDto(), {
    nodeId: 'node-1',
    fileName: 'a.mxweb',
    format: 'dwg',
    ...overrides,
  });
}

/** 批量下载 DTO：fileList 元素须为 BatchFileItem 实例，@ValidateNested 才会下钻 */
function batchDto(formats: string[]): CreateBatchDownloadDto {
  const item = Object.assign(new BatchFileItem(), {
    nodeId: 'node-1',
    fileName: 'a.mxweb',
    formats,
  });
  return Object.assign(new CreateBatchDownloadDto(), { fileList: [item] });
}

describe('CreateSingleFormatDownloadDto — format 白名单', () => {
  it.each(BATCH_DOWNLOAD_FORMATS)('接受白名单格式 %s', async (format) => {
    const errors = await validate(singleFileDto({ format }));
    expect(errors).toHaveLength(0);
  });

  it('original 属白名单（orchestrator tryAddOriginal 直通，不转换不受门控）', async () => {
    const errors = await validate(singleFileDto({ format: 'original' }));
    expect(errors).toHaveLength(0);
  });

  it.each(['svg', 'OBJ', '', 'mxweb;drop'])('拒绝未知格式 %j', async (format) => {
    const errors = await validate(singleFileDto({ format }));
    expect(messageHits(errors)).toBe(true);
    expect(flatten(errors).some((e) => e.property === 'format')).toBe(true);
  });
});

describe('CreateBatchDownloadDto — fileList[].formats 白名单（each）', () => {
  it('全白名单组合通过', async () => {
    const errors = await validate(batchDto(['mxweb', 'dwg', 'dxf', 'pdf', 'original']));
    expect(errors).toHaveLength(0);
  });

  it('数组中混入一个未知格式即拒绝', async () => {
    const errors = await validate(batchDto(['dwg', 'svg']));
    expect(messageHits(errors)).toBe(true);
    expect(flatten(errors).some((e) => e.property === 'formats')).toBe(true);
  });
});
