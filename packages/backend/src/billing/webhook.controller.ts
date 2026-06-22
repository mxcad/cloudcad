import { Controller, Post, Req, Res } from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import type { Request, Response } from 'express';

@ApiTags('Billing Webhook')
@Controller('billing/webhook')
export class WebhookController {
  constructor(private billingService: BillingService) {}

  @Post('wechat')
  @ApiExcludeEndpoint()
  async wechatNotify(@Req() req: Request, @Res() res: Response) {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const xml = typeof rawBody === 'string' ? rawBody : String(rawBody);
    const result = await this.billingService.handleWechatNotify(xml);
    res.setHeader('Content-Type', 'application/xml');
    res.send(result);
  }
}
