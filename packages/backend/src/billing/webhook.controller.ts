import { Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { WechatIpGuard } from './wechat-ip.guard';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import type { Request, Response } from 'express';

@ApiTags('Billing Webhook')
@Controller('billing/webhook')
export class WebhookController {
  constructor(
    private billingService: BillingService,
    private runtimeConfigService: RuntimeConfigService,
  ) {}

  @Post('wechat')
  @UseGuards(WechatIpGuard)
  @ApiExcludeEndpoint()
  async wechatNotify(@Req() req: Request, @Res() res: Response) {
    const enabled = await this.runtimeConfigService.getValue<boolean>('paymentEnabled', false);
    if (!enabled) {
      res.setHeader('Content-Type', 'application/xml');
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
    res.send(result);
  }
}
