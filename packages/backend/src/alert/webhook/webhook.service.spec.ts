import { Test, type TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { AlertLevel } from '../enums/alert.enum';
import { WebhookService } from './webhook.service';

/** 与 alertWebhookTemplate 键 defaultValue 同源（钉钉/企业微信兼容 text 结构） */
const DEFAULT_TEMPLATE =
  '{"msgtype":"text","text":{"content":"[{{level}}] {{source}} {{timestamp}}\\n{{message}}\\n{{detail}}"}}';

describe('WebhookService', () => {
  const baseInput = {
    message: '磁盘剩余空间不足',
    level: AlertLevel.P1,
    source: 'disk-monitor',
    timestamp: new Date('2026-08-11T10:00:00.000Z'),
    detail: { free: '12.3GB', total: '100GB', path: 'D:' },
  };

  /** 可变 values 对象：getValue 每次调用读当前值，模拟三层解析的热读语义 */
  const createService = async (
    values: Record<string, unknown>
  ): Promise<{ service: WebhookService; getValue: jest.Mock }> => {
    const getValue = jest.fn(async (key: string) => values[key]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: ClsService, useValue: { get: jest.fn() } },
        {
          provide: RuntimeConfigService,
          useValue: { getValue },
        },
      ],
    }).compile();
    return { service: module.get<WebhookService>(WebhookService), getValue };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  // ==================== 条件启用（开关 + URL 双判据） ====================
  describe('channel gating', () => {
    it('开关关 → 不发送（即使 URL 已配置）', async () => {
      const { service } = await createService({
        alertWebhookEnabled: false,
        alertWebhookUrl: 'https://example.com/hook',
        alertWebhookTemplate: DEFAULT_TEMPLATE,
      });

      expect(await service.isEnabled()).toBe(false);
      await service.send(baseInput);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('开关开但 URL 为空 → 不发送（等同关闭）', async () => {
      const { service } = await createService({
        alertWebhookEnabled: true,
        alertWebhookUrl: '',
        alertWebhookTemplate: DEFAULT_TEMPLATE,
      });

      expect(await service.isEnabled()).toBe(false);
      await service.send(baseInput);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('开关开 + URL 已配置 → 启用', async () => {
      const { service } = await createService({
        alertWebhookEnabled: true,
        alertWebhookUrl: 'https://example.com/hook',
        alertWebhookTemplate: DEFAULT_TEMPLATE,
      });

      expect(await service.isEnabled()).toBe(true);
    });
  });

  // ==================== 发送 ====================
  describe('send', () => {
    it('should POST rendered template with JSON content type', async () => {
      const { service } = await createService({
        alertWebhookEnabled: true,
        alertWebhookUrl: 'https://example.com/hook',
        alertWebhookTemplate: DEFAULT_TEMPLATE,
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      await service.send(baseInput);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/hook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            // #309 出站追踪头：无 CLS 上下文时也应注入自生成的 X-Request-Id
            'X-Request-Id': expect.any(String),
            'X-Trace-Id': expect.any(String),
          }),
        })
      );
      const body = (global.fetch as jest.Mock).mock.calls[0][1].body;
      expect(body).toContain('磁盘剩余空间不足');
      expect(body).toContain('P1');
      expect(body).toContain('disk-monitor');
    });

    // ==================== 失败不阻断 ====================
    describe('when webhook request fails', () => {
      it('should not throw on network error', async () => {
        const { service } = await createService({
          alertWebhookEnabled: true,
          alertWebhookUrl: 'https://example.com/hook',
          alertWebhookTemplate: DEFAULT_TEMPLATE,
        });
        (global.fetch as jest.Mock).mockRejectedValue(
          new Error('ECONNREFUSED')
        );

        await expect(service.send(baseInput)).resolves.toBeUndefined();
      });

      it('should not throw on non-2xx response', async () => {
        const { service } = await createService({
          alertWebhookEnabled: true,
          alertWebhookUrl: 'https://example.com/hook',
          alertWebhookTemplate: DEFAULT_TEMPLATE,
        });
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });

        await expect(service.send(baseInput)).resolves.toBeUndefined();
      });
    });
  });

  // ==================== 惰性热读（ADR-0082 三期 #506） ====================
  describe('hot re-read', () => {
    it('配置改写后下一次发送即用新值（无需重启）', async () => {
      const values: Record<string, unknown> = {
        alertWebhookEnabled: true,
        alertWebhookUrl: 'https://old.example.com/hook',
        alertWebhookTemplate: DEFAULT_TEMPLATE,
      };
      const { service } = await createService(values);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      await service.send(baseInput);
      values.alertWebhookUrl = 'https://new.example.com/hook';
      await service.send(baseInput);

      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        'https://old.example.com/hook',
        expect.anything()
      );
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        'https://new.example.com/hook',
        expect.anything()
      );
    });

    it('开关改写为关 → 立即停止发送', async () => {
      const values: Record<string, unknown> = {
        alertWebhookEnabled: true,
        alertWebhookUrl: 'https://example.com/hook',
        alertWebhookTemplate: DEFAULT_TEMPLATE,
      };
      const { service } = await createService(values);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      await service.send(baseInput);
      values.alertWebhookEnabled = false;
      await service.send(baseInput);

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== 模板渲染 ====================
  describe('render', () => {
    it('should replace all placeholders with escaped values', () => {
      const service = new WebhookService(
        { get: jest.fn() } as unknown as ClsService,
        { getValue: jest.fn() } as unknown as RuntimeConfigService
      );

      const rendered = service.render(baseInput, DEFAULT_TEMPLATE);

      expect(rendered).toContain('"content":"[P1] disk-monitor 2026-08-11T10:00:00.000Z');
      expect(rendered).toContain('磁盘剩余空间不足');
      expect(rendered).toContain(
        '{\\"free\\":\\"12.3GB\\",\\"total\\":\\"100GB\\",\\"path\\":\\"D:\\"}'
      );
    });

    it('should produce valid JSON parseable by JSON.parse', () => {
      const service = new WebhookService(
        { get: jest.fn() } as unknown as ClsService,
        { getValue: jest.fn() } as unknown as RuntimeConfigService
      );

      const rendered = service.render(baseInput, DEFAULT_TEMPLATE);

      expect(() => JSON.parse(rendered)).not.toThrow();
      const parsed = JSON.parse(rendered) as {
        text: { content: string };
      };
      expect(parsed.text.content).toContain('磁盘剩余空间不足');
      expect(parsed.text.content).toContain(
        '{"free":"12.3GB","total":"100GB","path":"D:"}'
      );
    });

    it('should escape quotes in message to keep template JSON valid', () => {
      const service = new WebhookService(
        { get: jest.fn() } as unknown as ClsService,
        { getValue: jest.fn() } as unknown as RuntimeConfigService
      );

      const rendered = service.render(
        { ...baseInput, message: '磁盘 "C:" 空间不足' },
        DEFAULT_TEMPLATE
      );

      expect(rendered).toContain('磁盘 \\"C:\\" 空间不足');
    });

    it('should use current time when timestamp is omitted', () => {
      const service = new WebhookService(
        { get: jest.fn() } as unknown as ClsService,
        { getValue: jest.fn() } as unknown as RuntimeConfigService
      );

      const rendered = service.render(
        { ...baseInput, timestamp: undefined },
        DEFAULT_TEMPLATE
      );

      expect(rendered).toMatch(
        /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/
      );
    });

    it('should render empty detail when detail is omitted', () => {
      const service = new WebhookService(
        { get: jest.fn() } as unknown as ClsService,
        { getValue: jest.fn() } as unknown as RuntimeConfigService
      );

      const rendered = service.render(
        { ...baseInput, detail: undefined },
        DEFAULT_TEMPLATE
      );

      expect(rendered).toContain('磁盘剩余空间不足\\n"}}');
    });

    it('should use custom template', () => {
      const service = new WebhookService(
        { get: jest.fn() } as unknown as ClsService,
        { getValue: jest.fn() } as unknown as RuntimeConfigService
      );

      const rendered = service.render(
        baseInput,
        '{"text":"{{source}}:{{level}} {{message}}"}'
      );

      expect(rendered).toBe(
        '{"text":"disk-monitor:P1 磁盘剩余空间不足"}'
      );
    });

    it('should keep unknown placeholders untouched', () => {
      const service = new WebhookService(
        { get: jest.fn() } as unknown as ClsService,
        { getValue: jest.fn() } as unknown as RuntimeConfigService
      );

      const rendered = service.render(
        baseInput,
        '{"text":"{{unknown}} {{message}}"}'
      );

      expect(rendered).toBe('{"text":"{{unknown}} 磁盘剩余空间不足"}');
    });
  });
});
