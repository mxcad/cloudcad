import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { InternalAlertController } from './internal-alert.controller';
import { AlertService } from './alert.service';
import { InternalSecretGuard } from '../common/guards/internal-secret.guard';
import { AlertLevel, AlertStatus } from './enums/alert.enum';
import { INTERNAL_SERVICE_SECRET_HEADER } from '../common/utils/internal-service-auth';

const SECRET = 'test-internal-secret';

describe('InternalAlertController', () => {
  let app: INestApplication;
  let mockAlertService: { raise: jest.Mock };
  let mockConfigService: { get: jest.Mock };

  const mockRecord = {
    id: 'alert-internal-1',
    source: 'antivirus-scan',
    messageKey: 'malware_detected',
    level: AlertLevel.P1,
    message: '检出恶意文件',
    detail: { files: ['a.mxweb'] },
    status: AlertStatus.OPEN,
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const validBody = {
    source: 'antivirus-scan',
    messageKey: 'malware_detected',
    level: AlertLevel.P1,
    message: '检出恶意文件',
    detail: { files: ['a.mxweb'] },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAlertService = { raise: jest.fn().mockResolvedValue(mockRecord) };
    mockConfigService = { get: jest.fn() };
    // 仅 INTERNAL_SERVICE_SECRET 返回 SECRET，其余 key 返回 undefined
    mockConfigService.get.mockImplementation((key: string) =>
      key === 'INTERNAL_SERVICE_SECRET' ? SECRET : undefined
    );

    // 显式 override guard 并用 mock ConfigService 构造真实 InternalSecretGuard 实例：
    // 端到端验证密钥校验链路（避免依赖 Nest 向 @UseGuards 注入 ConfigService 的不确定性）。
    // guard 的纯逻辑单测见 common/guards/internal-secret.guard.spec.ts
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalAlertController],
      providers: [{ provide: AlertService, useValue: mockAlertService }],
    })
      .overrideGuard(InternalSecretGuard)
      .useValue(new InternalSecretGuard(mockConfigService as never))
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('无密钥头 → 401，且不调用 AlertService', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/alert/raise')
      .send(validBody);

    expect(res.status).toBe(401);
    expect(mockAlertService.raise).not.toHaveBeenCalled();
  });

  it('密钥头错误 → 401，且不调用 AlertService', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/alert/raise')
      .set(INTERNAL_SERVICE_SECRET_HEADER, 'wrong-secret')
      .send(validBody);

    expect(res.status).toBe(401);
    expect(mockAlertService.raise).not.toHaveBeenCalled();
  });

  it('密钥头正确 → 200，透传字段调用 AlertService.raise 并返回记录', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/alert/raise')
      .set(INTERNAL_SERVICE_SECRET_HEADER, SECRET)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(mockAlertService.raise).toHaveBeenCalledWith({
      source: 'antivirus-scan',
      messageKey: 'malware_detected',
      level: AlertLevel.P1,
      message: '检出恶意文件',
      detail: { files: ['a.mxweb'] },
    });
    // HTTP 响应经 JSON 序列化：Date 字段变为 ISO 字符串
    expect(res.body).toEqual({
      ...mockRecord,
      createdAt: mockRecord.createdAt.toISOString(),
      updatedAt: mockRecord.updatedAt.toISOString(),
    });
  });

  it('detail 可省略：raise 收到 detail=undefined', async () => {
    const { detail: _detail, ...bodyWithoutDetail } = validBody;

    const res = await request(app.getHttpServer())
      .post('/internal/alert/raise')
      .set(INTERNAL_SERVICE_SECRET_HEADER, SECRET)
      .send(bodyWithoutDetail);

    expect(res.status).toBe(200);
    expect(mockAlertService.raise).toHaveBeenCalledWith(
      expect.objectContaining({ detail: undefined })
    );
  });

  it('level 非法值 → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/alert/raise')
      .set(INTERNAL_SERVICE_SECRET_HEADER, SECRET)
      .send({ ...validBody, level: 'CRITICAL' });

    expect(res.status).toBe(400);
    expect(mockAlertService.raise).not.toHaveBeenCalled();
  });

  it('source 缺失 → 400', async () => {
    const { source: _source, ...bodyWithoutSource } = validBody;

    const res = await request(app.getHttpServer())
      .post('/internal/alert/raise')
      .set(INTERNAL_SERVICE_SECRET_HEADER, SECRET)
      .send(bodyWithoutSource);

    expect(res.status).toBe(400);
    expect(mockAlertService.raise).not.toHaveBeenCalled();
  });
});
