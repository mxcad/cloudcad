import { Controller, Logger, Post, Req, Res, UseGuards, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { WechatIpGuard } from './wechat-ip.guard';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import type { Request, Response } from 'express';

@ApiTags('Billing Webhook')
@Controller('billing/webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private billingService: BillingService,
    private runtimeConfigService: RuntimeConfigService,
  ) {}

  @Post('wechat')
  @Version(VERSION_NEUTRAL)
  @UseGuards(WechatIpGuard)
  @ApiExcludeEndpoint()
  async wechatNotify(@Req() req: Request, @Res() res: Response) {
    try {
      const enabled = await this.runtimeConfigService.getValue<boolean>('paymentEnabled', false);
      if (!enabled) {
        res.status(503).setHeader('Content-Type', 'application/xml');
        res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[payment disabled]]></return_msg></xml>');
        return;
      }

      const rawBody: string = (req as any).rawBody || '';
      if (!rawBody) {
        res.status(400).setHeader('Content-Type', 'application/xml');
        res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[empty body]]></return_msg></xml>');
        return;
      }
      const result = await this.billingService.handleWechatNotify(rawBody);
      res.setHeader('Content-Type', 'application/xml');
      const isSuccess = result.includes('return_code><![CDATA[SUCCESS]]></return_code>');
      if (!isSuccess) {
        res.status(500);
      }
      res.send(result);
    } catch (e) {
      this.logger.error('wechatNotify unexpected error', e);
      res.status(500).setHeader('Content-Type', 'application/xml');
      res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[internal error]]></return_msg></xml>');
    }
  }
}
