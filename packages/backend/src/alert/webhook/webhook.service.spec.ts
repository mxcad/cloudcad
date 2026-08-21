import { Test, type TestingModule } from '@nestjs/testing';
import { AlertLevel } from '../enums/alert.enum';
import { WebhookService } from './webhook.service';

describe('WebhookService', () => {
  const originalUrl = process.env.ALERT_WEBHOOK_URL;
  const originalTemplate = process.env.ALERT_WEBHOOK_TEMPLATE;

  const baseInput = {
    message: '磁盘剩余空间不足',
    level: AlertLevel.WARNING,
    source: 'disk-monitor',
    timestamp: new Date('2026-08-11T10:00:00.000Z'),
    detail: { free: '12.3GB', total: '100GB', path: 'D:' },
  };

  const createService = async (): Promise<WebhookService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhookService],
    }).compile();
    return module.get<WebhookService>(WebhookService);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.ALERT_WEBHOOK_URL;
    } else {
      process.env.ALERT_WEBHOOK_URL = originalUrl;
    }
    if (originalTemplate === undefined) {
      delete process.env.ALERT_WEBHOOK_TEMPLATE;
    } else {
      process.env.ALERT_WEBHOOK_TEMPLATE = originalTemplate;
    }
  });

  // ==================== 条件启用 ====================
  describe('when ALERT_WEBHOOK_URL is not configured', () => {
    it('should be disabled and send nothing', async () => {
      delete process.env.ALERT_WEBHOOK_URL;
      const service = await createService();

      expect(service.isEnabled).toBe(false);
      await service.send(baseInput);

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('when ALERT_WEBHOOK_URL is configured', () => {
    it('should be enabled', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://example.com/hook';
      const service = await createService();

      expect(service.isEnabled).toBe(true);
    });

    it('should POST rendered template with JSON content type', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://example.com/hook';
      const service = await createService();
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
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const body = (global.fetch as jest.Mock).mock.calls[0][1].body;
      expect(body).toContain('磁盘剩余空间不足');
      expect(body).toContain('WARNING');
      expect(body).toContain('disk-monitor');
    });

    // ==================== 失败不阻断 ====================
    describe('when webhook request fails', () => {
      it('should not throw on network error', async () => {
        process.env.ALERT_WEBHOOK_URL = 'https://example.com/hook';
        const service = await createService();
        (global.fetch as jest.Mock).mockRejectedValue(
          new Error('ECONNREFUSED')
        );

        await expect(service.send(baseInput)).resolves.toBeUndefined();
      });

      it('should not throw on non-2xx response', async () => {
        process.env.ALERT_WEBHOOK_URL = 'https://example.com/hook';
        const service = await createService();
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });

        await expect(service.send(baseInput)).resolves.toBeUndefined();
      });
    });
  });

  // ==================== 模板渲染 ====================
  describe('render', () => {
    it('should replace all placeholders with escaped values', async () => {
      const service = await createService();

      const rendered = service.render(baseInput);

      expect(rendered).toContain('"content":"[WARNING] disk-monitor 2026-08-11T10:00:00.000Z');
      expect(rendered).toContain('磁盘剩余空间不足');
      expect(rendered).toContain(
        '{\\"free\\":\\"12.3GB\\",\\"total\\":\\"100GB\\",\\"path\\":\\"D:\\"}'
      );
    });

    it('should produce valid JSON parseable by JSON.parse', async () => {
      const service = await createService();

      const rendered = service.render(baseInput);

      expect(() => JSON.parse(rendered)).not.toThrow();
      const parsed = JSON.parse(rendered) as {
        text: { content: string };
      };
      expect(parsed.text.content).toContain('磁盘剩余空间不足');
      expect(parsed.text.content).toContain(
        '{"free":"12.3GB","total":"100GB","path":"D:"}'
      );
    });

    it('should escape quotes in message to keep template JSON valid', async () => {
      const service = await createService();

      const rendered = service.render({
        ...baseInput,
        message: '磁盘 "C:" 空间不足',
      });

      expect(rendered).toContain('磁盘 \\"C:\\" 空间不足');
    });

    it('should use current time when timestamp is omitted', async () => {
      const service = await createService();

      const rendered = service.render({ ...baseInput, timestamp: undefined });

      expect(rendered).toMatch(
        /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/
      );
    });

    it('should render empty detail when detail is omitted', async () => {
      const service = await createService();

      const rendered = service.render({ ...baseInput, detail: undefined });

      expect(rendered).toContain('磁盘剩余空间不足\\n"}}');
    });

    it('should use custom template from env', async () => {
      process.env.ALERT_WEBHOOK_TEMPLATE = '{"text":"{{source}}:{{level}} {{message}}"}';
      const service = await createService();

      const rendered = service.render(baseInput);

      expect(rendered).toBe(
        '{"text":"disk-monitor:WARNING 磁盘剩余空间不足"}'
      );
    });

    it('should keep unknown placeholders untouched', async () => {
      process.env.ALERT_WEBHOOK_TEMPLATE = '{"text":"{{unknown}} {{message}}"}';
      const service = await createService();

      const rendered = service.render(baseInput);

      expect(rendered).toBe('{"text":"{{unknown}} 磁盘剩余空间不足"}');
    });
  });
});
